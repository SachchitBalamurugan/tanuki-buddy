#!/usr/bin/env node
// Tanuki Buddy hook bridge.
// Usage (from a Claude Code / Codex hook):  node send.mjs <claude|codex>
// Reads the hook JSON from stdin, maps it to working / approval / done / end,
// and POSTs it to the Tanuki Buddy app. It ALWAYS exits 0 and prints nothing,
// so it can never block, approve, or deny anything in Claude/Codex.
import http from "node:http";
import path from "node:path";

const PORT = Number(process.env.TANUKI_PORT || 47321);
const source = (process.argv[2] || "claude").toLowerCase();

// Tools that mean "the agent is asking YOU something" -> yellow.
const ASK_TOOLS = new Set(["AskUserQuestion", "ExitPlanMode", "request_user_input", "ask_user"]);

function readStdin(timeoutMs = 400) {
  return new Promise((resolve) => {
    let data = "";
    const done = () => resolve(data);
    const t = setTimeout(done, timeoutMs);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => { clearTimeout(t); done(); });
    process.stdin.on("error", () => { clearTimeout(t); done(); });
  });
}

function mapState(h) {
  const ev = h.hook_event_name || h.event || process.argv[3] || "";
  switch (ev) {
    case "UserPromptSubmit":
    case "PostToolUse":
      return "working";
    case "PreToolUse":
      return ASK_TOOLS.has(h.tool_name) ? "approval" : "working";
    case "PermissionRequest":
      return "approval";
    case "Notification": {
      const t = h.notification_type || "";
      const msg = String(h.message || "").toLowerCase();
      if (t === "permission_prompt" || t === "elicitation_dialog" || msg.includes("permission")) return "approval";
      if (t === "idle_prompt" || msg.includes("waiting for your input")) return "done";
      return null;
    }
    case "Stop":
    case "SessionStart":
      return "done";
    case "SessionEnd":
      return "end";
    default:
      return null;
  }
}

function post(payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = http.request(
      { host: "127.0.0.1", port: PORT, path: "/event", method: "POST", timeout: 800,
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } },
      (res) => { res.resume(); res.on("end", resolve); }
    );
    req.on("timeout", () => { req.destroy(); resolve(); });
    req.on("error", resolve); // app not running -> silently ignore
    req.end(body);
  });
}

try {
  const raw = await readStdin();
  let h = {};
  try { h = raw ? JSON.parse(raw) : {}; } catch { h = {}; }
  const state = mapState(h);
  if (state) {
    const cwd = h.cwd || process.cwd();
    await post({
      source,
      state,
      session_id: String(h.session_id || h.thread_id || h.conversation_id || `${source}:${cwd}`),
      project: path.basename(cwd),
      event: h.hook_event_name || null,
      tool: h.tool_name || null,
    });
  }
} catch { /* never fail the host agent */ }
process.exit(0);
