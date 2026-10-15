// 探测：agent 正在处理一个 turn 时，客户端能否再发 session/prompt。
// 目的：为「响应中是否放开输入框 / 新消息是排队还是打断」提供实测依据
//（竞品 Cursor / Grok bot 支持边跑边发，我们要知道 ACP 层是否允许）。
//
// 判定口径：
//   - 第 2 个 prompt **立刻**返回 result  -> agent 接受并发（可能排队或抢先）
//   - 第 2 个 prompt 返回 **error**       -> ACP 层拒绝，前端必须拦（或自己做客户端队列）
//   - 第 2 个 prompt 等第 1 个跑完才返回  -> 服务端串行排队
//
// 用法: node scripts/concurrent-prompt-probe.mjs
import { spawn } from "node:child_process";
import readline from "node:readline";

const GROK = process.env.GROK_BIN || "C:\\Users\\fanji\\.grok\\bin\\grok.exe";
const SLOW_PROMPT =
  "Write a detailed 1500-word essay about the history of databases. Take your time and be thorough.";
const QUICK_PROMPT = "Reply with exactly: PROBE-OK";

const proc = spawn(GROK, ["agent", "stdio"], {
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
  if (s) console.error("[stderr]", s.slice(0, 200));
});

const rl = readline.createInterface({ input: proc.stdout });
let nextId = 1;
const pending = new Map();

// 时间线：记录每个关键事件相对起点 ms
const t0 = Date.now();
const el = () => String(Date.now() - t0).padStart(6);
function mark(msg) {
  console.log(`[${el()}ms] ${msg}`);
}

function send(method, params, tag) {
  const id = nextId++;
  mark(`>>> 发送 ${method}  (id=${id}${tag ? ", " + tag : ""})`);
  proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  return new Promise((resolve) => {
    pending.set(id, { resolve, tag });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        resolve({ __timeout: true });
      }
    }, 120000);
  });
}

let firstTurnChunks = 0;
let sawPrompt1Done = false;

rl.on("line", (line) => {
  line = line.trim();
  if (!line) return;
  let data;
  try {
    data = JSON.parse(line);
  } catch {
    return;
  }

  // 对我们发出的请求的应答
  if (data.id !== undefined && pending.has(data.id)) {
    const { resolve, tag } = pending.get(data.id);
    pending.delete(data.id);
    const isErr = !!data.error;
    mark(
      `<<< 应答 id=${data.id}${tag ? " (" + tag + ")" : ""} ` +
        (data.__timeout
          ? "TIMEOUT"
          : isErr
            ? `ERROR ${JSON.stringify(data.error).slice(0, 200)}`
            : "OK")
    );
    resolve(data.result ?? data.error ?? {});
    return;
  }

  if (data.method === "session/update") {
    const u = data.params?.update || {};
    if (u.sessionUpdate === "agent_message_chunk") {
      firstTurnChunks++;
      if (firstTurnChunks === 1) mark("    [首个 turn] 开始收到输出流");
      if (firstTurnChunks % 25 === 0) mark(`    [首个 turn] 已收到 ${firstTurnChunks} 个 chunk`);
    }
    return;
  }

  // agent 主动请求（权限等）：一律放行，避免卡住
  if (data.method && data.id !== undefined) {
    mark(`    agent->client 请求: ${data.method}`);
    let result = {};
    if (data.method === "session/request_permission") {
      const opts = data.params?.options || [];
      const allow = opts.find((o) => /allow|approve|yes/i.test(o.optionId || ""));
      result = { outcome: { outcome: "selected", optionId: allow?.optionId ?? "allow_once" } };
    }
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: data.id, result }) + "\n");
  }
});

try {
  await send("initialize", {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
  });
  const s = await send("session/new", { cwd: "D:\\项目\\Grok Build", mcpServers: [] });
  const sid = s?.sessionId;
  mark(`session/new -> ${sid}`);
  await send("session/set_mode", { sessionId: sid, modeId: "bypassPermissions" }, "完全访问");

  // 第 1 个：慢任务（不 await，让它在后台跑）
  mark("=== 发起慢任务 prompt #1（不等待）===");
  const p1 = send(
    "session/prompt",
    { sessionId: sid, prompt: [{ type: "text", text: SLOW_PROMPT }] },
    "慢任务"
  );

  // 等它真的开始产出
  await new Promise((r) => setTimeout(r, 6000));

  mark(`=== agent 仍在跑？已收到 ${firstTurnChunks} chunk；现在并发发 prompt #2 ===`);
  const p2 = send(
    "session/prompt",
    { sessionId: sid, prompt: [{ type: "text", text: QUICK_PROMPT }] },
    "快任务"
  );

  const r2 = await Promise.race([p2, new Promise((r) => setTimeout(() => r({ __raced: true }), 15000))]);
  mark(
    `=== prompt #2 在 15s 内的结果: ` +
      (r2?.__raced ? "仍未返回（说明被串行排队）" : JSON.stringify(r2).slice(0, 150))
  );

  const r1 = await Promise.race([p1, new Promise((r) => setTimeout(() => r({ __raced: true }), 90000))]);
  sawPrompt1Done = !r1?.__raced;
  mark(`=== prompt #1 ${sawPrompt1Done ? "完成" : "90s 仍未完成"}`);

  console.log("\n===== 结论提示 =====");
  console.log("若 prompt #2 返回 ERROR  -> ACP 拒绝并发，前端不能放开边跑边发");
  console.log("若 prompt #2 立刻 OK     -> ACP 接受并发（前端可放开，语义需再确认是排队还是抢先）");
  console.log("若 prompt #2 迟迟不返回  -> 服务端串行排队（前端放开也只会排队）");
} catch (e) {
  console.error("[FAIL]", e.message);
} finally {
  rl.close();
  proc.kill();
  setTimeout(() => process.exit(0), 300);
}
