// 一次性诊断：session/load 重放时消息的相对顺序（cwd 从 argv 传，避免 shell 编码问题）
import { spawn } from "node:child_process";
import readline from "node:readline";
import { readFileSync } from "node:fs";

const GROK = "C:\\Users\\fanji\\.grok\\bin\\grok.exe";
// 从文件读，避免中文路径经 shell 传参被破坏
const CFG = JSON.parse(readFileSync(process.argv[2], "utf8"));
const SESSION = CFG.sessionId;
const CWD = CFG.cwd;
console.log("session:", SESSION, "cwd:", JSON.stringify(CWD));

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
const seq = [];
const t0 = Date.now();

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
  });
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
    p.res(d.result ?? d.error);
    return;
  }
  if (d.method === "session/update") {
    seq.push({ u: d.params?.update ?? {}, at: Date.now() - t0 });
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
  const r = await send("session/load", { sessionId: SESSION, cwd: CWD, mcpServers: [] });
  console.log("load result:", JSON.stringify(r).slice(0, 300));
  await new Promise((x) => setTimeout(x, 5000));

  const counts = {};
  seq.forEach(({ u }) => (counts[u.sessionUpdate] = (counts[u.sessionUpdate] || 0) + 1));
  console.log("total updates:", seq.length, JSON.stringify(counts));

  // 压缩成消息大纲
  const outline = [];
  for (const { u, at } of seq) {
    const k =
      u.sessionUpdate === "user_message_chunk"
        ? "USER"
        : u.sessionUpdate === "agent_message_chunk"
          ? "AGENT"
          : u.sessionUpdate === "agent_thought_chunk"
            ? "THOUGHT"
            : null;
    if (!k) continue;
    const text = u.content?.text ?? "";
    const last = outline[outline.length - 1];
    if (last && last.k === k) {
      last.text += text;
      last.n += 1;
    } else {
      outline.push({ k, text, n: 1, at });
    }
  }
  console.log(`\n=== 消息大纲 ${outline.length} 段 ===`);
  outline.forEach((o, i) => {
    console.log(
      `${String(i).padStart(3)} ${o.k.padEnd(8)} x${String(o.n).padStart(3)} +${o.at}ms  ` +
        o.text.replace(/\s+/g, " ").trim().slice(0, 90)
    );
  });
} catch (e) {
  console.error("FAIL", e.message);
} finally {
  rl.close();
  proc.kill();
  setTimeout(() => process.exit(0), 300);
}
