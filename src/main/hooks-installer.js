// Merge (or remove) Tanuki Buddy hooks into ~/.claude/settings.json and ~/.codex/hooks.json.
// Shared by the tray menu (packaged app) and `npm run install-hooks` (dev).
// Existing hooks are kept untouched; each file is backed up to *.bak-tanuki before it is written.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const MARK = "send.mjs\" ";           // every tanuki hook command ends with: send.mjs" <source>
const isOurs = (group) => (group.hooks || []).some((h) => /tanuki/i.test(String(h.command || "")) && String(h.command || "").includes(MARK));

const TARGETS = [
  {
    name: "Claude Code",
    file: path.join(os.homedir(), ".claude", "settings.json"),
    source: "claude",
    events: ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PermissionRequest", "Notification", "Stop", "SessionEnd"],
  },
  {
    name: "Codex",
    file: path.join(os.homedir(), ".codex", "hooks.json"),
    source: "codex",
    // Only events Codex is known to support (an unknown key could break the whole file).
    events: ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PermissionRequest", "Stop"],
  },
];

/** Find a real Node.js binary on PATH (hooks run outside the app, so they need one). */
function findNode() {
  try {
    const out = execFileSync(process.platform === "win32" ? "where" : "which", ["node"], { encoding: "utf8", windowsHide: true });
    return out.split(/\r?\n/).map((s) => s.trim()).find(Boolean) || null;
  } catch {
    return null;
  }
}

function isInstalled() {
  return TARGETS.some((t) => {
    try {
      const hooks = JSON.parse(fs.readFileSync(t.file, "utf8")).hooks || {};
      return Object.values(hooks).some((groups) => groups.some(isOurs));
    } catch {
      return false;
    }
  });
}

/**
 * @param {{ sendScript: string, nodeExe?: string, uninstall?: boolean, dryRun?: boolean }} opts
 * @returns {{ lines: string[], preview: Record<string, object> }}
 */
function run({ sendScript, nodeExe, uninstall = false, dryRun = false }) {
  const lines = [], preview = {};
  const node = (nodeExe || "").replace(/\\/g, "/");
  const script = sendScript.replace(/\\/g, "/");
  const cmd = (src) => `"${node}" "${script}" ${src}`;

  for (const t of TARGETS) {
    if (!fs.existsSync(path.dirname(t.file))) { lines.push(`- ${t.name}: not installed, skipped`); continue; }
    let json = {};
    if (fs.existsSync(t.file)) {
      const raw = fs.readFileSync(t.file, "utf8");
      try { json = JSON.parse(raw); } catch (e) { lines.push(`! ${t.name}: ${t.file} is not valid JSON, skipped`); continue; }
      if (!dryRun) fs.writeFileSync(t.file + ".bak-tanuki", raw);
    }
    json.hooks ||= {};
    for (const ev of Object.keys(json.hooks)) {
      json.hooks[ev] = json.hooks[ev].filter((g) => !isOurs(g));
      if (json.hooks[ev].length === 0) delete json.hooks[ev];
    }
    if (!uninstall) {
      for (const ev of t.events) (json.hooks[ev] ||= []).push({ hooks: [{ type: "command", command: cmd(t.source), timeout: 5 }] });
    }
    if (Object.keys(json.hooks).length === 0) delete json.hooks;
    if (dryRun) { preview[t.name] = json.hooks ?? {}; lines.push(`~ ${t.name}: dry run, nothing written`); continue; }
    fs.writeFileSync(t.file, JSON.stringify(json, null, 2) + "\n");
    lines.push(`✓ ${t.name}: ${uninstall ? "removed" : "connected"}`);
  }
  return { lines, preview };
}

module.exports = { run, findNode, isInstalled, TARGETS };
