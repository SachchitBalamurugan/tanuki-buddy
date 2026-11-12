// Tanuki Buddy — Electron main process.
const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, screen, dialog } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { SessionStore } = require("./sessions");
const { startServer } = require("./server");
const { trayIcon } = require("./icon");
const hooks = require("./hooks-installer");

// In a packaged build the hook script is unpacked next to app.asar so Node can run it.
const SEND_SCRIPT = app.isPackaged
  ? path.join(process.resourcesPath, "app.asar.unpacked", "hooks", "send.mjs")
  : path.join(__dirname, "..", "..", "hooks", "send.mjs");
const LOGIN = app.isPackaged ? { path: process.execPath } : { path: process.execPath, args: [app.getAppPath()] };

const BASE_W = 340, BASE_H = 360;
const SIZES = { small: 0.55, medium: 0.7, large: 0.9 };
const LABEL = { working: "working", approval: "needs you", done: "done", sleep: "napping" };
const NAME = { claude: "Claude", codex: "Codex" };

const SNAPSHOT = process.argv.some((a) => a.startsWith("--snapshot=") || a.startsWith("--icon="));
if (!SNAPSHOT && !app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
// Launching the app again (e.g. from the Start Menu) brings the tanuki back to the front.
app.on("second-instance", () => {
  if (!win || win.isDestroyed()) return;
  win.showInactive(); win.setAlwaysOnTop(true, "screen-saver"); win.moveTop();
  refreshTray?.();
});
app.setAppUserModelId("com.tanuki.buddy");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

const statePath = () => path.join(app.getPath("userData"), "tanuki-state.json");
let prefs = { muted: false, toasts: true, x: null, y: null, size: "small" };
try { prefs = { ...prefs, ...JSON.parse(fs.readFileSync(statePath(), "utf8")) }; } catch {}
const sizeArg = process.argv.find((a) => a.startsWith("--size="));
if (sizeArg) prefs.size = sizeArg.split("=")[1];
const savePrefs = () => { try { fs.writeFileSync(statePath(), JSON.stringify(prefs)); } catch {} };

let win, tray, store, lastSnap;
let dragOrigin = null;
const dims = () => { const f = SIZES[prefs.size] || Number(prefs.size) || SIZES.small; return { w: Math.round(BASE_W * f), h: Math.round(BASE_H * f) }; };

function defaultPos() {
  const { workArea } = screen.getPrimaryDisplay();
  const { w, h } = dims();
  return { x: workArea.x + workArea.width - w - 16, y: workArea.y + workArea.height - h };
}

function onScreen(x, y) {
  const { w: WIN_W, h: WIN_H } = dims();
  return screen.getAllDisplays().some(({ workArea: a }) =>
    x + WIN_W / 2 >= a.x && x + WIN_W / 2 <= a.x + a.width && y + WIN_H / 2 >= a.y && y + WIN_H / 2 <= a.y + a.height);
}

function createWindow() {
  const pos = prefs.x != null && onScreen(prefs.x, prefs.y) ? { x: prefs.x, y: prefs.y } : defaultPos();
  win = new BrowserWindow({
    width: dims().w, height: dims().h, ...pos,
    transparent: true, frame: false, resizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, hasShadow: false, alwaysOnTop: true, focusable: true, show: false,
    backgroundColor: "#00000000", title: "Tanuki Buddy",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  win.setAlwaysOnTop(true, "screen-saver");
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  // Windows can drop WS_EX_TOPMOST when a hidden window is first shown, so re-assert it after showing
  // and every few seconds (other apps going fullscreen/topmost can also push it down).
  const pinOnTop = () => { if (win && !win.isDestroyed() && win.isVisible()) { win.setAlwaysOnTop(true, "screen-saver"); win.moveTop(); } };
  win.once("ready-to-show", () => { win.showInactive(); pinOnTop(); });
  win.on("show", pinOnTop);
  setInterval(pinOnTop, 5000).unref?.();
  win.webContents.on("did-finish-load", () => sendStatus(false));
}

function sendStatus(transition) {
  if (!win || win.isDestroyed() || !lastSnap) return;
  win.webContents.send("status", { ...lastSnap, transition, muted: prefs.muted });
}

function describe(s) {
  if (!s) return "No sessions yet";
  return `${NAME[s.source]}${s.project ? " · " + s.project : ""} — ${LABEL[s.state]}`;
}

function toast(snap) {
  if (!prefs.toasts || !Notification.isSupported()) return;
  const s = snap.primary;
  const who = `${NAME[s.source]}${s.project ? " · " + s.project : ""}`;
  const body = snap.state === "approval" ? `${who} is waiting for your approval or answer.` : `${who} finished and is waiting for your next prompt.`;
  const n = new Notification({ title: snap.state === "approval" ? "🟡 確認 — needs you" : "🔴 完了 — all done", body, silent: true });
  n.on("click", () => win?.showInactive());
  n.show();
}

function buildMenu() {
  const login = app.getLoginItemSettings(LOGIN).openAtLogin;
  const test = (state) => () => store.update({ source: "claude", state, session_id: "tray-test", project: "test" });
  return Menu.buildFromTemplate([
    { label: describe(lastSnap?.primary), enabled: false },
    ...(lastSnap?.sessions.length > 1 ? lastSnap.sessions.slice(0, 6).map((s) => ({ label: "   " + describe(s), enabled: false })) : []),
    { type: "separator" },
    { label: win?.isVisible() ? "Hide tanuki" : "Show tanuki", click: () => { win.isVisible() ? win.hide() : win.showInactive(); refreshTray(); } },
    { label: "Reset position", click: () => { const p = defaultPos(); win.setPosition(p.x, p.y); prefs.x = p.x; prefs.y = p.y; savePrefs(); } },
    { label: "Size", submenu: Object.keys(SIZES).map((k) => ({
      label: k[0].toUpperCase() + k.slice(1), type: "radio", checked: prefs.size === k, click: () => setSize(k) })) },
    { label: "Wind-chime sound", type: "checkbox", checked: !prefs.muted, click: (i) => { prefs.muted = !i.checked; savePrefs(); sendStatus(false); } },
    { label: "Windows notifications", type: "checkbox", checked: prefs.toasts, click: (i) => { prefs.toasts = i.checked; savePrefs(); } },
    { label: "Start with Windows", type: "checkbox", checked: login,
      click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked, ...LOGIN }) },
    { type: "separator" },
    hooks.isInstalled()
      ? { label: "✓ Connected to Claude & Codex — disconnect", click: () => connectHooks(true) }
      : { label: "Connect Claude & Codex…", click: () => connectHooks(false) },
    { label: "Test states", submenu: [
      { label: "🟢 Working", click: test("working") },
      { label: "🟡 Needs approval", click: test("approval") },
      { label: "🔴 Done", click: test("done") },
      { label: "Clear test session", click: test("end") },
    ] },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);
}

function setSize(size) {
  const before = dims();
  prefs.size = size;
  const after = dims();
  const [x, y] = win.getPosition(); // keep the bottom-right corner where it is
  win.setBounds({ x: x + before.w - after.w, y: y + before.h - after.h, width: after.w, height: after.h });
  [prefs.x, prefs.y] = win.getPosition();
  savePrefs();
}

function connectHooks(uninstall) {
  const nodeExe = hooks.findNode();
  if (!uninstall && !nodeExe) {
    dialog.showMessageBox({ type: "warning", title: "Tanuki Buddy",
      message: "Node.js wasn't found on your PATH.",
      detail: "The Claude Code / Codex hooks use Node.js to talk to the tanuki. Install it from nodejs.org, then try again." });
    return;
  }
  const verb = uninstall ? "remove the tanuki hooks from" : "add hooks to";
  const ok = dialog.showMessageBoxSync({ type: "question", buttons: [uninstall ? "Disconnect" : "Connect", "Cancel"], defaultId: 0, cancelId: 1,
    title: "Tanuki Buddy", message: `This will ${verb} your Claude Code and Codex settings.`,
    detail: "Your existing hooks are kept, and each file is backed up to *.bak-tanuki first:\n" + hooks.TARGETS.map((t) => "• " + t.file).join("\n") }) === 0;
  if (!ok) return;
  try {
    const { lines } = hooks.run({ sendScript: SEND_SCRIPT, nodeExe, uninstall });
    dialog.showMessageBox({ type: "info", title: "Tanuki Buddy", message: uninstall ? "Disconnected." : "Connected! 🍃",
      detail: lines.join("\n") + (uninstall ? "" : "\n\nNew Claude/Codex sessions will now show up on the sign. Codex may ask you to trust the new hooks once.") });
  } catch (e) {
    dialog.showErrorBox("Tanuki Buddy", "Couldn't update the hook settings:\n" + e.message);
  }
  refreshTray();
}

function refreshTray() {
  if (!tray) return;
  tray.setImage(trayIcon(lastSnap?.state || "sleep"));
  tray.setToolTip(`Tanuki Buddy — ${describe(lastSnap?.primary)}`);
  tray.setContextMenu(buildMenu());
}

app.whenReady().then(() => {
  store = new SessionStore();
  lastSnap = store.snapshot();
  createWindow();
  tray = new Tray(trayIcon("sleep"));
  tray.on("click", () => { win.isVisible() ? win.hide() : win.showInactive(); refreshTray(); });
  refreshTray();

  store.on("change", (snap, prev) => {
    lastSnap = snap;
    const transition = prev !== snap.state;
    sendStatus(transition);
    refreshTray();
    if (transition && prev && (snap.state === "approval" || snap.state === "done") && snap.primary) toast(snap);
  });
  if (!SNAPSHOT) startServer(store, Number(process.env.TANUKI_PORT || 47321));
  if (!SNAPSHOT && !prefs.welcomed) {
    prefs.welcomed = true; savePrefs();
    if (!hooks.isInstalled() && Notification.isSupported()) {
      const n = new Notification({ title: "🍃 Tanuki Buddy is here!", body: "Right-click the tanuki (or the leaf in the tray) → Connect Claude & Codex." });
      n.on("click", () => buildMenu().popup({ window: win }));
      n.show();
    }
  }

  ipcMain.on("hover", (_e, over) => { if (!dragOrigin) win.setIgnoreMouseEvents(!over, { forward: true }); });
  ipcMain.on("drag-start", () => { const [x, y] = win.getPosition(); dragOrigin = { x, y }; });
  ipcMain.on("drag-move", (_e, dx, dy) => {
    if (dragOrigin) win.setBounds({ x: Math.round(dragOrigin.x + dx), y: Math.round(dragOrigin.y + dy), width: dims().w, height: dims().h });
  });
  ipcMain.on("drag-end", () => {
    dragOrigin = null;
    [prefs.x, prefs.y] = win.getPosition();
    savePrefs();
  });
  ipcMain.on("context-menu", () => buildMenu().popup({ window: win }));

  // Dev aid: `electron . --icon=<file.png>` renders the app icon (face portrait) and quits.
  const iconArg = process.argv.find((a) => a.startsWith("--icon="));
  if (iconArg) {
    const iconWin = new BrowserWindow({ width: 512, height: 512, transparent: true, frame: false, show: false, useContentSize: true,
      webPreferences: { preload: path.join(__dirname, "preload.js"), offscreen: false } });
    iconWin.loadFile(path.join(__dirname, "..", "renderer", "index.html"), { hash: "icon" });
    iconWin.webContents.once("did-finish-load", async () => {
      iconWin.showInactive();
      await new Promise((r) => setTimeout(r, 2000));
      const img = (await iconWin.webContents.capturePage()).resize({ width: 512, height: 512 });
      fs.writeFileSync(iconArg.split("=")[1], img.toPNG());
      app.exit(0);
    });
  }

  // Dev aid: `electron . --snapshot=<dir>` renders every state to PNGs, then quits.
  const snapArg = process.argv.find((a) => a.startsWith("--snapshot="));
  if (snapArg) {
    const dir = snapArg.split("=")[1];
    fs.mkdirSync(dir, { recursive: true });
    prefs.toasts = false; prefs.muted = true;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    win.webContents.once("did-finish-load", async () => {
      await wait(1500);
      for (const [state, delay] of [["sleep", 2500], ["working", 2200], ["approval", 900], ["done", 1200]]) {
        if (state !== "sleep") store.update({ source: "claude", state, session_id: "snap", project: "my-app" });
        await wait(delay);
        fs.writeFileSync(path.join(dir, `${state}.png`), (await win.webContents.capturePage()).toPNG());
      }
      app.exit(0);
    });
  }
});

app.on("window-all-closed", (e) => e.preventDefault?.());
