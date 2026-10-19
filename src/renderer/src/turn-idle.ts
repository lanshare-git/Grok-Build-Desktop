/**
 * 回合空闲兜底：agent 已停更（无 session/update）、也无工具/权限在飞，
 * 但 `session/prompt` 迟迟不返回 → UI 一直「Agent 正在工作…」。
 *
 * 主进程对单条 prompt 的超时是 60 分钟（service.prompt），干等体感就是卡死。
 * 这里在空闲超过阈值后发 `session/cancel`，让 prompt 返回、sendPrompt 的 finally
 * 收尾 running / streaming（与用户点 ■ 同路径）。
 *
 * ⚠️ 有工具 in_progress / pending，或挂着权限/提问时**绝不**自动 cancel——
 * 长命令与等用户点批准都是正常静默，只能再等一轮。
 *
 * ⚠️ 阈值必须覆盖「工具间歇的长思考」：推理模型两批工具之间静默数分钟很常见，
 * 90s 会误伤（cancel 插入时间线后 agent 仍继续吐工具）。提示也推迟到 prompt
 * 真正返回且期间无再收到 update 时再贴，避免「已结束」与「正在工作」并存。
 */

import { useStore } from './store'

/** 无活动多久后自动打断（仅当无开放中的工具/权限/提问） */
const TURN_IDLE_CANCEL_MS = 5 * 60 * 1000

const idleTimers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * 空闲兜底已对某会话发过 cancel，等 prompt 返回后再决定是否提示。
 * 若 cancel 之后又收到 update，从集合里删掉——说明不是真挂死，不贴误导文案。
 */
const idleCancelPending = new Set<string>()

/** 该会话是否还有「正常静默」理由（工具在跑 / 等用户） */
function hasOpenWork(sessionId: string): boolean {
  const s = useStore.getState()
  const session = s.sessions.find((x) => x.id === sessionId)
  if (!session) return false
  for (const it of session.items) {
    if (it.kind === 'tool' && (it.status === 'in_progress' || it.status === 'pending')) {
      return true
    }
  }
  if (s.permissions.some((p) => p.sessionId === sessionId)) return true
  if (s.questions.some((q) => q.sessionId === sessionId)) return true
  return false
}

function clearIdleTimer(sessionId: string): void {
  const t = idleTimers.get(sessionId)
  if (!t) return
  clearTimeout(t)
  idleTimers.delete(sessionId)
}

/**
 * 打断指定会话的当前回合（不要求是 active）。
 * 与 Composer 点 ■ 同语义：发 cancel + 清待响应面板 + 延迟扫卡死工具。
 */
export function cancelSessionTurn(sessionId: string): void {
  const store = useStore.getState()
  const session = store.sessions.find((x) => x.id === sessionId)
  if (!session) return

  const pendingToolCallIds: string[] = []
  for (const it of session.items) {
    if (it.kind === 'tool' && (it.status === 'in_progress' || it.status === 'pending')) {
      pendingToolCallIds.push(it.toolCallId)
    }
  }

  void window.grok.cancel(sessionId)
  // 只清「本会话」相关的待响应；clearAllPrompts 会误伤其它会话的弹窗
  for (const p of store.permissions) {
    if (p.sessionId === sessionId) store.clearPermission(p.requestId)
  }
  for (const q of store.questions) {
    if (q.sessionId === sessionId) store.clearQuestion(q.requestId)
  }

  if (pendingToolCallIds.length === 0) return
  window.setTimeout(() => {
    useStore.getState().markStuckTools(sessionId, undefined, pendingToolCallIds)
  }, 15_000)
}

function armIdleTimer(sessionId: string): void {
  clearIdleTimer(sessionId)
  const timer = setTimeout(() => {
    idleTimers.delete(sessionId)
    onIdleFired(sessionId)
  }, TURN_IDLE_CANCEL_MS)
  idleTimers.set(sessionId, timer)
}

function onIdleFired(sessionId: string): void {
  const s = useStore.getState()
  if (!s.running.includes(sessionId)) return

  // 工具还在跑 / 等用户：不是挂死，再等一个空闲窗口
  if (hasOpenWork(sessionId)) {
    armIdleTimer(sessionId)
    return
  }

  // 先记 pending 再 cancel；提示留给 sendPrompt finally（见 consumeIdleCancelled）
  idleCancelPending.add(sessionId)
  cancelSessionTurn(sessionId)
}

/** sendPrompt 进入在飞回合时调用：开始盯空闲 */
export function noteTurnStarted(sessionId: string): void {
  idleCancelPending.delete(sessionId)
  armIdleTimer(sessionId)
}

/** sendPrompt finally / 回合计数归零时调用 */
export function noteTurnEnded(sessionId: string): void {
  clearIdleTimer(sessionId)
}

/**
 * 收到该会话的 session/update（非重放）时调用：重置空闲计时。
 * 未在跑的会话忽略。
 * cancel 之后若又有输出，撤掉 pending，避免回合结束后还贴「已自动结束」。
 */
export function noteTurnActivity(sessionId: string): void {
  if (!useStore.getState().running.includes(sessionId)) return
  idleCancelPending.delete(sessionId)
  armIdleTimer(sessionId)
}

/**
 * prompt 返回时调用：若仍是「空闲 cancel 且中途无再产出」则贴提示并返回 true。
 * 由 actions.sendPrompt 的 finally 调用（此时再 appendNotice，不会插进半截工具流）。
 */
export function consumeIdleCancelled(sessionId: string): boolean {
  if (!idleCancelPending.has(sessionId)) return false
  idleCancelPending.delete(sessionId)
  return true
}
