/**
 * Windows 任务栏角标（对齐 Cursor）：
 *   橙点 = 有待授权 / 提问
 *   蓝点 = 有做完未读的会话
 *   无   = 清掉 overlay
 *
 * 用 BrowserWindow.setOverlayIcon；资源来自 build/taskbar-badge-*.png（gen-icons 生成）。
 */

import { app, BrowserWindow, nativeImage, type NativeImage } from 'electron'
import { join } from 'node:path'

export type TaskbarBadgeKind = 'none' | 'unread' | 'pending'

let win: BrowserWindow | null = null
let current: TaskbarBadgeKind = 'none'

function badgePath(kind: 'unread' | 'pending'): string {
  const name = `taskbar-badge-${kind}.png`
  return app.isPackaged
    ? join(process.resourcesPath, 'build', name)
    : join(__dirname, '../../build', name)
}

function loadBadge(kind: 'unread' | 'pending'): NativeImage | null {
  const img = nativeImage.createFromPath(badgePath(kind))
  return img.isEmpty() ? null : img
}

export function bindTaskbarBadge(mainWindow: BrowserWindow): void {
  win = mainWindow
  mainWindow.on('closed', () => {
    win = null
    current = 'none'
  })
}

/** 由渲染层根据 unread / permissions / questions 汇总后调用 */
export function setTaskbarBadge(kind: TaskbarBadgeKind): void {
  if (!win || win.isDestroyed()) return
  if (kind === current) return
  current = kind

  if (kind === 'none') {
    win.setOverlayIcon(null, '')
    return
  }

  const img = loadBadge(kind)
  if (!img) {
    win.setOverlayIcon(null, '')
    return
  }
  const desc = kind === 'pending' ? 'Needs your response' : 'Unread finished work'
  win.setOverlayIcon(img, desc)
}
