// 决定性实验：连续两次 session/prompt，观察实时流里 user_message_chunk 是否回显、
// 以及它与助手内容的相对顺序（用户「首条消息排到后面」的根因验证）。
import { spawn } from "node:child_process";
import readline from "node:readline";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const GROK = "C:\\Users\\fanji\\.grok\\bin\\grok.exe";
const CWD = mkdtempSync(join(tmpdir(), "grok-order-"));
console.log("cwd:", CWD);

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
let phase = "init";
let log = [];

function send(method, params) {
  const id = nextId++;
  proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  return new Promise((res, rej) => {
    pending.set(id, { res, rej });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        rej(new Error("timeout " + method));
      }
    }, 180000);
    // prompt 期间来的 response 就是回合结束
    if (method === "session/prompt") {
      pending.set(id + 0.5, null); // 占位无意义
    }
  });
}

function sendPrompt(sessionId, text) {
  const id = nextId++;
  proc.stdin.write(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "session/prompt",
      params: { sessionId, prompt: [{ type: "text", text }] },
    }) + "\n"
  );
  return new Promise((res) => {
    pending.set(id, { res });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        res({ timeout: true });
      }
    }, 180000);
  });
}

function dump() {
  console.log(`\n--- [${phase}] 收到 ${log.length} 条 ---`);
  log.forEach((e, i) => {
    const t = e.text.replace(/\s+/g, " ").trim();
    console.log(`  ${String(i).padStart(2)} ${e.kind.padEnd(20)} ${t.slice(0, 70)}`);
  });
  log = [];
}

rl.on("line", (l) => {
  l = l.trim();
  if (!l) return;
  let d;
  try {
    d = JSON.parse(l);
  } catch {
    return;
  }
  if (d.id !== undefined && pending.has(d.id)) {
    const p = pending.get(d.id);
    pending.delete(d.id);
    p?.res(d.result ?? d.error);
    return;
  }
  if (d.method === "session/update") {
    const u = d.params?.update ?? {};
    log.push({ kind: u.sessionUpdate, text: u.content?.text ?? u.title ?? "" });
    return;
  }
  if (d.method && d.id !== undefined) {
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: d.id, result: {} }) + "\n");
  }
});

try {
  await send("initialize", {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
  });
  const s = await send("session/new", { cwd: CWD, mcpServers: [] });
  const sid = s.sessionId;
  console.log("session:", sid);

  phase = "prompt#1 「第一句」";
  await sendPrompt(sid, "第一句");
  await new Promise((x) => setTimeout(x, 800));
  dump();

  phase = "prompt#2 「第二句」";
  await sendPrompt(sid, "第二句");
  await new Promise((x) => setTimeout(x, 800));
  dump();
} catch (e) {
  console.error("FAIL", e.message);
} finally {
  rl.close();
  proc.kill();
  setTimeout(() => process.exit(0), 300);
}
