import pkg from '../out/main/index.js'
const { AcpClient } = pkg

const c = new AcpClient()
let sessionId = ''
let toolCallId = ''
let inProgressAt = 0

function log(...a) { console.log(...a) }

async function probe() {
  await c.start()
  log('[ok] agent ready')

  const init = await c.request('initialize', {})
  log('[ok] initialize', init.protocolVersion)

  await c.request('authenticate', { methodId: 'cached_token' })
  log('[ok] auth')

  const s = await c.request('session/new', {})
  sessionId = s.sessionId
  log('[ok] session/new ->', sessionId)

  await c.request('session/set_mode', { sessionId, modeId: 'bypassPermissions' })
  log('[ok] set_mode bypassPermissions')

  const promptPromise = c.request('session/prompt', {
    sessionId,
    text: 'Execute a command that sleeps for 120 seconds using timeout /T 120'
  })

  c.on('stream', ({ update }) => {
    if (update?.sessionUpdate === 'tool_call') {
      toolCallId = update.toolCallId
      log('[tool] tool_call id=', toolCallId)
    }
    if (update?.sessionUpdate === 'tool_call_update') {
      log('[tool] tool_call_update id=', update.toolCallId, 'status=', update.status)
      if (update.status === 'in_progress' && !inProgressAt) {
        inProgressAt = Date.now()
        log('=== tool in_progress detected, trying cancel methods ===')
        tryMethods()
      }
    }
  })

  async function tryMethods() {
    log('>>> method 1: session/cancel')
    c.notify('session/cancel', { sessionId })

    await new Promise(r => setTimeout(r, 3000))
    log('>>> method 2: tool/cancel (may not exist)')
    try { await c.request('tool/cancel', { sessionId, toolCallId }) } catch(e) { log('tool/cancel error:', e.message) }

    await new Promise(r => setTimeout(r, 3000))
    log('>>> method 3: session/abort (may not exist)')
    try { await c.request('session/abort', { sessionId }) } catch(e) { log('session/abort error:', e.message) }
  }

  try {
    const res = await promptPromise
    log('<<< prompt returned stopReason=', res.stopReason)
  } catch (e) {
    log('<<< prompt error:', e.message)
  }

  await new Promise(r => setTimeout(r, 10000))
  log('=== 10s observation done ===')
  await c.stop()
}

probe().catch(e => { console.error(e); process.exit(1) })
