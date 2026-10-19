/** 界面动作集合 —— 统一处理 IPC 调用、错误提示与状态流转 */

import { t as tShared } from '@shared/i18n'
import { finishReplayIfIdle, waitForReplay } from './stream-queue'
import { useStore } from './store'
import {
  cancelSessionTurn,
  consumeIdleCancelled,
  noteTurnEnded,
  noteTurnStarted
} from './turn-idle'
import { isLockedChat, sameDir } from './utils'
import type {
  CloseAction,
  DesktopPermToastMode,
  GrokAccount,
  ImageAttachment,
  McpServerInput,
  PermissionMode,
  ToolCallDensity
} from '@shared/types'

/** Electron IPC 抛出的错误带有前缀，剥掉以便展示 */
export function cleanError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  return raw
    .replace(/^Error invoking remote method '[^']*':\s*/, '')
    .replace(/^Error:\s*/, '')
}

export interface PurgeSessionResult {
  ok: boolean
  /** 'trash' = 系统回收站；'quarantine' = 应用内回收站（系统回收站不可用时的兜底） */
  method?: 'trash' | 'quarantine'
  /** method='quarantine' 时的落点，便于在提示里告诉用户去哪找回 */
  quarantinePath?: string
  /** ok=true 但原路径残留了（不含数据的）空壳目录 */
  staleShell?: string
  /** ok=false 时给用户看的失败原因 */
  reason?: string
}

/**
 * 删除会话在磁盘上的落盘目录（`~/.grok/sessions/<编码cwd>/<sessionId>`）。
 * 主进程优先走系统回收站，不可用时移入应用内回收站；两级都不做不可逆直删。
 * 草稿会话（磁盘上没有文件）与「已经不存在」都视为成功。
 *
 * ⚠️ 调用方**应先卸载会话**（`session/close` + `forgetLoadedSession`）：grok 持有会话时
 * 目录会被占用，既可能删不掉、又会被它在删完后重建为空壳（2026-10-14 事故）。
 */
export async function purgeSessionData(session: {
  id: string
  cwd: string
  isDraft?: boolean
}): Promise<PurgeSessionResult> {
  if (session.isDraft) return { ok: true }
  try {
    const res = await window.grok.sessionDeleteData({ cwd: session.cwd, sessionId: session.id })
    if (res.ok) {
      return { ok: true, method: res.method, quarantinePath: res.quarantinePath, staleShell: res.staleShell }
    }
    if (res.error === 'not-found') return { ok: true }
    return { ok: false, reason: res.error ?? '未知错误' }
  } catch (err) {
    return { ok: false, reason: cleanError(err) }
  }
}

/**
 * 把会话搬到另一个工作目录（「任务换工作目录」）。
 *
 * grok / ACP 没有改会话工作目录的接口 —— 实测同一 sessionId 换 cwd 调 session/load
 * 会直接 `FS_NOT_FOUND`（grok 按「编码 cwd + ID」拼路径定位，不是全局按 ID 查）。
 * 唯一可行路径是把落盘目录搬到目标 cwd 的编码目录下，再以新 cwd 加载：
 * 搬完加载成功，且后续回合的 working_directory 就是新目录。搬运逻辑见
 * `main/session-move.ts`。
 *
 * 这里的顺序很关键：
 *  1. 生成中的会话不许搬（那一轮还占着 agent 的会话 actor）；
 *  2. **先卸载**（若已加载）—— 不卸载时 grok 持有该会话的文件句柄，目录 rename 会被占用拦下；
 *  3. 搬磁盘目录；
 *  4. 更新 store 的 cwd（侧栏分组/排序都由它派生）；
 *  5. 若是当前会话，立刻以新 cwd 重新加载（卸载过就必须重建历史，见 closeAgentSession 的说明）。
 */
export async function moveSessionToWorkspace(
  session: { id: string; cwd: string; isDraft?: boolean },
  toCwd: string
): Promise<{ ok: boolean; message: string; dir?: string }> {
  const store = useStore.getState()
  if (!toCwd) return { ok: false, message: '目标工作目录为空' }
  if (sameDir(toCwd, session.cwd)) return { ok: false, message: '已经在目标工作目录下' }
  if (store.running.includes(session.id)) {
    return { ok: false, message: '该会话正在生成中，等这一轮结束再移动' }
  }

  if (!session.isDraft) {
    const wasLoaded = useStore.getState().loadedSessions.includes(session.id)
    if (wasLoaded) {
      try {
        await window.grok.closeSession(session.id)
      } catch (err) {
        // 卸载失败不直接放弃：先试搬移，搬不动会有明确的占用报错
        useStore.getState().pushLog(`[session-move] 卸载会话失败：${cleanError(err)}\n`)
      }
      useStore.getState().forgetLoadedSession(session.id)
    }
    try {
      const res = await window.grok.sessionMoveData({
        sessionId: session.id,
        fromCwd: session.cwd,
        toCwd
      })
      if (!res.ok && res.reason !== 'same-dir') {
        return { ok: false, message: res.detail ?? '搬移失败' }
      }
    } catch (err) {
      return { ok: false, message: cleanError(err) }
    }
  }

  const s = useStore.getState()
  s.setSessionCwd(session.id, toCwd)
  // 新路径下的真实活动时间（排序还要用它）
  void s.refreshActivity([session.id])

  // 之前卸载过 / 或正打开的会话：立刻以新 cwd 重建历史，别让界面停在半截状态
  if (!session.isDraft && s.activeId === session.id) {
    await resumeSession(session.id, toCwd)
  }
  return { ok: true, message: '已移动到新工作目录', dir: toCwd }
}

/**
 * 把当前选择的权限模式同步到指定会话（实时生效，模式含义见 PERMISSION_MODE_OPTIONS）。
 * 会话未加载进 agent 进程时跳过——加载时（resumeSession / sendPrompt）会补同步。
 */
export async function applyPermissionModeToSession(sessionId: string): Promise<void> {
  const store = useStore.getState()
  if (!store.loadedSessions.includes(sessionId)) return
  // 只对「还在主目录下的纯聊天会话」强制只读（plan），不被全局权限模式覆盖
  // （否则恢复/发送时会回退成全局默认）。搬到项目目录的聊天会话已绑定项目，
  // 和普通任务一样跟随全局模式 —— 判据见 utils.isLockedChat。
  const session = store.sessions.find((x) => x.id === sessionId)
  const mode: PermissionMode = isLockedChat(session ?? { cwd: '' }, store.homeDir)
    ? 'plan'
    : store.permissionMode
  try {
    await window.grok.setPermissionMode(sessionId, mode)
  } catch (err) {
    store.appendNotice(sessionId, `切换权限模式失败：${cleanError(err)}`, 'error')
  }
}

export async function connectAgent(): Promise<boolean> {
  const store = useStore.getState()
  try {
    await window.grok.start()
    store.setConnection('ready', 'agent 已就绪')
    return true
  } catch (err) {
    store.setConnection('error', cleanError(err))
    store.toggleDiagnostics(true)
    return false
  }
}

export async function refreshDiagnostics(): Promise<void> {
  try {
    const report = await window.grok.diagnostics()
    useStore.getState().setDiagnostics(report)
  } catch (err) {
    useStore.getState().pushLog(`[diagnostics] ${cleanError(err)}`)
  }
}

export async function chooseCwd(): Promise<string | null> {
  const dir = await window.grok.pickDirectory()
  if (dir) useStore.getState().setCwd(dir)
  return dir
}

/**
 * 切换工作目录（顶栏路径按钮）。
 *
 * 会话的工作目录在 `session/new` 时就定死了，ACP 之后没有「改目录」这回事
 * （grok 甚至按 cwd 分目录存放会话：~/.grok/sessions/<编码后的 cwd>/<sessionId>，
 *  用别的 cwd 去 session/load 会到另一个目录里找，直接找不到）。
 * 所以「换目录」只能靠新建会话实现，并且要明说清楚，避免用户以为当前会话已切过去。
 */
export async function chooseWorkspace(): Promise<void> {
  const store = useStore.getState()
  const current = store.activeSession()

  const dir = await window.grok.pickDirectory()
  if (!dir) return

  useStore.getState().setCwd(dir)

  if (current && sameDir(current.cwd, dir)) {
    store.appendNotice(current.id, `当前会话已经以 ${dir} 为工作目录。`, 'info')
    return
  }

  // 旧会话若是刚建出来还没说过话、输入框也空的空壳，切目录后顺手清掉
  const draft = current ? store.composerDrafts[current.id] : undefined
  const emptyPrevId =
    current &&
    current.items.length === 0 &&
    !(draft && (draft.text.trim() || draft.attachments.length > 0))
      ? current.id
      : null

  await newSession(dir)

  const after = useStore.getState()
  // 新建失败（连接异常）就保留现场，先把错误暴露出来
  if (!after.activeId || after.activeId === emptyPrevId) return
  if (emptyPrevId) after.deleteSession(emptyPrevId)

  const active = useStore.getState().activeSession()
  if (active) useStore.getState().appendNotice(active.id, `已切换到工作目录 ${dir}。`, 'info')
}

/**
 * 新建会话：先只建一个「本地草稿」（不调 grok 的 session/new，磁盘不落文件），
 * 用户首次发送时再由 sendPrompt 真正 newSession 并 materialize。
 * 传入 cwd 时以该目录为根（侧栏分组头的「＋」用）；不传时每次弹目录选择框，
 * 由用户当场选定（取消则放弃新建），不再静默沿用全局默认目录。
 * kind 为展示层标记（当前仅 'chat'）：纯聊天会话不绑定项目，以主目录为根。
 */
export async function newSession(cwd?: string, kind?: 'chat', permissionMode?: PermissionMode): Promise<void> {
  const store = useStore.getState()

  let target = cwd
  if (!target) {
    const picked = await chooseCwd()
    if (!picked) return
    target = picked
  }

  // 纯聊天会话强制只读（plan）；普通会话取传入，否则沿用当时全局权限模式
  const mode = permissionMode ?? store.permissionMode
  store.createDraftSession({ cwd: target, kind, permissionMode: mode })
}

/**
 * 纯聊天 / 临时会话：以用户主目录（homeDir）为工作根新建一个不绑定项目的会话。
 * 不受「默认工作目录」被改到某个项目的影响，始终落在主目录下，UI 上标记为「聊天」。
 */
export async function newChatSession(): Promise<void> {
  const store = useStore.getState()
  const target = store.homeDir || store.cwd
  // 纯聊天锁定只读（plan）：不写文件
  await newSession(target, 'chat', 'plan')
}

/** 恢复已有会话：ACP session/load 会重放历史为 session/update */
export async function resumeSession(sessionId: string, cwd: string): Promise<void> {
  const store = useStore.getState()
  // 草稿会话尚未在 grok 中创建，不能去 loadSession —— 直接选中即可（空 ChatView + 输入框）
  const existing = store.sessions.find((x) => x.id === sessionId)
  if (existing?.isDraft) {
    store.selectSession(sessionId)
    return
  }
  store.selectSession(sessionId)

  const ready = await connectAgent()
  if (!ready) return

  // 该会话若已在当前 agent 进程中加载过，**绝不能再调 session/load**。
  // grok 对同一 session 重复 session/load 会再次全量重放历史（实测同一会话连发
  // 3 次 load，每次都重放 168 条），而重放是以「追加」语义进入 reduceUpdate 的：
  // 重放的第一条 user_message_chunk 会被 appendText 追加到当前 items 的末尾，
  // 于是「用户最先发的那条消息」在界面上跑到了所有回复的最后面 —— 就是这个 bug。
  // 之前只在「未加载」时清空 items，却无条件 load，加载与否两套语义对不上。
  if (useStore.getState().loadedSessions.includes(sessionId)) {
    // 已在 agent 进程内：本地历史就是最新的，无需重放。
    // 只同步一次权限模式（换过模式后重进会话要保持一致）。
    await applyPermissionModeToSession(sessionId)
    return
  }

  // 未加载：先清空本地历史，由 session/load 重放重建，避免界面出现重复记录
  store.beginSessionReload(sessionId)

  try {
    const res = await window.grok.loadSession(sessionId, cwd)
    useStore.getState().markSessionLoaded(sessionId)
    // 把当前权限模式同步到刚加载的会话（session/load 不携带权限模式）
    await applyPermissionModeToSession(sessionId)
    // 主进程报的重放总条数：供 stream-queue 判断「是否已排空」——
 // 绝不能靠「队列瞬时为空」判断（update 还在路上时会提前宣告完成）。
    finishReplayIfIdle(sessionId, res?.replayed ?? 0)
    // session/load 会往 events.jsonl 追加 mcp_*；用过滤后的回合时间校正侧栏，
    // 避免「只是点开看一眼」把活动时间刷成现在（见 session-activity.ts）。
    void useStore.getState().refreshActivity([sessionId])
  } catch (err) {
    const raw = cleanError(err)
    // grok 按「编码 cwd + 会话 ID」拼路径找会话：磁盘上那份数据被删/被搬走后，
    // session/load 只会回一个 `Path not found (FS_NOT_FOUND)`。这时给用户能自助处理的
    // 说明，而不是把协议层错误原样甩出去（2026-10-14 事故的可见症状就是这条报错）。
    const missingOnDisk = /FS_NOT_FOUND|Path not found/i.test(raw)
    useStore.getState().appendNotice(
      sessionId,
      missingOnDisk
        ? '会话的磁盘数据已不存在（多半已被删除或移动过），无法恢复。可在侧栏删除这条记录，避免反复点开报错。'
        : `恢复会话失败：${raw}`,
      'error'
    )
    // 失败路径必须无条件结束，否则「正在加载」会一直转
    useStore.getState().finishSessionReplay(sessionId)
  }
}

/**
 * 同一会话**并发在飞**的 sendPrompt 计数（「响应中排队发送」用）。
 *
 * ACP 层实测会把后发的 `session/prompt` **串行排队**而不是拒绝
 * （见 scripts/concurrent-prompt-probe.mjs：并发第 2 条不报错，但要等第 1 条跑完才返回）。
 * 因此前端可以放开「边跑边发」；但每条 prompt 的 `finally` 都会 `setRunning(false)`，
 * 若不计数，先完成的那条会把**还在队列里**的那条标记成「已结束」—— 界面提前显示
 * 生成完毕、输入框解锁，实际 agent 还在跑。以计数为准：只有归零才真正结束回合。
 */
const activeTurns = new Map<string, number>()

/** 该会话是否还有排队的回合在飞（>1 表示当前这条之外还排着） */
export function queuedTurnCount(sessionId: string): number {
  return Math.max(0, (activeTurns.get(sessionId) ?? 0) - 1)
}

export async function sendPrompt(text: string, images?: ImageAttachment[]): Promise<void> {
  const store = useStore.getState()
  const session = store.activeSession()
  if (!session) return
  if (!text.trim() && !(images && images.length > 0)) return

  // 草稿会话：首次发送时才真正 newSession，并 materialize 成真实会话。
  // 草稿的消息必须先入 items —— materializeDraft 会沿用草稿的 items。
  // （草稿 materialize 后即标记为 loaded，下面的 load 分支不会跳过它、也不会清空。）
  // ⚠️ 正因为 materializeDraft 会「沿用草稿 items」，这条消息在下面通用路径里
  // **绝不能再 push 一次**，否则界面上会出现两条一模一样的用户消息。
  let pushedByDraft = false
  if (session.isDraft) {
    store.pushUserMessage(session.id, text, images)
    pushedByDraft = true
    store.setRunning(session.id, true)
    const ready = await connectAgent()
    if (!ready) {
      const s = useStore.getState()
      s.finalizeSession(session.id)
      s.setRunning(session.id, false)
      return
    }
    // 草稿阶段就锁定：只有「以主目录为根的聊天会话」才强制只读
    const mode: PermissionMode = isLockedChat(session, store.homeDir)
      ? 'plan'
      : session.pendingPermissionMode ?? store.permissionMode
    try {
      const result = await window.grok.newSession({
        cwd: session.cwd,
        permissionMode: mode,
        // 草稿阶段用户选的模型/强度；没有手选则用全局 preferred
        model: session.pendingModel ?? store.preferredModel ?? undefined,
        reasoningEffort: session.pendingEffort ?? store.preferredEffort ?? undefined
      })
      store.materializeDraft(session.id, { id: result.sessionId, configOptions: result.configOptions })
      store.rememberConfigCatalog(result.configOptions)
    } catch (err) {
      useStore.getState().appendNotice(session.id, `创建会话失败：${cleanError(err)}`, 'error')
      const s = useStore.getState()
      s.finalizeSession(session.id)
      s.setRunning(session.id, false)
      return
    }
  }

  // activeId 经过 materialize 后已是真实会话 id
  const activeId = useStore.getState().activeId
  if (!activeId) return

  // 先上屏：重放中会进 pendingUserMessages，ChatView 钉在底部；否则进 items。
  // 草稿路径已经 push 过同一条，绝不能再 push（materializeDraft 继承了 items）。
  if (!pushedByDraft) {
    useStore.getState().pushUserMessage(activeId, text, images)
  }

  store.setRunning(activeId, true)
  // 计入在飞回合：agent 正在跑时再发一条，这里就 +1；finally 里只有归零才收尾
  activeTurns.set(activeId, (activeTurns.get(activeId) ?? 0) + 1)
  // 空闲兜底：停更太久且无工具在飞时自动 cancel，避免「总结写完了还一直正在工作」
  noteTurnStarted(activeId)

  try {
    // 应用重启后 agent 进程是全新的，未加载过的会话必须先 session/load，
    // 否则 session/prompt 会报 Invalid params (unknown session id)。
    // （草稿 materialize 后已在 agent 中新建并标记 loaded，会跳过此分支。）
    const st = useStore.getState()
    const alreadyReloading = st.reloadingSessions.includes(activeId)
    if (!st.loadedSessions.includes(activeId) && !alreadyReloading) {
      st.beginSessionReload(activeId)
      try {
        const res = await window.grok.loadSession(activeId, session.cwd)
        useStore.getState().markSessionLoaded(activeId)
        await applyPermissionModeToSession(activeId)
        finishReplayIfIdle(activeId, res?.replayed ?? 0)
      } catch (err) {
        useStore.getState().finishSessionReplay(activeId)
        throw err
      }
    }
    // loadSession 返回 ≠ 重放已画完。必须等 reloading 结束，用户消息才会被
    // flush 到历史末尾；否则会夹在半截回放里，底部看起来像「没发出去」。
    if (useStore.getState().reloadingSessions.includes(activeId)) {
      await waitForReplay(activeId)
    }
    await window.grok.prompt(activeId, text, images)
  } catch (err) {
    useStore
      .getState()
      .appendNotice(activeId, `请求失败：${cleanError(err)}`, 'error')
  } finally {
    const s = useStore.getState()
    const target = s.activeId ?? activeId
    s.finalizeSession(target)
    // 空闲自动 cancel：等 prompt 真正返回再提示；中途又有 update 则 pending 已清，不贴。
    if (consumeIdleCancelled(activeId)) {
      s.appendNotice(activeId, tShared(s.locale, 'chat.turnIdleCancelled'), 'warn')
    }
    // 只有该会话**没有其它在飞回合**时才真正结束。
    // 排队发送时先完成的那条不能把还在队列里的那条标记成结束，否则界面提前解锁。
    const left = (activeTurns.get(activeId) ?? 1) - 1
    if (left > 0) {
      activeTurns.set(activeId, left)
    } else {
      activeTurns.delete(activeId)
      noteTurnEnded(activeId)
      s.setRunning(target, false)
      // 客户端兜底：回合已结束（正常返回 / 报错 / 超时 / 被 ■ 中断），
      // 但仍有工具卡停在 in_progress —— agent **不会**补发终态
      //（scripts/cancel-tool-probe.mjs 实测：cancel 后再观察 60s 仍是 in_progress）。
      // 不兜底那张卡就永远转圈。标成 interrupted（语义：没收到结果，不是执行失败）。
      // ⚠️ 只在**没有任何在飞回合**时才标：排队发送的下一轮可能刚起了工具。
      // 兜底对象用 activeId（这一轮真正属于的会话）而不是 target ——
      // 生成途中切到别的会话时 target 是别人，扫错了会话。
      s.markStuckTools(activeId)
    }
    // 回合结束后用磁盘真值刷新活动时间：本轮确实产生了内容，grok 已把
    // turn_ended 等事件写进 events.jsonl，这是真实的重放安全的排序依据。
    void s.refreshActivity([target])
  }
}

export function cancelCurrent(): void {
  const store = useStore.getState()
  const session = store.activeSession()
  if (!session) return
  // 主进程会把挂起的提问/权限按取消结算；点 ■ 时清掉全部待响应面板
  //（用户明确要停当前窗口的交互）。空闲自动 cancel 只清本会话，见 cancelSessionTurn。
  store.clearAllPrompts()
  cancelSessionTurn(session.id)
}

/**
 * 编辑重发：删除被编辑的用户消息及其之后的所有内容（已有产物/文件不受影响），
 * 然后用新文本重新发送，对话从该处重新开始。原消息的图片附件保留。
 */
export async function editAndResend(
  itemId: string,
  text: string,
  images?: ImageAttachment[]
): Promise<void> {
  const store = useStore.getState()
  const session = store.activeSession()
  if (!session) return

  // 兜底：若 agent 仍在运行，先中断当前回合
  if (store.running.includes(session.id)) {
    cancelSessionTurn(session.id)
    noteTurnEnded(session.id)
    activeTurns.delete(session.id)
    store.setRunning(session.id, false)
  }

  store.truncateFrom(session.id, itemId)
  await sendPrompt(text, images)
}

export async function changeConfigOption(configId: string, value: string): Promise<void> {
  const store = useStore.getState()
  const session = store.activeSession()
  if (!session) return

  // 草稿还没有真实 ACP 会话：只记 pending，首发 newSession 时带上
  if (session.isDraft) {
    if (configId === 'model' || configId === 'reasoning_effort') {
      store.setDraftConfig(session.id, configId, value)
    }
    return
  }

  try {
    await window.grok.setConfigOption(session.id, configId, value)
    // 记住用户偏好，下次新建任务默认用这个
    if (configId === 'model' || configId === 'reasoning_effort') {
      store.setDraftConfig(session.id, configId, value)
    }
  } catch (err) {
    store.appendNotice(session.id, `切换 ${configId} 失败：${cleanError(err)}`, 'warn')
  }
}

/* ------------------------------------------------------------------ *
 *  网络代理
 *  grok 只认 HTTP_PROXY/HTTPS_PROXY 环境变量，不读 Windows 系统代理设置，
 *  所以必须由本应用显式配置并注入子进程。
 * ------------------------------------------------------------------ */

/** 设置代理（null = 直连）。主进程会重启 agent 使新环境变量生效。 */
export async function applyProxy(proxy: string | null): Promise<void> {
  const store = useStore.getState()
  store.pushLog(`[proxy] 正在${proxy ? `应用代理 ${proxy}` : '切换为直连'}…\n`)
  try {
    const settings = await window.grok.setProxy(proxy)
    store.pushLog(`[proxy] 已生效：${settings.proxy ?? '直连'}\n`)
    await refreshDiagnostics()
  } catch (err) {
    store.pushLog(`[proxy] 设置失败：${cleanError(err)}\n`)
  }
}

/** 扫描本机常见代理端口，命中即应用 */
export async function autoDetectProxy(): Promise<void> {
  const store = useStore.getState()
  store.pushLog('[proxy] 正在扫描本机常见代理端口…\n')
  try {
    const found = await window.grok.detectProxy()
    if (!found?.proxy) {
      store.pushLog('[proxy] 未发现可用代理，请在代理客户端里确认监听端口后手动填写。\n')
      return
    }
    store.pushLog(`[proxy] 发现 ${found.label ?? '代理'}：${found.proxy}\n`)
    await applyProxy(found.proxy)
  } catch (err) {
    store.pushLog(`[proxy] 探测失败：${cleanError(err)}\n`)
  }
}

/* ------------------------------------------------------------------ *
 *  MCP 服务器管理
 *  grok CLI 自带 `grok mcp` 子命令，桌面端只封装 user 作用域。
 * ------------------------------------------------------------------ */

export async function refreshMcp(): Promise<void> {
  try {
    const list = await window.grok.mcpList()
    useStore.getState().setMcpServers(list)
  } catch (err) {
    useStore.getState().pushLog(`[mcp] 读取失败：${cleanError(err)}\n`)
  }
}

export async function openMcp(): Promise<void> {
  useStore.getState().toggleMcp(true)
  await refreshMcp()
}

/** 新增或按同名更新一个服务器；成功返回最新列表 */
export async function addMcpServer(server: McpServerInput): Promise<boolean> {
  const store = useStore.getState()
  try {
    const list = await window.grok.mcpAdd(server)
    store.setMcpServers(list)
    store.pushLog(`[mcp] 已保存服务器「${server.name}」，桌面已重启 agent 以加载最新配置。\n`)
    return true
  } catch (err) {
    store.pushLog(`[mcp] 保存失败：${cleanError(err)}\n`)
    return false
  }
}

export async function removeMcpServer(name: string): Promise<void> {
  const store = useStore.getState()
  try {
    const list = await window.grok.mcpRemove(name)
    store.setMcpServers(list)
    store.pushLog(`[mcp] 已删除服务器「${name}」。\n`)
  } catch (err) {
    store.pushLog(`[mcp] 删除失败：${cleanError(err)}\n`)
  }
}

export async function toggleMcpServer(name: string, enabled: boolean): Promise<void> {
  const store = useStore.getState()
  try {
    const list = await window.grok.mcpSetEnabled(name, enabled)
    store.setMcpServers(list)
    store.pushLog(`[mcp] 已${enabled ? '启用' : '禁用'}服务器「${name}」。\n`)
  } catch (err) {
    store.pushLog(`[mcp] 操作失败：${cleanError(err)}\n`)
  }
}

/** 诊断单个服务器或全局配置，返回人类可读文本 */
export async function mcpDoctor(name: string | null): Promise<string> {
  return window.grok.mcpDoctor(name)
}

/* ------------------------------------------------------------------ *
 *  关闭行为配置
 *  点击关闭按钮时：'tray' 隐藏到托盘、'quit' 直接退出、null 每次询问。
 * ------------------------------------------------------------------ */

/** 读取当前「关闭时」的行为（null = 未配置） */
export async function getCloseAction(): Promise<CloseAction | null> {
  return window.grok.getCloseAction()
}

/** 写入「关闭时」的行为；传 null = 恢复「每次询问」 */
export async function setCloseAction(action: CloseAction | null): Promise<void> {
  await window.grok.setCloseAction(action)
}

/* ------------------------------------------------------------------ *
 *  删除会话的默认行为
 *  删除确认弹窗里「同时删除磁盘文件」是否默认勾选（默认 true）。
 * ------------------------------------------------------------------ */

/** 读取删除确认弹窗的默认勾选状态 */
export async function getDeletePurgeDefault(): Promise<boolean> {
  return window.grok.getDeletePurgeDefault()
}

/** 写入删除确认弹窗的默认勾选状态 */
export async function setDeletePurgeDefault(value: boolean): Promise<void> {
  await window.grok.setDeletePurgeDefault(value)
}

/** 读取屏幕右下角桌面授权浮窗模式 */
export async function getDesktopPermToast(): Promise<DesktopPermToastMode> {
  return window.grok.getDesktopPermToast()
}

/** 写入屏幕右下角桌面授权浮窗模式 */
export async function setDesktopPermToast(mode: DesktopPermToastMode): Promise<void> {
  await window.grok.setDesktopPermToast(mode)
}

/* ------------------------------------------------------------------ *
 *  账号管理
 *  桌面端复用终端版 grok 的登录态（同一份 ~/.grok/auth.json），
 *  所以「当前账号」「退出登录」操作的就是终端版的那份凭据。
 * ------------------------------------------------------------------ */

/** 读取当前登录账户（非敏感字段），写入 store；未登录时 account 为 null */
export async function refreshAccount(): Promise<void> {
  const store = useStore.getState()
  try {
    const account: GrokAccount | null = await window.grok.accountGet()
    store.setAccount(account)
  } catch (err) {
    store.pushLog(`[account] 读取失败：${cleanError(err)}\n`)
    store.setAccount(null)
  }
}

/** 退出登录：清掉终端版凭据并重启 agent；成功后刷新本地账户状态 */
export async function logoutAccount(): Promise<void> {
  const store = useStore.getState()
  try {
    await window.grok.accountLogout()
    store.pushLog('[account] 已退出登录（终端版凭据已清除，agent 已重启）。\n')
    store.setAccount(null)
  } catch (err) {
    store.pushLog(`[account] 退出登录失败：${cleanError(err)}\n`)
  }
}

/** 弹窗里选「隐藏到托盘」：记住并隐藏窗口 */
export async function chooseTrayOnClose(): Promise<void> {
  const store = useStore.getState()
  try {
    await setCloseAction('tray')
  } finally {
    store.setShowCloseActionPrompt(false)
    await window.grok.hideWindow()
  }
}

/** 弹窗里选「直接退出」：记住并退出应用 */
export async function chooseQuitOnClose(): Promise<void> {
  const store = useStore.getState()
  store.setShowCloseActionPrompt(false)
  try {
    await setCloseAction('quit')
  } finally {
    await window.grok.quitApp()
  }
}

/** 弹窗里选「稍后再说」：本次隐藏到托盘但不记住，下次仍询问 */
export async function dismissCloseActionPrompt(): Promise<void> {
  const store = useStore.getState()
  store.setShowCloseActionPrompt(false)
  await window.grok.hideWindow()
}

/* ------------------------------------------------------------------ *
 *  终端能力：grok CLI 子命令（插件 / 存储 / 更新 / 记忆 / worktree / 导出）
 *
 *  这些能力 ACP 没有暴露，只能由主进程驱动 CLI。它们与 agent 共用同一份 ~/.grok，
 *  所以在客户端改完，终端里立刻同步，反之亦然。
 * ------------------------------------------------------------------ */

/** 拉取 grok inspect 的技能 / 子代理视图，供命令面板补全（启动时 + 进入设置时刷新） */
export async function refreshEnvInfo(cwd?: string): Promise<void> {
  const store = useStore.getState()
  const dir = cwd ?? store.cwd
  if (!dir) return
  try {
    store.setEnvInfo(await window.grok.envInspect(dir))
  } catch (err) {
    store.pushLog(`[inspect] 读取失败：${cleanError(err)}\n`)
  }
}

/** 会话工具：导出 Markdown（用户取消保存对话框不算失败） */
export async function exportSessionMarkdown(session: {
  id: string
  cwd: string
  title: string
}): Promise<{ ok: boolean; path?: string; source?: 'grok' | 'local'; message?: string }> {
  try {
    const res = await window.grok.sessionExportMarkdown({
      sessionId: session.id,
      cwd: session.cwd,
      title: session.title
    })
    if (res.canceled) return { ok: false }
    return { ok: res.ok, path: res.path, source: res.source }
  } catch (err) {
    return { ok: false, message: cleanError(err) }
  }
}

/** 会话工具：导出诊断包（只落本地，不上传） */
export async function exportSessionTrace(session: {
  id: string
  cwd: string
}): Promise<{ ok: boolean; path?: string; message?: string }> {
  try {
    const res = await window.grok.sessionExportTrace(session.id, session.cwd)
    return { ok: res.ok, path: res.path, message: res.detail || undefined }
  } catch (err) {
    return { ok: false, message: cleanError(err) }
  }
}

/**
 * 卸载会话（释放 agent 进程内的副本，磁盘数据不动）。
 *
 * ⚠️ 卸载后本地历史与 agent 里的副本就「不同步」了：下次发送会触发 session/load 重放，
 * 而重放是**追加**语义 —— 直接发消息会让同一段历史在界面上出现两遍。
 * 因此这里必须把这条路径堵死：
 *  1. forgetLoadedSession 清掉「已加载」标记（否则永远不会再 load，两边永久错位）；
 *  2. 若卸载的正是当前会话，立刻 resumeSession 重新加载（走 beginSessionReload 清空 +
 *     重放重建），让界面回到「已加载」的一致状态。
 * 非当前会话则保持 items 不动，等用户下次点开时由 resumeSession 统一重建。
 */
export async function closeAgentSession(sessionId: string): Promise<void> {
  const store = useStore.getState()
  const isActive = store.activeId === sessionId
  const cwd = store.sessions.find((x) => x.id === sessionId)?.cwd ?? ''
  try {
    await window.grok.closeSession(sessionId)
    store.forgetLoadedSession(sessionId)
    if (isActive && cwd) await resumeSession(sessionId, cwd)
  } catch (err) {
    store.pushLog(`[close] 卸载会话失败：${cleanError(err)}\n`)
    throw err
  }
}

/** 在指定 git 仓库里建 worktree 并以其为工作目录新建任务（等价终端 `grok -w`） */
export async function newSessionInWorktree(input: {
  cwd: string
  name?: string
  ref?: string
}): Promise<{ ok: boolean; path?: string; message?: string }> {
  try {
    const wt = await window.grok.worktreeCreate(input)
    await newSession(wt.path)
    return { ok: true, path: wt.path }
  } catch (err) {
    return { ok: false, message: cleanError(err) }
  }
}

/** 登录（默认设备码）：返回 grok 的完整输出；过程中通过 onLoginProgress 推送中间行 */
export async function loginGrok(opts?: { oauth?: boolean }): Promise<string> {
  const store = useStore.getState()
  try {
    const text = await window.grok.login(opts)
    store.pushLog('[login] grok login 已完成\n')
    await refreshAccount()
    void refreshDiagnostics()
    return text
  } catch (err) {
    const msg = cleanError(err)
    store.pushLog(`[login] 失败：${msg}\n`)
    throw err instanceof Error ? err : new Error(msg)
  }
}

/* ------------------------------------------------------------------ *
 *  工具调用展示密度（grok 1.0.52 的 ui.tool_call_density，与终端 /density 共用）
 * ------------------------------------------------------------------ */

/** 启动时从 config.toml 读一次；失败保持内置默认（compact-ungrouped），不阻塞启动 */
export async function refreshToolCallDensity(): Promise<void> {
  try {
    const res = await window.grok.uiDensityGet()
    useStore.getState().setToolCallDensity(res.value)
    if (res.migrated) {
      useStore.getState().pushLog(
        `[ui-density] 检测到已废弃的 ui.group_tool_verbs / collapsed_edit_blocks，已按grok 的迁移规则推断为 ${res.value}`
      )
    }
  } catch (err) {
    useStore.getState().pushLog(`[ui-density] 读取失败：${cleanError(err)}\n`)
  }
}

/** 改密度：先落盘（终端下次启动即生效），再更新界面 */
export async function setToolCallDensity(value: ToolCallDensity): Promise<boolean> {
  const store = useStore.getState()
  store.setToolCallDensity(value)
  try {
    await window.grok.uiDensitySet(value)
    return true
  } catch (err) {
    store.pushLog(`[ui-density] 写入 config.toml 失败：${cleanError(err)}\n`)
    return false
  }
}
