// 探针2：验证 session/fork / session/close / session/list 的真实参数与返回
import { spawn } from "node:child_process";
import readline from "node:readline";
import { resolveGrokBin, resolveProbeCwd } from "./probe-env.mjs";

const GROK = resolveGrokBin();
const CWD = resolveProbeCwd();

const proc = spawn(GROK, ["agent", "--always-approve", "stdio"], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, GROK_DISABLE_AUTOUPDATER: "1" },
});
proc.stderr.on("data", (d) => {
  const s = d.toString().trim();
  if (s) console.error("[stderr]", s.slice(0, 200));
});

const rl = readline.createInterface({ input: proc.stdout });
let nextId = 1;
const pending = new Map();
function send(method, params) {
  const id = nextId++;
  proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error(`timeout ${method}`)); }
    }, 60000);
  });
}
const methods = new Set();
rl.on("line", (line) => {
  const t = line.trim();
  if (!t) return;
  let msg;
  try { msg = JSON.parse(t); } catch { return; }
  if (msg.id !== undefined && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
    return;
  }
  if (msg.method) {
    methods.add(msg.method);
    if (msg.method.startsWith("_x.ai/announcements")) {
      console.log("[announcements]", JSON.stringify(msg.params).slice(0, 3000));
    }
  }
});

(async () => {
  await send("initialize", { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true } });
  const s = await send("session/new", { cwd: CWD, mcpServers: [] });
  console.log("sessionId =", s.sessionId);

  console.log("=== session/list 完整返回（首条） ===");
  const list = await send("session/list", { cwd: CWD });
  console.log(JSON.stringify(list, null, 2).slice(0, 2500));

  console.log("=== session/fork ===");
  try {
    const f = await send("session/fork", { sessionId: s.sessionId, cwd: CWD });
    console.log("OK", JSON.stringify(f, null, 2).slice(0, 1200));
  } catch (e) { console.log("ERR", String(e.message).slice(0, 300)); }

  console.log("=== session/close ===");
  try {
    const c = await send("session/close", { sessionId: s.sessionId });
    console.log("OK", JSON.stringify(c));
  } catch (e) { console.log("ERR", String(e.message).slice(0, 300)); }

  console.log("=== 上报过的方法名 ===");
  console.log([...methods].sort().join("\n"));
  proc.kill();
  process.exit(0);
})().catch((e) => { console.error("FATAL", e); proc.kill(); process.exit(1); });