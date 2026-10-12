import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'

import { AgentService } from './acp/service'
import { registerIpc } from './ipc'

/** 应用图标：打包后位于 resources/build/，开发态位于项目 build/ 目录 */
function iconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'build', 'icon.ico')
    : join(__dirname, '../../build/icon.ico')
}

const service = new AgentService({ autoApprove: true })
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

app.whenReady().then(() => {
  registerIpc(service)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  // 确保子进程随应用一起退出
  void service.stop()
})
