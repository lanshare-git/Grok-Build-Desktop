// 验证：对同一 session 连续两次 session/load，第二次是否仍会重放历史
import { spawn } from "node:child_process";
import readline from "node:readline";
import { readFileSync } from "node:fs";
import { resolveGrokBin, resolveProbeCwd } from "./probe-env.mjs";

const GROK = resolveGrokBin();
const CFG = JSON.parse(readFileSync(process.argv[2], "utf8"));

const proc = spawn(GROK, ["agent", "--always-approve", "stdio"], {
  stdio: ["pipe", "pipe", "pipe"],
  env: {
    ...process.env,
    GROK_DISABLE_AUTOUPDATER: "1",
  },
});

const rl = readline.createInterface({ input: proc.stdout });
let nextId = 1;
const pending = new Map();
let bucket = [];
let phase = "init";
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

function report() {
  const c = {};
  bucket.forEach((k) => (c[k] = (c[k] || 0) + 1));
  const users = bucket.filter((k) => k === "user_message_chunk").length;
  console.log(
    `[${phase}] total=${bucket.length} user_chunks=${users} @${Date.now() - t0}ms ${JSON.stringify(c)}`
  );
  bucket = [];
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
    bucket.push(d.params?.update?.sessionUpdate);
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
  console.log("[ok] initialize");

  phase = "load#1";
  await send("session/load", {
    sessionId: CFG.sessionId,
    cwd: CFG.cwd,
    mcpServers: [],
  });
  await new Promise((x) => setTimeout(x, 5000));
  report();

  phase = "load#2 (same session, already loaded)";
  await send("session/load", {
    sessionId: CFG.sessionId,
    cwd: CFG.cwd,
    mcpServers: [],
  });
  await new Promise((x) => setTimeout(x, 5000));
  report();

  phase = "load#3";
  await send("session/load", {
    sessionId: CFG.sessionId,
    cwd: CFG.cwd,
    mcpServers: [],
  });
  await new Promise((x) => setTimeout(x, 5000));
  report();
} catch (e) {
  console.error("FAIL", e.message);
} finally {
  rl.close();
  proc.kill();
  setTimeout(() => process.exit(0), 300);
}
