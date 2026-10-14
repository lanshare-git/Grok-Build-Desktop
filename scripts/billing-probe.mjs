// 探针：确认 grok ACP 是否提供配额数据（x.ai/billing、x.ai/session/usage）
import { spawn } from "node:child_process";
import readline from "node:readline";

const GROK = process.env.GROK_BIN || "C:\\Users\\fanji\\.grok\\bin\\grok.exe";
const CWD = process.env.PROBE_CWD || "C:\\Users\\fanji";

const proc = spawn(GROK, ["agent", "stdio"], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, GROK_DISABLE_AUTOUPDATER: "1" },
});
proc.stderr.on("data", (d) => {
  const s = d.toString().trim();
  if (s && !/ERROR|WARN/.test(s)) console.error("[stderr]", s.slice(0, 200));
});

const rl = readline.createInterface({ input: proc.stdout });
let nextId = 1;
const pending = new Map();
const seenMethods = new Set();

function send(method, params) {
  const id = nextId++;
  proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error(`timeout ${method}`)); }
    }, 45000);
  });
}

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
    seenMethods.add(msg.method);
    if (/usage|billing|limit|quota|credit/i.test(msg.method)) {
      console.log("[notify]", msg.method, JSON.stringify(msg.params).slice(0, 1500));
    }
  }
});

(async () => {
  const init = await send("initialize", { protocolVersion: 1, clientCapabilities: {} });
  const tier = init._meta?.settings?.subscription_tier ?? init._meta?.subscription_tier;
  console.log("=== 订阅等级 ===", JSON.stringify(tier));
  const s = await send("session/new", { cwd: CWD, mcpServers: [] });

  // 各种可能的配额方法名与参数组合
  const probes = [
    ["x.ai/billing", {}],
    ["x.ai/billing", { userId: null }],
    ["x.ai/session/usage", { sessionId: s.sessionId }],
    ["x.ai/usage", { sessionId: s.sessionId }],
    ["session/usage", { sessionId: s.sessionId }],
    ["x.ai/account/usage", {}],
    ["x.ai/billing/config", {}]
  ];
  for (const [method, params] of probes) {
    try {
      const r = await send(method, params);
      console.log(`=== ${method} ${JSON.stringify(params)} => OK`);
      console.log(JSON.stringify(r, null, 2).slice(0, 2500));
    } catch (e) {
      console.log(`=== ${method} => ERR ${String(e.message).slice(0, 200)}`);
    }
  }

  console.log("=== 观察到的全部通知方法 ===");
  console.log([...seenMethods].sort().join("\n"));
  proc.kill();
  process.exit(0);
})().catch((e) => { console.error("FATAL", e); proc.kill(); process.exit(1); });