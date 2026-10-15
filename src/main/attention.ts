/**
 * 窗口失焦 / 藏进托盘时，用系统通知 + 任务栏闪烁提醒用户：
 * 有待授权的工具执行，或任务正在提问。
 *
 * 窗口已在前台时不打扰（界面内联面板 / 右下角 toast 已足够）。
 * 点击系统通知 → 唤起窗口并经 IPC 让渲染层切到对应会话。
 */

import { BrowserWindow, Notification } from 'electron'
import { CH } from '../shared/channels'

export type AttentionKind = 'perm' | 'question'

export interface AwaitingUserNotice {
  kind: AttentionKind
  requestId: number
  sessionId: string
  title: string
  body: string
}

let win: BrowserWindow | null = null
/** 同一 requestId 只弹一次，避免重复广播时刷屏 */
const seen = new Set<string>()
let flashing = false

function noticeKey(kind: AttentionKind, requestId: number): string {
  return `${kind}:${requestId}`
}

function showWindow(): void {
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
}

function stopFlash(): void {
  if (!flashing || !win || win.isDestroyed()) {
    flashing = false
    return
  }
  win.flashFrame(false)
  flashing = false
}

function startFlash(): void {
  if (!win || win.isDestroyed()) return
  if (win.isFocused() && win.isVisible()) return
  win.flashFrame(true)
  flashing = true
}

function needsAttention(): boolean {
  if (!win || win.isDestroyed()) return true
  return !win.isFocused() || !win.isVisible()
}

/** 绑定主窗口：聚焦时停闪烁。在 createWindow 之后调用一次。 */
export function bindAttention(mainWindow: BrowserWindow): void {
  win = mainWindow
  mainWindow.on('focus', () => stopFlash())
  mainWindow.on('closed', () => {
    win = null
    flashing = false
    seen.clear()
  })
}

/**
 * 若窗口未聚焦或不可见：弹系统通知 + 任务栏闪烁。
 * 点击通知会唤起窗口，并推送 push:focus-session 让渲染层切任务。
 */
export function notifyAwaitingUser(notice: AwaitingUserNotice): void {
  const key = noticeKey(notice.kind, notice.requestId)
  if (seen.has(key)) return
  if (!needsAttention()) return

  seen.add(key)
  startFlash()

  if (!Notification.isSupported()) return

  const n = new Notification({
    title: notice.title,
    body: notice.body,
    silent: false
  })
  n.on('click', () => {
    showWindow()
    if (notice.sessionId && win && !win.isDestroyed()) {
      win.webContents.send(CH.pushFocusSession, { sessionId: notice.sessionId })
    }
  })
  n.show()
}

/** 用户已响应或进程重启时清掉去重键，允许同一 id 的新一轮请求再提醒 */
export function clearAttention(kind: AttentionKind, requestId: number): void {
  seen.delete(noticeKey(kind, requestId))
}

export function clearAllAttention(): void {
  seen.clear()
  stopFlash()
}
