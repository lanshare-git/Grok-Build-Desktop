/** 界面动作集合 —— 统一处理 IPC 调用、错误提示与状态流转 */

import { useStore } from './store'
import type { ImageAttachment } from '@shared/types'

/** Electron IPC 抛出的错误带有前缀，剥掉以便展示 */
export function cleanError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  return raw
    .replace(/^Error invoking remote method '[^']*':\s*/, '')
    .replace(/^Error:\s*/, '')
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

/** 新建会话：确保有工作目录、agent 已连接，然后开 session */
export async function newSession(): Promise<void> {
  const store = useStore.getState()

  let cwd = store.cwd
  if (!cwd) {
    const picked = await chooseCwd()
    if (!picked) return
    cwd = picked
  }

  const ready = await connectAgent()
  if (!ready) return

  try {
    const result = await window.grok.newSession({ cwd, autoApprove: store.autoApprove })
    useStore.getState().createSession({
      id: result.sessionId,
      cwd,
      configOptions: result.configOptions
    })
  } catch (err) {
    useStore.getState().setConnection('error', cleanError(err))
    useStore.getState().pushLog(`[session] 新建会话失败：${cleanError(err)}`)
    useStore.getState().toggleDiagnostics(true)
  }
}

/** 恢复已有会话：ACP session/load 会重放历史为 session/update */
export async function resumeSession(sessionId: string, cwd: string): Promise<void> {
  const store = useStore.getState()
  store.selectSession(sessionId)

  const ready = await connectAgent()
  if (!ready) return

  // 若该会话尚未在当前 agent 进程中加载，先清空本地历史，
  // 由 session/load 重放重建，避免界面出现重复记录
  if (!store.loadedSessions.includes(sessionId)) {
    store.beginSessionReload(sessionId)
  }

  try {
    await window.grok.loadSession(sessionId, cwd)
    useStore.getState().markSessionLoaded(sessionId)
  } catch (err) {
    useStore.getState().appendNotice(sessionId, `恢复会话失败：${cleanError(err)}`, 'error')
  }
}

export async function sendPrompt(text: string, images?: ImageAttachment[]): Promise<void> {
  const store = useStore.getState()
  const session = store.activeSession()
  if (!session) return
  if (!text.trim() && !(images && images.length > 0)) return

  store.pushUserMessage(session.id, text, images)
  store.setRunning(session.id, true)

  try {
    // 应用重启后 agent 进程是全新的，未加载过的会话必须先 session/load，
    // 否则 session/prompt 会报 Invalid params (unknown session id)
    if (!store.loadedSessions.includes(session.id)) {
      store.beginSessionReload(session.id)
      await window.grok.loadSession(session.id, session.cwd)
      useStore.getState().markSessionLoaded(session.id)
    }
    await window.grok.prompt(session.id, text, images)
  } catch (err) {
    useStore
      .getState()
      .appendNotice(session.id, `请求失败：${cleanError(err)}`, 'error')
  } finally {
    const s = useStore.getState()
    s.finalizeSession(session.id)
    s.setRunning(session.id, false)
  }
}

export function cancelCurrent(): void {
  const store = useStore.getState()
  const session = store.activeSession()
  if (!session) return
  void window.grok.cancel(session.id)
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
    void window.grok.cancel(session.id)
    store.setRunning(session.id, false)
  }

  store.truncateFrom(session.id, itemId)
  await sendPrompt(text, images)
}

export async function changeConfigOption(configId: string, value: string): Promise<void> {
  const store = useStore.getState()
  const session = store.activeSession()
  if (!session) return
  try {
    await window.grok.setConfigOption(session.id, configId, value)
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
