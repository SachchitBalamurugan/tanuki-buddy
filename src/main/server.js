// Loopback-only HTTP endpoint the hook bridge talks to.
const http = require("node:http");

const VALID = new Set(["working", "approval", "done", "end"]);

function startServer(store, port = 47321) {
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/status") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(store.snapshot()));
    }
    if (req.method !== "POST" || req.url !== "/event") { res.writeHead(404); return res.end(); }
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 64 * 1024) req.destroy();
    });
    req.on("end", () => {
      try {
        const e = JSON.parse(body);
        const source = e.source === "codex" ? "codex" : "claude";
        if (!VALID.has(e.state)) throw new Error("bad state");
        store.update({
          source,
          state: e.state,
          session_id: String(e.session_id || "default").slice(0, 200),
          project: String(e.project || "").slice(0, 60),
        });
        res.writeHead(204);
      } catch {
        res.writeHead(400);
      }
      res.end();
    });
  });
  server.on("error", (err) => console.error("[tanuki] server error:", err.message));
  server.listen(port, "127.0.0.1");
  return server;
}

module.exports = { startServer };
