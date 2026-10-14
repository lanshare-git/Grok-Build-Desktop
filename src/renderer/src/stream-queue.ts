/**
 * 渲染进程的 session/update 合帧队列。
 *
 * 单独成模块而不是放在 App.tsx 里：`actions.ts` 也需要查询「该会话是否还有
 * update 没应用完」（用来判断重放是否真的结束），若直接从 App.tsximport
 * 会形成 actions ↔ App 的循环依赖。
 *
 * 为什么要合帧 + 批量（性能实测，非推测）：
 * zustand persist 在**每次 set()** 之后都会把整个 store 做 partialize +
 * JSON.stringify 写 localStorage。本机实测单次 547KB / 约 6.6ms。
 * 大会话重放 732 条 update，逐条 applyStream = 732 次全量序列化 ≈ 4.8s 纯阻塞，
 * 期间主线程无法响应任何输入 —— 这正是「输入框卡死」的**主因**。
 * 整批一次 applyStreamBatch 后降到十几批 ≈ 十几毫秒。
 */

import { useStore } from './store'
import type { AcpStreamEvent } from '@shared/types'

let streamQueue: AcpStreamEvent[] = []
let streamFrame = 0
let replayTimer: ReturnType<typeof setTimeout> | null = null

/** 重放限流间隔：每放行一批后留这段时间给主线程响应用户输入 */
const REPLAY_THROTTLE_MS = 150

/**
 * 重放中的批次攒够这个量就立即放行，避免小批次永远被压住导致迟迟不显示。
 * 取 60：实测大会话重放 732 条，按 60 分批是 13 批 × 150ms ≈ 2s，
 * 既不会让用户觉得久，又能让主线程每 150ms 获得一次喘息。
 */
const REPLAY_BATCH_MIN = 60

/**
 * ⚠️ 攒批的**兜底超时**（必读，踩过坑）：批次不足 REPLAY_BATCH_MIN 时会等待，
 * 但**总条数可能本来就少于这个阈值** —— 例如只有 2 条 update 的小会话。
 * 若只等「攒够 60 条」而没有超时兜底，队列会**永久卡住**：
 * 永远攒不够 → 永远不放行 → 进度条永远停在 0/2 且一直转圈。
 * （这个 bug 在 0.13.1 就存在，当时进度条不显示计数所以被掩盖，
 * 0.14.8 显示了 N/M 才暴露出来。）
 *
 * 所以：等到 REPLAY_BATCH_WAIT_MS 就**无条件放行**，宁可批次小一点。
 * 取 400ms：小会话的等待体感可接受，大会话本来就远超阈值不受影响。
 */
const REPLAY_BATCH_WAIT_MS = 400

/**
 * 静默兜底时长：超过这么久没收到该会话的 update，就认为重放结束。
 * 用来防止个别 update 丢失导致进度条永远卡在 99%。
 * 取 1200ms：要大于 REPLAY_THROTTLE_MS(150) 与主进程下发节奏，又不至于让人等太久。
 */
const REPLAY_IDLE_MS = 1200

/** 当前正在「攒批等待」的时刻（0 = 未在等待）。用于实现上面的兜底超时 */
let batchWaitStartedAt = 0

function applyBatch(events: AcpStreamEvent[]): void {
  // 必须走批量接口：逐条 set 会把 persist 的全量序列化放大成数百次
  useStore.getState().applyStreamBatch(events)
}

function scheduleNextFlush(): void {
  if (streamFrame || replayTimer) return
  if (streamQueue.length === 0) return
  streamFrame = requestAnimationFrame(flushStreamQueue)
}

function flushStreamQueue(): void {
  streamFrame = 0
  if (streamQueue.length === 0) {
    // 队列空了。结束重放态要**两个条件同时成立**才算稳：
    //   ① 主进程报的总条数已全部应用完（精确信号）
    //   ② 或者已经静默一小会儿（兜底，防止个别 update 丢失导致进度条永远卡住）
    // 只判「队列空」是不够的：flush 里 streamQueue 刚被清空过，
    // 而主进程 732 条 update 是连续 emit 的，IPC 投递有微小延迟，
    // 此刻判空会**提前宣告加载完成**—— 正是「只加载了一部分」的成因。
    for (const id of useStore.getState().reloadingSessions) {
      maybeFinishReplay(id)
    }
    return
  }

  const batch = streamQueue
  const sessionId = batch[0].sessionId
  const reloading = useStore.getState().reloadingSessions.includes(sessionId)

  if (reloading && batch.length < REPLAY_BATCH_MIN) {
    /**
     * 已知总数、且队列里已经「到齐」→ 立刻放行，一毫秒都不等。
     * 这是小会话（只有 2~59 条 update）不卡的关键：
     * 攒批的目的是减少 set 次数，但小会话攒满了也就省不了几次，
     * 干等反而让用户看到「0/2 条」转圈 —— 得不偿失。
     */
    const p = useStore.getState().replayProgress[sessionId]
    const allArrived = !!p && p.total > 0 && p.applied + batch.length >= p.total
    if (!allArrived) {
      // 没到齐：等后续通知，但**必须有兜底超时**。
      // ⚠️ 总条数可能本来就少于 REPLAY_BATCH_MIN（老会话 total 未知、或个别 update 丢失），
    // 没有超时就会**永久攒不够 → 永不放行 → 进度条卡住一直转**。
      // （这个 bug 在 0.13.1 就有，当时进度条不显示计数所以被掩盖。）
      if (batchWaitStartedAt === 0) batchWaitStartedAt = Date.now()
      const waitedLongEnough = Date.now() - batchWaitStartedAt >= REPLAY_BATCH_WAIT_MS
      if (!waitedLongEnough) {
     if (!replayTimer) {
          replayTimer = setTimeout(() => {
      replayTimer = null
   if (streamQueue.length) scheduleNextFlush()
          }, REPLAY_THROTTLE_MS)
        }
        return
      }
      // 超时：一律放行（宁可批次小，也不能不放）
    }
  }

  batchWaitStartedAt = 0
  streamQueue = []
  applyBatch(batch)

  if (reloading) {
    // 只推进计数，**不在这里判定结束**（此刻 streamQueue 已清空，判空必然为真）
    useStore.getState().advanceReplayProgress(sessionId, batch.length)
    maybeFinishReplay(sessionId)

    // 限流：留一段间隔再放行下一批，主线程得以响应用户输入
    if (!replayTimer) {
      replayTimer = setTimeout(() => {
        replayTimer = null
        if (streamQueue.length) scheduleNextFlush()
      }, REPLAY_THROTTLE_MS)
    }
  } else {
    scheduleNextFlush()
  }
}

/**
 * 判断某个会话的重放是否可以收尾。
 * 条件：主进程报的总数已应用完，或已静默 IDLE_MS（兜底，防止个别 update 丢失卡死进度条）。
 */
function maybeFinishReplay(sessionId: string): void {
  if (hasPendingStreamFor(sessionId)) return
  const store = useStore.getState()
  if (!store.reloadingSessions.includes(sessionId)) return
  const p = store.replayProgress[sessionId]
  if (!p) return
  // total === 0 → 主进程已明确告知「无历史可重放」，立即收尾。
 // total < 0（初始值）→ 总数尚未到达，**不能收尾**，否则会在 replay_begin 之前就宣告完成。
  if (p.total === 0) {
    store.finishSessionReplay(sessionId)
    return
  }
  if (p.total < 0) return
  const complete = p.applied >= p.total
  const idle = p.lastAt > 0 && Date.now() - p.lastAt >= REPLAY_IDLE_MS
  if (complete || idle) store.finishSessionReplay(sessionId)
}

/** 订阅端收到一条 session/update 时的唯一入口 */
export function enqueueStreamEvent(event: AcpStreamEvent): void {
  // 主进程下发的第一条是「重放开始」标记，**只带总数、不含内容**。
  // 必须先处理它再入队：这样后续几百条 update 到达时，渲染层**已经知道总数**，
  // 可以判断「队列是否已到齐」→ 小会话无需等兜底超时即可立刻放行
  //（否则 2 条 update 的会话要白等 400ms 才显示内容，观感就是「半天转不出来」）。
  if (event.update?.sessionUpdate === 'replay_begin') {
    const total = Number(event.update.total ?? 0)
    // total=0 表示「这个会话没有历史可重放」（空会话/新会话）：
 // 必须立刻收尾，否则只能干等 REPLAY_IDLE_MS 静默兜底才停，白转 1.2s。
    if (total <= 0) {
      useStore.getState().setReplayTotal(event.sessionId, 0)
      useStore.getState().finishSessionReplay(event.sessionId)
      return
    }
    useStore.getState().setReplayTotal(event.sessionId, total)
    return
  }
  streamQueue.push(event)
  scheduleNextFlush()
}

/** 该会话是否还有 update 排在渲染队列里没应用完 */
export function hasPendingStreamFor(sessionId: string): boolean {
  return streamQueue.some((e) => e.sessionId === sessionId)
}

/**
 * loadSession 返回后调用：把主进程报的重放总条数写进进度，
 * 并在「已应用完 / 已静默」时结束重放态。
 *
 * 为什么要两个信号：主进程已保证「重放下发完」才返回，但 IPC 投递是异步的，
 * 此刻队列里可能还压着几百条。若此时无条件清 reloadingSessions，
 * 界面就会提前显示「加载完成」—— 用户反馈的「只加载了一部分」。
 */
export function finishReplayIfIdle(sessionId: string, total?: number): void {
  const store = useStore.getState()
  if (total !== undefined && total > 0) {
    store.setReplayTotal(sessionId, total)
  }
  maybeFinishReplay(sessionId)
}
