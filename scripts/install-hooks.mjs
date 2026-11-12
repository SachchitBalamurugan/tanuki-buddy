// Dev entry point:  npm run install-hooks [-- --dry-run]  /  npm run uninstall-hooks
// (Installed copies of the app do the same thing from the tray: "Connect Claude & Codex".)
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { run } = require("../src/main/hooks-installer.js");

const here = path.dirname(fileURLToPath(import.meta.url));
const dryRun = process.argv.includes("--dry-run");
const { lines, preview } = run({
  sendScript: path.resolve(here, "..", "hooks", "send.mjs"),
  nodeExe: process.execPath,
  uninstall: process.argv.includes("--uninstall"),
  dryRun,
});
console.log(lines.join("\n"));
if (dryRun) console.log(JSON.stringify(preview, null, 2));
