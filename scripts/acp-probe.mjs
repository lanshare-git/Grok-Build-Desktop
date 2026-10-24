// ACP stdio probe: verify handshake + one real prompt against `grok agent stdio`
import { spawn } from "node:child_process";
import readline from "node:readline";
import { resolveGrokBin, resolveProbeCwd } from "./probe-env.mjs";

const GROK = resolveGrokBin();

const proc = spawn(GROK, ["agent", "--always-approve", "stdio"], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, GROK_DISABLE_AUTOUPDATER: "1" },
});

proc.stderr.on("data", (d) => {
  const s = d.toString().trim();
  if (s) console.error("[stderr]", s.slice(0, 400));
});

const rl = readline.createInterface({ input: proc.stdout });

let nextId = 1;
const pending = new Map();

function send(method, params) {
  const id = nextId++;
  const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params });
  proc.stdin.write(msg + "\n");
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

let sessionId = null;
const seen = new Set();
const events = [];

rl.on("line", (line) => {
  line = line.trim();
  if (!line) return;
  let data;
  try {
    data = JSON.parse(line);
  } catch {
    console.error("[non-json]", line.slice(0, 200));
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
    seen.add(kind);
    events.push(kind);
    if (kind === "agent_message_chunk") process.stdout.write(u.content?.text || "");
    else if (kind === "agent_thought_chunk") process.stdout.write(`\x1b[2m${u.content?.text || ""}\x1b[0m`);
    else if (kind === "tool_call") console.log(`\n  [tool_call] ${u.title} kind=${u.kind} status=${u.status}`);
    else if (kind === "tool_call_update") console.log(`  [tool_update] ${u.toolCallId?.slice(0, 12)} -> ${u.status}`);
    else if (kind === "plan") console.log(`  [plan] ${JSON.stringify(u.entries)?.slice(0, 200)}`);
    else console.log(`  [${kind}] ${JSON.stringify(u).slice(0, 160)}`);
    return;
  }

  // agent -> client requests (e.g. permission) must be answered
  if (data.method && data.id !== undefined) {
    console.log(`\n  [agent->client request] ${data.method}`);
    const result =
      data.method === "session/request_permission"
        ? { outcome: { outcome: "selected", optionId: "allow_once" } }
        : {};
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: data.id, result }) + "\n");
  }
});

const t0 = Date.now();
try {
  const init = await send("initialize", {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
  });
  console.log(`[ok] initialize (${Date.now() - t0}ms)`);
  console.log("     agentInfo:", JSON.stringify(init?.agentInfo ?? init?._meta?.agentInfo ?? {}).slice(0, 300));
  console.log("     authMethods:", JSON.stringify(init?.authMethods ?? []).slice(0, 200));
  console.log("     protocolVersion:", init?.protocolVersion);
  const caps = Object.keys(init?.agentCapabilities ?? {});
  console.log("     agentCapabilities:", caps.join(", "));

  const s = await send("session/new", {
    cwd: "D:\\项目\\Grok Build",
    mcpServers: [],
    _meta: { yoloMode: true },
  });
  sessionId = s?.sessionId;
  console.log(`[ok] session/new -> ${sessionId}`);
  if (s?.configOptions) {
    console.log("     configOptions:", s.configOptions.map((o) => o.configId).join(", "));
  }

  console.log("\n--- prompt: reply with exactly the word PONG ---\n");
  const r = await send("session/prompt", {
    sessionId,
    prompt: [{ type: "text", text: "Reply with exactly the word PONG and nothing else." }],
  });
  console.log("\n\n[ok] session/prompt done:", JSON.stringify(r).slice(0, 200));
  console.log("[event kinds seen]", [...seen].join(", "));
} catch (e) {
  console.error("[FAIL]", e.message);
} finally {
  rl.close();
  proc.kill();
  setTimeout(() => process.exit(0), 300);
}
