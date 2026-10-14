// 探测 session/load 的历史重放：通知条数、时间间隔、load 返回与通知的先后。
// 用法: node scripts/load-probe.mjs [sessionId] [cwd]
import { spawn } from "node:child_process";
import readline from "node:readline";

const GROK = process.env.GROK_BIN || "C:\\Users\\fanji\\.grok\\bin\\grok.exe";
const SESSION = process.argv[2] || "01a12ec6-ae9d-7f40-8eb3-815b1ff04d8c";
const CWD = process.argv[3] || "D:\\需求分析";

const proc = spawn(GROK, ["agent", "--always-approve", "stdio"], {
  stdio: ["pipe", "pipe", "pipe"],
  env: {
    ...process.env,
    GROK_DISABLE_AUTOUPDATER: "1",
    HTTP_PROXY: "socks5h://127.0.0.1:10808",
    HTTPS_PROXY: "socks5h://127.0.0.1:10808",
  },
});

const rl = readline.createInterface({ input: proc.stdout });
let nextId = 1;
const pending = new Map();
const t0 = Date.now();

function send(method, params) {
  const id = nextId++;
  proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`timeout waiting for ${method}`));
      }
    }, 120000);
  });
}

let updateCount = 0;
let lastLog = 0;
const gapBuckets = {};

rl.on("line", (line) => {
  line = line.trim();
  if (!line) return;
  let data;
  try {
    data = JSON.parse(line);
  } catch {
    return;
  }
  if (data.id !== undefined && pending.has(data.id)) {
    const { resolve } = pending.get(data.id);
    pending.delete(data.id);
    resolve(data.result ?? data.error);
    return;
  }
  if (data.method === "session/update") {
    updateCount++;
    const now = Date.now() - t0;
    if (now - lastLog > 100 || updateCount % 200 === 0) {
      console.log(`  +${updateCount} updates @ ${now}ms  kind=${data.params?.update?.sessionUpdate}`);
      lastLog = now;
    }
    return;
  }
  if (data.method && data.id !== undefined) {
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: data.id, result: {} }) + "\n");
  }
});

try {
  await send("initialize", {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
  });
  console.log("[ok] initialize");
  console.log(`--- session/load ${SESSION} (${CWD}) ---`);
  const r = await send("session/load", { sessionId: SESSION, cwd: CWD, mcpServers: [] });
  console.log(`[ok] session/load returned @ ${Date.now() - t0}ms, updates seen so far: ${updateCount}`);
  console.log("     result keys:", JSON.stringify(Object.keys(r ?? {})));
  // 再等 3 秒看 load 返回后是否还有追加通知
  await new Promise((res) => setTimeout(res, 3000));
  console.log(`[done] total updates: ${updateCount} @ ${Date.now() - t0}ms`);
} catch (e) {
  console.error("[FAIL]", e.message);
} finally {
  rl.close();
  proc.kill();
  setTimeout(() => process.exit(0), 300);
}
