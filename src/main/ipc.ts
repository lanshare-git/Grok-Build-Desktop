/** 主进程 IPC 注册：把 AgentService 的能力与事件暴露给渲染进程 */

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { homedir } from 'node:os'

import { CH } from '../shared/channels'
import { AgentService, resolveGrokBinary, resolveGrokHome } from './acp/service'
import { readConfig, writeConfig } from './config'
import { runDiagnostics } from './diagnostics'
import { detectProxy } from './proxy'
import type { NewSessionOptions, ProxySettings } from '../shared/types'

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

export function registerIpc(service: AgentService): void {
  /* ---------- AgentService 事件 -> 渲染进程 ---------- */
  service.on('stream', (event) => broadcast(CH.pushStream, event))
  service.on('state', (event) => {
    console.log('[agent-state]', event.state, event.message ?? '')
    broadcast(CH.pushState, event)
  })
  service.on('permission', (event) => broadcast(CH.pushPermission, event))
  service.on('log', (line) => broadcast(CH.pushLog, line))

  /* ---------- 连接 ---------- */
  ipcMain.handle(CH.agentStart, async () => service.start())
  ipcMain.handle(CH.agentStatus, () => ({ state: service.connectionState }))
  ipcMain.handle(CH.agentStop, async () => service.stop())

  /* ---------- 会话 ---------- */
  ipcMain.handle(CH.agentNewSession, async (_e, options: NewSessionOptions) =>
    service.newSession(options)
  )
  ipcMain.handle(CH.agentLoadSession, async (_e, args: { sessionId: string; cwd: string }) =>
    service.loadSession(args.sessionId, args.cwd)
  )
  ipcMain.handle(CH.agentPrompt, async (_e, args: { sessionId: string; text: string; images?: Array<{ data: string; mimeType: string; name?: string }> }) =>
    service.prompt(args.sessionId, args.text, args.images)
  )
  ipcMain.handle(CH.agentCancel, async (_e, args: { sessionId: string }) =>
    service.cancel(args.sessionId)
  )
  ipcMain.handle(CH.agentEnsureSession, async (_e, args: { sessionId: string; cwd: string }) =>
    service.ensureSession(args.sessionId, args.cwd)
  )
  ipcMain.handle(
    CH.agentSetConfig,
    async (_e, args: { sessionId: string; configId: string; value: string }) =>
      service.setConfigOption(args.sessionId, args.configId, args.value)
  )
  ipcMain.handle(
    CH.agentPermissionResponse,
    async (_e, args: { requestId: number; optionId: string | null }) =>
      service.respondPermission(args.requestId, args.optionId)
  )

  /* ---------- 环境 ---------- */
  ipcMain.handle(CH.diagnosticsRun, async () => runDiagnostics())

  /* ---------- 代理 ---------- */
  ipcMain.handle(CH.proxyGet, (): ProxySettings => readConfig())

  ipcMain.handle(CH.proxyDetect, async (): Promise<ProxySettings | null> => {
    const found = await detectProxy()
    if (!found) return null
    return { proxy: found.url, proxyAutoDetected: true, label: found.label }
  })

  ipcMain.handle(CH.proxySet, async (_e, args: { proxy: string | null }): Promise<ProxySettings> => {
    const next = writeConfig({
      proxy: args.proxy?.trim() || null,
      proxyAutoDetected: false
    })

    // 代理是在 spawn agent 时注入的环境变量，必须重启进程才能生效
    try {
      await service.stop()
      await service.start()
    } catch (err) {
      console.error('[proxy] 重启 agent 失败：', (err as Error).message)
    }
    return next
  })

  ipcMain.handle(CH.pickDirectory, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  ipcMain.handle(CH.appInfo, () => ({
    version: app.getVersion(),
    platform: process.platform,
    grokHome: resolveGrokHome(),
    grokBinary: resolveGrokBinary(),
    defaultCwd: homedir()
  }))

  ipcMain.handle(CH.openExternal, async (_e, url: string) => {
    // 仅允许 http/https，避免被诱导打开本地协议
    if (/^https?:\/\//i.test(url)) await shell.openExternal(url)
  })

  ipcMain.handle(CH.screenshotSnip, async () => {
    // Windows 截图工具的屏幕剪辑模式：截图完成后自动进入系统剪贴板，
    // 用户在输入框 Ctrl+V 即可附带截图提问
    await shell.openExternal('ms-screenclip:')
  })
}
