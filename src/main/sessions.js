// Tracks every Claude/Codex session and folds them into one mood for the tanuki.
const { EventEmitter } = require("node:events");

const WORKING_STALE_MS = 10 * 60 * 1000; // green with no news for 10 min -> treat as done
const SLEEP_AFTER_MS = 30 * 60 * 1000;   // nothing at all for 30 min -> tanuki naps
const FORGET_AFTER_MS = 6 * 60 * 60 * 1000;

const PRIORITY = { approval: 3, working: 2, done: 1 };

class SessionStore extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map();
    this.lastState = null;
    setInterval(() => this.emitIfChanged(), 15 * 1000).unref?.();
  }

  /** `at` lets the transcript scanner pass the real time of the last activity. */
  update({ source, state, session_id, project, at }) {
    const id = `${source}:${session_id}`;
    if (state === "end") this.sessions.delete(id);
    else this.sessions.set(id, { id, source, state, project: project || this.sessions.get(id)?.project || "", updatedAt: Math.min(at ?? Date.now(), Date.now()) });
    this.emitIfChanged();
  }

  effective(s, now) {
    if (s.state === "working" && now - s.updatedAt > WORKING_STALE_MS) return "done";
    return s.state;
  }

  snapshot() {
    const now = Date.now();
    for (const [id, s] of this.sessions) if (now - s.updatedAt > FORGET_AFTER_MS) this.sessions.delete(id);
    const list = [...this.sessions.values()]
      .map((s) => ({ ...s, state: this.effective(s, now) }))
      .sort((a, b) => PRIORITY[b.state] - PRIORITY[a.state] || b.updatedAt - a.updatedAt);

    let state = list[0]?.state || "sleep";
    const newest = Math.max(0, ...list.map((s) => s.updatedAt));
    if (state === "done" && now - newest > SLEEP_AFTER_MS) state = "sleep";

    const same = list.filter((s) => s.state === state);
    return { state, primary: list[0] || null, count: same.length, sessions: list };
  }

  emitIfChanged(force = false) {
    const snap = this.snapshot();
    const key = JSON.stringify([snap.state, snap.sessions.map((s) => [s.id, s.state, s.project])]);
    if (!force && key === this.lastKey) return;
    const prev = this.lastState;
    this.lastKey = key;
    this.lastState = snap.state;
    this.emit("change", snap, prev);
  }
}

module.exports = { SessionStore };
