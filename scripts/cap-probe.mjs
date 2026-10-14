// 探针：完整打印 initialize / session/new 的返回，列出 grok ACP 暴露的全部能力与配置项
import { spawn } from "node:child_process";
import readline from "node:readline";

const GROK = process.env.GROK_BIN || "C:\\Users\\fanji\\.grok\\bin\\grok.exe";

const proc = spawn(GROK, ["agent", "--always-approve", "stdio"], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, GROK_DISABLE_AUTOUPDATER: "1" },
});

proc.stderr.on("data", (d) => {
  const s = d.toString().trim();
  if (s) console.error("[stderr]", s.slice(0, 300));
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
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`timeout ${method}`));
      }
    }, 60000);
  });
}

rl.on("line", (line) => {
  const t = line.trim();
  if (!t) return;
  let msg;
  try {
    msg = JSON.parse(t);
  } catch {
    return;
  }
  if (msg.id !== undefined && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
    return;
  }
  if (msg.method) {
    // 收集 grok 主动上报的方法名（能力面）
    console.log("[notify]", msg.method, JSON.stringify(msg.params ?? {}).slice(0, 160));
  }
});

(async () => {
  const init = await send("initialize", {
    protocolVersion: 1,
    clientCapabilities: {
      fs: { readTextFile: true, writeTextFile: true },
      terminal: true,
    },
  });
  console.log("=== initialize ===");
  console.log(JSON.stringify(init, null, 2));

  const cwd = process.env.PROBE_CWD || "D:\\项目\\Grok Build";
  const s = await send("session/new", { cwd, mcpServers: [] });
  console.log("=== session/new ===");
  console.log(JSON.stringify(s, null, 2));

  // 探测是否存在扩展方法（全部返回 method not found 才算不支持）
  const probes = [
    ["session/fork", { sessionId: s.sessionId }],
    ["session/compact", { sessionId: s.sessionId }],
    ["session/set_title", { sessionId: s.sessionId, title: "probe" }],
    ["session/delete", { sessionId: s.sessionId }],
    ["session/list", { cwd }],
    ["session/search", { query: "a" }],
    ["ext/method", {}],
  ];
  console.log("=== 扩展方法探测 ===");
  for (const [method, params] of probes) {
    try {
      const r = await send(method, params);
      console.log(method, "=> OK", JSON.stringify(r).slice(0, 200));
    } catch (e) {
      console.log(method, "=>", String(e.message).slice(0, 160));
    }
  }

  proc.kill();
  process.exit(0);
})().catch((e) => {
  console.error("FATAL", e);
  proc.kill();
  process.exit(1);
});