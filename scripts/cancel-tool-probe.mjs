// 探测：agent 正在执行一个**长时间工具调用**时，客户端发 session/cancel 会怎样。
//
// 背景：0.25.0 的 ■ 停止按钮只在「prompt 级别 running」时出现（actions.activeTurns 计数）。
// 但「请求失败：请求超时：session/prompt」之后 prompt 已结束、running=false → ■ 消失，
// 而 agent 内部的 tool 还在 in_progress（tool 级别卡住）。
// 本探针回答：**tool 卡住时发 session/cancel，到底能不能让 tool 停下来**。
//
// 判定口径：
//   - tool_call_update 变成 failed / cancelled  -> ACP 支持打断 tool，补按钮有意义
//   - tool 仍停留在 in_progress、迟迟不变        -> ACP 停不掉，补按钮只是「发个信号」
//   - prompt 请求随即返回                        -> cancel 至少让 prompt 层面收尾
//
// 用法: node scripts/cancel-tool-probe.mjs
import { spawn } from "node:child_process";
import readline from "node:readline";

const GROK = process.env.GROK_BIN || "C:\\Users\\fanji\\.grok\\bin\\grok.exe";
// 一个明确耗时的命令：Windows 下 sleep 120 秒
const SLOW_CMD = "Use the bash tool to run exactly: timeout /T 120 /NOBREAK";

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

const t0 = Date.now();
const el = () => String(Date.now() - t0).padStart(6);
function mark(msg) {
  console.log(`[${el()}ms] ${msg}`);
}

function send(method, params, tag) {
  const id = nextId++;
  mark(`>>> 发送 ${method} (id=${id}${tag ? ", " + tag : ""})`);
  proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  return new Promise((resolve) => {
    pending.set(id, { resolve, tag });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        resolve({ __timeout: true });
      }
    }, 180000);
  });
}

/** notify：单向，不等响应（session/cancel 就是这种） */
function notify(method, params) {
  mark(`>>> notify ${method}`);
  proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

// tool 状态追踪：toolCallId -> 最后状态
const toolState = new Map();
let promptReturned = false;

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
    const { resolve, tag } = pending.get(data.id);
    pending.delete(data.id);
    const isErr = !!data.error;
    if (tag === "慢工具任务") promptReturned = true;
    mark(
      `<<< 应答 id=${data.id}${tag ? " (" + tag + ")" : ""} ` +
        (isErr ? `ERROR ${JSON.stringify(data.error).slice(0, 200)}` : "OK " + JSON.stringify(data.result ?? {}).slice(0, 120))
    );
    resolve(data.result ?? data.error ?? {});
    return;
  }

  if (data.method === "session/update") {
    const u = data.params?.update || {};
    const kind = u.sessionUpdate;
    if (kind === "tool_call" || kind === "tool_call_update") {
      const id = u.toolCallId ?? "?";
      const prev = toolState.get(id);
      const st = u.status ?? prev ?? "?";
      toolState.set(id, st);
      mark(
        `    [tool] ${kind} id=${String(id).slice(-12)} status=${st}` +
          ` title=${JSON.stringify(u.title ?? "").slice(0, 60)}`
      );
      return;
    }
    if (kind === "agent_message_chunk") return;
    return;
  }

  // agent 主动请求：一律放行（权限），避免卡住
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

  // 发起会长时间占用 tool 的任务（不 await）
  const p1 = send("session/prompt", { sessionId: sid, prompt: [{ type: "text", text: SLOW_CMD }] }, "慢工具任务");

  // 等 tool 进入 in_progress（最多等 25 秒）
  let started = null;
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 500));
    for (const [id, st] of toolState) {
      if (st === "in_progress") {
        started = id;
        break;
      }
    }
    if (started) break;
  }

  if (!started) {
    mark("!! 25s 内没等到 tool in_progress，无法验证（换个更慢的命令再试）");
  } else {
    mark(`=== tool ${String(started).slice(-12)} 已进入 in_progress，现在发 session/cancel ===`);
    notify("session/cancel", { sessionId: sid });

    // 关键：cancel 之后**持续观察 60 秒**，不因 prompt 返回就提前退出。
    // 要回答的是「UI 上那个转圈最终会不会变 failed」—— 若不变，补 stop 按钮也没意义
    //（点了按钮 agent 收尾了，但卡片永远转圈，用户以为没生效）。
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const st = toolState.get(started);
      if (st !== "in_progress") {
        mark(`=== tool 状态在 cancel 后 ${i * 0.5}s 变为: ${st}`);
        break;
      }
      if (i === 119) mark(`=== 观察满 60s，tool **始终**是 in_progress（补按钮也救不了 UI）`);
    }
    mark(`=== 观察结束，tool 状态: ${JSON.stringify([...toolState])}`);
    mark(`=== prompt 是否已返回: ${promptReturned}`);
  }

  await Promise.race([p1, new Promise((r) => setTimeout(r, 20000))]);

  console.log("\n===== 结论提示 =====");
  console.log("tool 变 failed/cancelled + prompt 返回  -> ACP **能**打断 tool，补 stop 按钮有意义");
  console.log("tool 仍 in_progress、prompt 不返回      -> ACP 停不掉 tool，补按钮只是发信号，实际要重启 agent");
  console.log("prompt 返回但 tool 仍 in_progress       -> cancel 只收尾了 prompt 层，tool 还在 agent 里跑");
} catch (e) {
  console.error("[FAIL]", e.message);
} finally {
  rl.close();
  proc.kill();
  setTimeout(() => process.exit(0), 300);
}
