import { join } from 'node:path'
import { app, BrowserWindow, protocol, shell } from 'electron'

import { AgentService } from './acp/service'
import { registerIpc } from './ipc'
import { registerAssetProtocol } from './assets'
import { createTray, interceptClose, markQuitting } from './tray'

// 私有媒体协议：必须在 app ready 之前声明为「标准 + 安全」方案，
// 这样渲染进程才能像加载 https 资源一样直接用作 <video>/<img> 的 src。
protocol.registerSchemesAsPrivileged([
  { scheme: 'grok-asset', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true } }
])

/** 应用图标：打包后位于 resources/build/，开发态位于项目 build/ 目录 */
function iconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'build', 'icon.ico')
    : join(__dirname, '../../build/icon.ico')
}

const service = new AgentService({ permissionMode: 'bypassPermissions' })
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    icon: iconPath(),
    title: 'Grok Build Desktop',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // 关闭窗口 = 最小化到托盘（真正退出走托盘菜单「退出」或 app.quit()）
  mainWindow.on('close', (e) => interceptClose(e))

  // 渲染层诊断：崩溃 / 加载失败 / 控制台输出，全部落到主进程 stderr，便于排查
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('[renderer-gone]', JSON.stringify(details))
  })
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[renderer-load-failed]', code, desc, url)
  })
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[renderer] 界面已加载')
  })
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) console.error(`[renderer-console] ${message} (${sourceId}:${line})`)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * 单实例锁 —— 本应用必须单实例运行。
 *
 * 本应用是「托盘常驻 + 关窗=最小化到托盘」的形态：用户点了 ✕，窗口只是藏进托盘，
 * 很容易以为已经退出、又去双击一次 exe，于是起来第二个实例。两个实例共用同一份
 * userData（config.json + localStorage 里的会话列表），会互相覆盖 ——
 * 一边删了会话、另一边列表还留着死条目，点开就是 `session/load 失败：Path not found`。
 *
 * 拿不到锁的进程立刻退出（不建窗口/托盘/agent）；已在运行的那个实例把窗口唤到前台。
 */
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // 有人又启动了一次：把现有窗口恢复并聚焦，而不是新开一个
    if (!mainWindow) {
      createWindow()
      return
    }
    if (mainWindow.isMinimized()) mainWindow.restore()
    if (!mainWindow.isVisible()) mainWindow.show()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    registerAssetProtocol()
    registerIpc(service)
    createWindow()
    createTray(mainWindow!, service)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  // 放行窗口 close 拦截：这是真正的退出
  markQuitting()
  // 确保子进程随应用一起退出
  void service.stop()
})
