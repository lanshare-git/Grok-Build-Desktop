/**
 * 系统托盘：三态图标 + 右键菜单 + 关窗最小化到托盘。
 *
 * 状态源：直接挂 AgentService 的 'state' 事件（主进程是连接状态源头，
 * 不需要渲染进程经 IPC 转发）。五态连接状态折叠为托盘三态：
 *   ready → ok(绿)  idle/starting/stopped → attention(黄)  error → error(红)
 *
 * 关闭行为：点窗口 ✕ 不退出，隐藏到托盘（首次弹气泡提示），
 * 真正退出走托盘菜单「退出」或 app.quit()（before-quit 时标记 isQuitting）。
 *
 * 图标路径与 index.ts 的 iconPath() 同一条通道：
 * 打包态读 resources/build/（extraResources 拷贝），开发态读项目 build/ 目录。
 */

import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import { join } from 'node:path'
import type { Event as ElectronEvent } from 'electron'
import { readConfig } from './config'
import type { AgentService } from './acp/service'
import { CH } from '../shared/channels'
import type { ConnectionState } from '../shared/types'

type TrayState = 'ok' | 'attention' | 'error'

/** 连接五态 → 托盘三态 */
const STATE_MAP: Record<ConnectionState, TrayState> = {
  ready: 'ok',
  error: 'error',
  idle: 'attention',
  starting: 'attention',
  stopped: 'attention'
}

const STATE_LABEL: Record<ConnectionState, string> = {
  ready: '已连接',
  starting: '连接中',
  idle: '未连接',
  stopped: '已断开',
  error: '连接错误'
}

let tray: Tray | null = null
let win: BrowserWindow | null = null
let quitting = false
let balloonShown = false

function trayIconPath(state: TrayState): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'build', `tray-${state}.png`)
    : join(__dirname, '../../build', `tray-${state}.png`)
}

function showWindow(): void {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function rebuildMenu(state: ConnectionState, message: string): void {
  if (!tray) return
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `连接状态：${STATE_LABEL[state]}`, enabled: false },
      ...(message ? [{ label: message, enabled: false }] : []),
      { type: 'separator' },
      { label: '显示主窗口', click: showWindow },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          quitting = true
          app.quit()
        }
      }
    ])
  )
}

export function createTray(mainWindow: BrowserWindow, service: AgentService): void {
  win = mainWindow
  tray = new Tray(trayIconPath('attention'))
  tray.setToolTip('Grok Build Desktop 启动中…')
  rebuildMenu('starting', '')
  tray.on('click', showWindow)

  service.on('state', ({ state, message }) => {
    if (!tray) return
    tray.setImage(nativeImage.createFromPath(trayIconPath(STATE_MAP[state])))
    tray.setToolTip(`Grok Build Desktop · ${STATE_LABEL[state]}`)
    rebuildMenu(state, message ?? '')
  })
}

/** 隐藏窗口到托盘（不退出），首次弹气泡提示 */
function hideToTray(): void {
  win?.hide()
  if (!balloonShown && tray && process.platform === 'win32') {
    tray.displayBalloon({
      title: 'Grok Build Desktop',
      content: '应用已最小化到系统托盘，点击托盘图标可重新打开。'
    })
    balloonShown = true
  }
}

/**
 * 窗口 close 事件拦截：根据配置分流。
 *  - quitting=true（真正的退出，来自托盘菜单「退出」或 app.quit）：直接放行
 *  - closeAction='quit'：放行默认关闭行为，由 before-quit 完成退出
 *  - closeAction='tray'：隐藏到托盘
 *  - closeAction=null（未配置）：挡住关闭，请渲染层弹窗询问用户
 * 在 index.ts 的 mainWindow.on('close', e) 里调用。
 */
export function interceptClose(e: ElectronEvent): void {
  if (quitting) return
  const action = readConfig().closeAction
  if (action === 'quit') return
  e.preventDefault()
  if (action === 'tray') {
    hideToTray()
    return
  }
  // action === null：首次关闭，请渲染层弹窗询问
  win?.webContents.send(CH.closeActionRequest)
}

/** 仅隐藏窗口到托盘（供渲染层在弹窗里选择「隐藏到托盘」后调用） */
export function hideWindow(): void {
  hideToTray()
}

/** 标记退出并真正退出应用（供渲染层在弹窗里选择「直接退出」后调用） */
export function requestQuit(): void {
  quitting = true
  app.quit()
}

/** before-quit 时标记，让窗口 close 拦截放行真正的退出 */
export function markQuitting(): void {
  quitting = true
}
