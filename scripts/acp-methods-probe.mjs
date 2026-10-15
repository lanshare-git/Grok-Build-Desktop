import { spawn } from 'child_process'
import { createInterface } from 'readline'

const proc = spawn(process.env.HOME + '/.grok/bin/grok.exe', ['agent', 'stdio'], { stdio: ['pipe', 'pipe', 'pipe'] })
const rl = createInterface({ input: proc.stdout })
let id = 0
const pending = new Map()

function send(method, params) {
  const reqId = ++id
  return new Promise((resolve, reject) => {
    pending.set(reqId, { resolve, reject })
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: reqId, method, params }) + '\n')
  })
}

rl.on('line', (line) => {
  try {
    const data = JSON.parse(line)
    if (data.id !== undefined && pending.has(data.id)) {
      const p = pending.get(data.id)
      pending.delete(data.id)
      if (data.error) p.reject(new Error(data.error.message))
      else p.resolve(data.result)
    }
  } catch {}
})

async function probe() {
  const init = await send('initialize', { protocolVersion: '1.0' })
  console.log('protocol', init.protocolVersion)

  await send('authenticate', { methodId: 'cached_token' })

  const s = await send('session/new', {})
  const sid = s.sessionId
  console.log('session', sid)

  for (const method of ['tool/cancel', 'session/abort', 'session/stop', 'tool/stop']) {
    try {
      const r = await send(method, { sessionId: sid, toolCallId: 'test' })
      console.log(`[OK] ${method} ->`, JSON.stringify(r))
    } catch (e) {
      console.log(`[ERR] ${method} ->`, e.message)
    }
  }

  proc.kill()
  setTimeout(() => process.exit(0), 500)
}

probe().catch(e => { console.error(e); process.exit(1) })
