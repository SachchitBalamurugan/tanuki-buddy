// Finds Claude Code and Codex sessions by reading their transcripts on disk, every few seconds.
// This catches sessions the hooks can't: ones started before "Connect", Codex sessions whose hooks
// haven't been trusted yet, and the Codex desktop app / IDE extension. Read-only: nothing is written.
//
// Hooks stay the precise source (they know about permission prompts); the scanner only reports a
// session when its transcript grows or its inferred state changes, so it never overrides a fresh
// "needs you" from a hook while the session is sitting still waiting for you.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const POLL_MS = 3000;
const LIST_EVERY = 10;                       // re-list directories every 10 polls (~30 s)
const SHOW_IF_ACTIVE_WITHIN = 20 * 60 * 1000; // on first sight, only show sessions active in the last 20 min
const DROP_AFTER = 60 * 60 * 1000;           // forget scanner-found sessions idle for an hour
const TAIL_BYTES = 256 * 1024;
const ASK_TOOLS = new Set(["AskUserQuestion", "ExitPlanMode", "request_user_input", "ask_user"]);

const CLAUDE_DIR = path.join(os.homedir(), ".claude", "projects");
const CODEX_DIR = path.join(os.homedir(), ".codex");

function readTail(file, size) {
  const len = Math.min(size, TAIL_BYTES);
  const buf = Buffer.alloc(len);
  const fd = fs.openSync(file, "r");
  try { fs.readSync(fd, buf, 0, len, size - len); } finally { fs.closeSync(fd); }
  const lines = buf.toString("utf8").split("\n");
  if (size > len) lines.shift(); // first line is probably cut in half
  return lines;
}

function* newestFirst(lines) {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i]) continue;
    try { yield JSON.parse(lines[i]); } catch {}
  }
}

const textOf = (c) => typeof c === "string" ? c
  : Array.isArray(c) ? c.filter((x) => x.type === "text").map((x) => x.text).join(" ") : "";

/** Claude Code transcript (~/.claude/projects/<dir>/<session>.jsonl) -> { state, cwd } */
function claudeState(lines) {
  for (const j of newestFirst(lines)) {
    if (j.isSidechain || j.isMeta) continue;            // subagent chatter / injected context
    if (j.type === "assistant") {
      const c = Array.isArray(j.message?.content) ? j.message.content : [];
      const tool = c.find((x) => x.type === "tool_use");
      if (tool) return { state: ASK_TOOLS.has(tool.name) ? "approval" : "working", cwd: j.cwd };
      const stop = j.message?.stop_reason;
      return { state: stop === "end_turn" || stop === "stop_sequence" ? "done" : "working", cwd: j.cwd };
    }
    if (j.type === "user") {
      const t = textOf(j.message?.content);
      if (/\[Request interrupted by user/.test(t) || /<(command-name|local-command-stdout)>/.test(t)) return { state: "done", cwd: j.cwd };
      return { state: "working", cwd: j.cwd };
    }
  }
  return null;
}

/** Codex rollout (~/.codex/sessions/.../rollout-*.jsonl) -> { state } */
function codexState(lines) {
  let answered = false;
  for (const j of newestFirst(lines)) {
    const p = j.payload || {};
    if (j.type === "event_msg") {
      if (p.type === "task_complete" || p.type === "turn_aborted") return { state: "done" };
      if (p.type === "task_started") return { state: "working" };
    } else if (j.type === "response_item") {
      if (p.type === "function_call_output" || p.type === "custom_tool_call_output") answered = true;
      if ((p.type === "function_call" || p.type === "custom_tool_call") && !answered && ASK_TOOLS.has(p.name)) return { state: "approval" };
    }
  }
  return null;
}

const cleanCwd = (cwd) => (cwd || "").replace(/^\\\\\?\\/, "");
const projectOf = (cwd) => path.basename(cleanCwd(cwd)) || "";

class SessionScanner {
  constructor(store) {
    this.store = store;
    this.files = new Map();   // file -> { source, id, size, state, project, active }
    this.claudeFiles = [];
    this.codexThreads = [];
    this.polls = 0;
    this.codexDb = null;
    this.codexDbFailed = false;
  }

  start() {
    this.tick();
    this.timer = setInterval(() => this.tick(), POLL_MS);
    this.timer.unref?.();
    return this;
  }

  stop() { clearInterval(this.timer); }

  listClaude() {
    const out = [];
    let dirs = [];
    try { dirs = fs.readdirSync(CLAUDE_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch { return out; }
    const cutoff = Date.now() - DROP_AFTER;
    for (const d of dirs) {
      const dir = path.join(CLAUDE_DIR, d.name);
      let names = [];
      try { names = fs.readdirSync(dir); } catch { continue; }
      for (const n of names) {
        if (!n.endsWith(".jsonl")) continue;
        const file = path.join(dir, n);
        try { if (fs.statSync(file).mtimeMs >= cutoff || this.files.has(file)) out.push(file); } catch {}
      }
    }
    return out;
  }

  listCodex() {
    // Codex keeps its thread list in SQLite; the rollout files are still appended as it works.
    if (this.codexDbFailed) return [];
    try {
      if (!this.codexDb) {
        const { DatabaseSync } = require("node:sqlite");
        this.codexDb = new DatabaseSync(path.join(CODEX_DIR, "state_5.sqlite"), { readOnly: true });
      }
      const since = Math.floor((Date.now() - DROP_AFTER) / 1000);
      return this.codexDb.prepare(
        "SELECT id, cwd, rollout_path, updated_at FROM threads WHERE updated_at > ? AND source NOT LIKE '{%' ORDER BY updated_at DESC LIMIT 40"
      ).all(since);
    } catch {
      this.codexDb = null;
      this.codexDbFailed = true;   // no database (older Codex / not installed): hooks still work
      return [];
    }
  }

  tick() {
    if (this.polls++ % LIST_EVERY === 0) {
      this.claudeFiles = this.listClaude();
      this.codexThreads = this.listCodex();
    }
    const now = Date.now();
    for (const file of this.claudeFiles) this.check(file, "claude", path.basename(file, ".jsonl"), null, now);
    for (const t of this.codexThreads) this.check(t.rollout_path, "codex", t.id, t, now);

    for (const [file, rec] of this.files) {     // tidy up sessions that went quiet long ago
      if (rec.shown && now - rec.active > DROP_AFTER) {
        this.store.update({ source: rec.source, session_id: rec.id, state: "end" });
        rec.shown = false;
      }
      if (!fs.existsSync(file)) this.files.delete(file);
    }
  }

  check(file, source, id, codexRow, now) {
    let st;
    try { st = fs.statSync(file); } catch { return; }
    let rec = this.files.get(file);
    const firstSight = !rec;
    if (firstSight) {
      // Windows doesn't always bump mtime on files held open, so Codex's own timestamp counts too.
      const active = Math.max(st.mtimeMs, (codexRow?.updated_at || 0) * 1000);
      rec = { source, id, size: -1, state: null, project: "", active, shown: false };
      this.files.set(file, rec);
    }
    if (st.size === rec.size) return;          // nothing new
    const grew = rec.size >= 0;
    rec.size = st.size;
    if (grew) rec.active = now;
    if (!grew && now - rec.active > SHOW_IF_ACTIVE_WITHIN) return; // old session: wait until it moves

    let info = null;
    try {
      const lines = readTail(file, st.size);
      info = source === "claude" ? claudeState(lines) : codexState(lines);
    } catch { return; }
    if (!info) return;
    const project = projectOf(info.cwd || codexRow?.cwd) || rec.project;
    if (rec.shown && info.state === rec.state && project === rec.project && !grew) return;
    rec.state = info.state; rec.project = project; rec.shown = true;
    this.store.update({ source, session_id: id, state: info.state, project, at: rec.active });
  }
}

module.exports = { SessionScanner, claudeState, codexState };
