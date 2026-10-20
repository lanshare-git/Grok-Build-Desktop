// Probe `_x.ai/session_notification` background_tasks payload shape.
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
const bgEvents = []

function send(method, params = {}, timeoutMs = 180_000) {
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

rl.on('line', (line) => {
  const t = line.trim()
  if (!t) return
  let msg
  try {
    msg = JSON.parse(t)
  } catch {
    return
  }
  if (msg.id !== undefined && pending.has(msg.id) && msg.method === undefined) {
    const resolve = pending.get(msg.id)
    pending.delete(msg.id)
    resolve(msg)
    return
  }
  if (msg.method && msg.id !== undefined) {
    const result =
      msg.method === 'session/request_permission'
        ? { outcome: { outcome: 'selected', optionId: 'allow_once' } }
        : {}
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }) + '\n')
    return
  }
  if (msg.method === '_x.ai/session_notification') {
    const update = msg.params?.update || {}
    if (update.sessionUpdate === 'background_tasks') {
      bgEvents.push(msg.params)
      console.log('[bg]', JSON.stringify(msg.params).slice(0, 2000))
    } else {
      console.log('[notif]', update.sessionUpdate)
    }
  }
})

try {
  await send('initialize', {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false }
  })
  await send('authenticate', { methodId: 'cached_token' })
  const created = await send('session/new', {
    cwd: CWD,
    mcpServers: [],
    _meta: { yoloMode: true }
  })
  const sid = created.result?.sessionId
  console.log('[ok] session', sid)

  const prompt =
    'Call run_terminal_command (or the shell tool) with background=true to run: ' +
    'powershell -NoProfile -Command "Start-Sleep -Seconds 45; Write-Output BG_DONE". ' +
    'Do not wait for it. After it starts, reply with exactly STARTED.'

  console.log('[prompt] …')
  const done = await send(
    'session/prompt',
    { sessionId: sid, prompt: [{ type: 'text', text: prompt }] },
    180_000
  )
  console.log('[prompt done]', JSON.stringify(done.result ?? done.error).slice(0, 300))
  await new Promise((r) => setTimeout(r, 4000))
  console.log('[summary] bg events =', bgEvents.length)
  for (const e of bgEvents) {
    console.log('[dump]', JSON.stringify(e, null, 2).slice(0, 3000))
  }
} catch (err) {
  console.error('[FAIL]', err)
} finally {
  rl.close()
  proc.kill()
  setTimeout(() => process.exit(0), 200)
}
