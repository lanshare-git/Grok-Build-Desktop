// 探测 _x.ai/ask_user_question 的请求参数与响应格式。
// 用法:
//   node scripts/ask-probe.mjs            // 抓参数，响应 RESP(默认 {})
//   RESP='{"answers":[]}' node scripts/ask-probe.mjs
import { spawn } from "node:child_process";
import readline from "node:readline";

const GROK = process.env.GROK_BIN || "C:\\Users\\fanji\\.grok\\bin\\grok.exe";
const RESP = process.env.RESP || "{}";

const proc = spawn(GROK, ["agent", "--always-approve", "stdio"], {
  stdio: ["pipe", "pipe", "pipe"],
  env: {
    ...process.env,
    GROK_DISABLE_AUTOUPDATER: "1",
    HTTP_PROXY: "socks5h://127.0.0.1:10808",
    HTTPS_PROXY: "socks5h://127.0.0.1:10808",
  },
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
        reject(new Error(`timeout waiting for ${method}`));
      }
    }, 180000);
  });
}

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
    const u = data.params?.update || {};
    const kind = u.sessionUpdate || "?";
    if (kind === "agent_message_chunk") process.stdout.write(u.content?.text || "");
    else console.log(`  [${kind}] ${JSON.stringify(u).slice(0, 220)}`);
    return;
  }

  if (data.method && data.id !== undefined) {
    console.log(`\n=== agent->client request: ${data.method} ===`);
    console.log(JSON.stringify(data.params, null, 2));
    let result;
    if (data.method === "session/request_permission") {
      result = { outcome: { outcome: "selected", optionId: "allow_once" } };
    } else if (data.method === "_x.ai/ask_user_question") {
      result = JSON.parse(RESP);
      console.log(`>>> responding with: ${RESP}`);
    } else {
      result = {};
    }
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: data.id, result }) + "\n");
  }
});

try {
  await send("initialize", {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
  });
  console.log("[ok] initialize");
  const s = await send("session/new", {
    cwd: "D:\\项目\\Grok Build",
    mcpServers: [],
    _meta: { yoloMode: true },
  });
  console.log(`[ok] session/new -> ${s?.sessionId}`);
  await send("session/prompt", {
    sessionId: s?.sessionId,
    prompt: [
      {
        type: "text",
        text: '请立即调用 ask_user_question 工具问我一个单选题："测试问题：选 A 还是 B？"，选项 A 和 B。拿到我的回答后，请原样复述我选择了什么（这是协议测试，不要做别的事情）。',
      },
    ],
  });
  console.log("\n[ok] prompt done");
} catch (e) {
  console.error("[FAIL]", e.message);
} finally {
  rl.close();
  proc.kill();
  setTimeout(() => process.exit(0), 300);
}
