// Wait for background task completion + probe kill methods.
import { spawn } from 'node:child_process'
import readline from 'node:readline'

const GROK = process.env.GROK_BIN || 'C:\\Users\\fanji\\.grok\\bin\\grok.exe'
const CWD = process.env.PROBE_CWD || 'D:\\项目\\Grok Build'
const proc = spawn(GROK, ['agent', '--always-approve', '--no-leader', 'stdio'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...process.env,
    GROK_DISABLE_AUTOUPDATER: '1',
    HTTP_PROXY: process.env.HTTP_PROXY || 'http://127.0.0.1:10808',
    HTTPS_PROXY: process.env.HTTPS_PROXY || 'http://127.0.0.1:10808'
  }
})
const rl = readline.createInterface({ input: proc.stdout })
let nextId = 1
const pending = new Map()
function send(method, params = {}, timeoutMs = 60_000) {
  const id = nextId++
  proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  return new Promise((resolve) => {
    pending.set(id, resolve)
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        resolve({ error: { message: `timeout ${method}` } })
      }
    }, timeoutMs)
  })
}
let lastTasks = []
rl.on('line', (line) => {
  let msg
  try {
    msg = JSON.parse(line.trim())
  } catch {
    return
  }
  if (msg.id !== undefined && pending.has(msg.id) && msg.method === undefined) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
    return
  }
  if (msg.method && msg.id !== undefined) {
    proc.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result:
          msg.method === 'session/request_permission'
            ? { outcome: { outcome: 'selected', optionId: 'allow_once' } }
            : {}
      }) + '\n'
    )
    return
  }
  if (msg.method === '_x.ai/session_notification' && msg.params?.update?.sessionUpdate === 'background_tasks') {
    lastTasks = msg.params.update.tasks || []
    console.log(
      '[bg]',
      lastTasks.map((t) => `${t.status}:${t.task_id?.slice(0, 8)}:${t.kind}`).join(' | ')
    )
    console.log('[keys]', lastTasks[0] ? Object.keys(lastTasks[0]) : [])
  }
})

await send('initialize', {
  protocolVersion: 1,
  clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false }
})
await send('authenticate', { methodId: 'cached_token' })
const sid = (
  await send('session/new', { cwd: CWD, mcpServers: [], _meta: { yoloMode: true } })
).result.sessionId
await send(
  'session/prompt',
  {
    sessionId: sid,
    prompt: [
      {
        type: 'text',
        text:
          'Start a background shell: powershell -NoProfile -Command "Start-Sleep -Seconds 6; echo DONE". Reply STARTED now.'
      }
    ]
  },
  120_000
)
console.log('waiting completions…')
await new Promise((r) => setTimeout(r, 15_000))
console.log('final tasks', JSON.stringify(lastTasks, null, 2).slice(0, 2500))

const tid = lastTasks[0]?.task_id
const attempts = [
  ['x.ai/kill_task', { sessionId: sid, taskId: tid }],
  ['x.ai/task/kill', { sessionId: sid, task_id: tid }],
  ['_x.ai/kill_task', { sessionId: sid, taskId: tid }],
  ['session/kill_task', { sessionId: sid, taskId: tid }],
  ['ext_method', { method: 'x.ai/kill_task', params: { sessionId: sid, taskId: tid } }]
]
for (const [m, p] of attempts) {
  const r = await send(m, p, 8_000)
  console.log(m, r.error ? `ERR ${JSON.stringify(r.error).slice(0, 140)}` : `OK ${JSON.stringify(r.result).slice(0, 140)}`)
}
rl.close()
proc.kill()
setTimeout(() => process.exit(0), 200)
