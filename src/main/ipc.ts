/** 主进程 IPC 注册：把 AgentService 的能力与事件暴露给渲染进程 */

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { CH } from '../shared/channels'
import { AgentService, resolveGrokBinary, resolveGrokHome } from './acp/service'
import { resolveAssetUri } from './assets'
import { readConfig, writeConfig } from './config'
import { runDiagnostics } from './diagnostics'
import { detectProxy } from './proxy'
import { encodeSessionDir, readSessionActivity } from './session-activity'
import { deleteSessionData } from './session-delete'
import { moveSessionData } from './session-move'
import { exportSessionMarkdown, exportSessionTrace } from './session-export'
import { searchSessions } from './session-search'
import { aggregateUsage, readSessionUsage } from './session-usage'
import { fetchBillingQuotaDetailed } from './billing'
import { readToolCallDensity, writeToolCallDensity } from './grok-config'
import {
  addMarketplace,
  checkGrokUpdate,
  clearMemory,
  createWorktree,
  diskUsage,
  gcWorktrees,
  grokLogin,
  grokVersion,
  inspectEnvironment,
  installGrokUpdate,
  installPlugin,
  listMarketplaces,
  listPlugins,
  listWorktrees,
  removeMarketplace,
  removeWorktree,
  setPluginEnabled,
  uninstallPlugin,
  updateMarketplaces,
  pluginDetails
} from './grok-cli'
import { clearAllAttention, clearAttention, notifyAwaitingUser } from './attention'
import { hideWindow, requestQuit } from './tray'
import {
  listMcpServers,
  addMcpServer,
  removeMcpServer,
  setMcpEnabled,
  runMcpDoctor
} from './mcp'
import type {
  CloseAction,
  GrokAccount,
  McpServer,
  McpServerInput,
  MemoryClearScope,
  NewSessionOptions,
  ProxySettings,
  ToolCallDensity
} from '../shared/types'

import { getAccountInfo, logoutAccount } from './account'

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
    // agent 重启 / 退出时挂起的授权作废，清掉通知去重键
    if (event.state === 'starting' || event.state === 'stopped' || event.state === 'error') {
      clearAllAttention()
    }
  })
  service.on('permission', (event) => {
    broadcast(CH.pushPermission, event)
    // 窗口失焦 / 藏托盘时：系统通知 + 任务栏闪烁（前台只走界面内联面板）
    notifyAwaitingUser({
      kind: 'perm',
      requestId: event.requestId,
      sessionId: event.sessionId,
      title: '任务需要授权',
      body: `请求执行：${event.toolCall?.title ?? event.toolCall?.toolName ?? '一个工具'}`
    })
  })
  // 提问事件同样必须广播到渲染层，否则任务内的提问面板永远等不到数据
  // （回传通道 agentQuestionResponse 已在下方注册，但少了这里推送，面板不会出现）
  service.on('question', (event) => {
    broadcast(CH.pushQuestion, event)
    notifyAwaitingUser({
      kind: 'question',
      requestId: event.requestId,
      sessionId: event.sessionId,
      title: '任务正在提问',
      body: '需要你的选择才能继续'
    })
  })
  service.on('log', (line) => broadcast(CH.pushLog, line))
  // agent 上报的内置命令与公告（initialize 的 availableCommands / 公告通知）
  service.on('meta', (event) => broadcast(CH.pushMeta, event))

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
    CH.agentSetMode,
    async (_e, args: { sessionId: string; modeId: string }) =>
      service.setPermissionMode(args.sessionId, args.modeId)
  )
  ipcMain.handle(
    CH.agentPermissionResponse,
    async (_e, args: { requestId: number; optionId: string | null }) => {
      clearAttention('perm', args.requestId)
      service.respondPermission(args.requestId, args.optionId)
    }
  )
  ipcMain.handle(
    CH.agentQuestionResponse,
    async (_e, args: { requestId: number; answers: Record<string, string> | null }) => {
      clearAttention('question', args.requestId)
      service.respondQuestion(args.requestId, args.answers)
    }
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

  // 应用自身版本：排查问题时能确认跑的是哪一份产物
  // （版本号相同但构建时刻不同的情况真实存在，例如同一版代码打了两次包）
  ipcMain.handle(CH.appVersion, () => ({
    version: app.getVersion(),
    buildTime: typeof __APP_BUILD_TIME__ === 'string' ? __APP_BUILD_TIME__ : '',
    packaged: app.isPackaged,
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
    node: process.versions.node ?? '',
    platform: process.platform
  }))

  ipcMain.handle(CH.openExternal, async (_e, url: string) => {
    // 仅允许 http/https，避免被诱导打开本地协议
    if (/^https?:\/\//i.test(url)) await shell.openExternal(url)
  })

  // 在资源管理器中显示本地文件/目录（仅允许绝对路径，拒绝 URL 形式）
  ipcMain.handle(CH.revealPath, (_e, p: string) => {
    if (typeof p === 'string' && /^[a-zA-Z]:[\\/]/.test(p)) shell.showItemInFolder(p)
  })

  // 会话在磁盘上的存储目录：~/.grok/sessions/<编码cwd>/<sessionId>
  // 编码规则 = 百分号编码、保留 unreserved（反斜杠→%5C），详见 session-activity.ts
  ipcMain.handle(CH.sessionStoragePath, (_e, args: { cwd: string; sessionId: string }): string => {
    return join(resolveGrokHome(), 'sessions', encodeSessionDir(args.cwd), args.sessionId)
  })

  // 批量读取会话的真实活动时间（source of truth = grok 写的 events.jsonl 末条 ts）。
  // 侧栏排序改用它，彻底摆脱「重放被当成新活动」——详见 main/session-activity.ts
  ipcMain.handle(
    CH.sessionActivity,
    (_e, items: Array<{ sessionId: string; cwd: string }>) =>
      readSessionActivity(Array.isArray(items) ? items : [])
  )

  // 删除会话在磁盘上的落盘目录（走回收站）。路径越界防护与错误语义见 main/session-delete.ts
  ipcMain.handle(CH.sessionDeleteData, (_e, args: { cwd: string; sessionId: string }) =>
    deleteSessionData(String(args?.cwd ?? ''), String(args?.sessionId ?? ''))
  )

  // 把会话的落盘目录搬到另一个工作目录下（grok 没有「改会话工作目录」的接口）。
  // 实证与安全边界见 main/session-move.ts 的文件头说明
  ipcMain.handle(
    CH.sessionMoveData,
    (_e, args: { sessionId: string; fromCwd: string; toCwd: string }) =>
      moveSessionData({
        sessionId: String(args?.sessionId ?? ''),
        fromCwd: String(args?.fromCwd ?? ''),
        toCwd: String(args?.toCwd ?? '')
      })
  )

  ipcMain.handle(CH.screenshotSnip, async () => {
    // Windows 截图工具的屏幕剪辑模式：截图完成后自动进入系统剪贴板，
    // 用户在输入框 Ctrl+V 即可附带截图提问
    await shell.openExternal('ms-screenclip:')
  })

  // 媒体资源地址归一化：file:// / 本地绝对路径 -> grok-asset://；http(s)/data: 原样返回
  ipcMain.handle(CH.assetResolve, (_e, rawUri: string): string => resolveAssetUri(rawUri))

  /* ---------- MCP 服务器管理 ---------- */
  // 写操作后重启 agent，让新的 MCP 配置在长驻进程里生效（与代理改动的语义一致）。
  // 仅当 agent 当前已连接时才重启，未连接则等下次连接自然读取最新配置。
  const restartAgentIfNeeded = async (): Promise<void> => {
    if (service.connectionState === 'ready' || service.connectionState === 'starting') {
      try {
        await service.stop()
        await service.start()
      } catch (err) {
        console.error('[mcp] 重启 agent 失败：', (err as Error).message)
      }
    }
  }

  ipcMain.handle(CH.mcpList, (): Promise<McpServer[]> => listMcpServers())

  ipcMain.handle(CH.mcpAdd, async (_e, input: McpServerInput): Promise<McpServer[]> => {
    const list = await addMcpServer(input)
    await restartAgentIfNeeded()
    return list
  })

  ipcMain.handle(CH.mcpRemove, async (_e, name: string): Promise<McpServer[]> => {
    const list = await removeMcpServer(name)
    await restartAgentIfNeeded()
    return list
  })

  ipcMain.handle(
    CH.mcpSetEnabled,
    async (_e, args: { name: string; enabled: boolean }): Promise<McpServer[]> => {
      const list = await setMcpEnabled(args.name, args.enabled)
      await restartAgentIfNeeded()
      return list
    }
  )

  ipcMain.handle(CH.mcpDoctor, (_e, name: string | null): Promise<string> => runMcpDoctor(name))

  /* ---------- 终端能力：插件与插件市场 ---------- */
  // 插件会带 hook / MCP / skill，装卸后必须重启 agent 才会在会话里生效
  ipcMain.handle(CH.pluginList, (_e, cwd?: string) => listPlugins(cwd))
  ipcMain.handle(CH.pluginInstall, async (_e, args: { source: string; cwd?: string }) => {
    const list = await installPlugin(args.source, args.cwd)
    await restartAgentIfNeeded()
    return list
  })
  ipcMain.handle(CH.pluginUninstall, async (_e, args: { name: string; cwd?: string }) => {
    const list = await uninstallPlugin(args.name, args.cwd)
    await restartAgentIfNeeded()
    return list
  })
  ipcMain.handle(
    CH.pluginSetEnabled,
    async (_e, args: { name: string; enabled: boolean; cwd?: string }) => {
      const list = await setPluginEnabled(args.name, args.enabled, args.cwd)
      await restartAgentIfNeeded()
      return list
    }
  )
  ipcMain.handle(CH.pluginDetails, (_e, args: { name: string; cwd?: string }) =>
    pluginDetails(args.name, args.cwd)
  )
  ipcMain.handle(CH.marketplaceList, (_e, cwd?: string) => listMarketplaces(cwd))
  ipcMain.handle(CH.marketplaceAdd, (_e, args: { source: string; cwd?: string }) =>
    addMarketplace(args.source, args.cwd)
  )
  ipcMain.handle(CH.marketplaceRemove, (_e, args: { name: string; cwd?: string }) =>
    removeMarketplace(args.name, args.cwd)
  )
  ipcMain.handle(CH.marketplaceUpdate, (_e, cwd?: string) => updateMarketplaces(cwd))

  /* ---------- 终端能力：存储 / 更新 / 记忆 / 环境 ---------- */
  ipcMain.handle(CH.diskUsage, (_e, cwd?: string) => diskUsage(cwd))
  ipcMain.handle(CH.versionInfo, (_e, cwd?: string) => grokVersion(cwd))
  ipcMain.handle(CH.updateCheck, (_e, cwd?: string) => checkGrokUpdate(cwd))
  ipcMain.handle(
    CH.updateInstall,
    async (_e, opts?: { version?: string; alpha?: boolean }): Promise<string> => {
      // 实测（2026-10-14）：桌面端 agent 在运行时，`grok update` 依然能替换 grok.exe 并成功
      // （下载 ~170MB 走 SOCKS 代理耗时 3 分半，最后打印「installed successfully / Please restart Grok」）。
      // 所以**不要**在下载前停 agent —— 那只会白白打断用户正在进行的回合。
      // 下载完成后再重启 agent，让新版本真正生效（正在进行的回合会中断）。
      const text = await installGrokUpdate(opts)
      await restartAgentIfNeeded()
      return text
    }
  )
  ipcMain.handle(CH.memoryClear, (_e, args: { scope: MemoryClearScope; cwd?: string }) =>
    clearMemory(args.scope, args.cwd)
  )
  ipcMain.handle(CH.envInspect, (_e, cwd: string) => inspectEnvironment(cwd))

  /* ---------- 终端能力：git worktree ---------- */
  ipcMain.handle(CH.worktreeList, (_e, cwd?: string) => listWorktrees(cwd))
  ipcMain.handle(
    CH.worktreeCreate,
    (_e, input: { cwd: string; name?: string; ref?: string }) => createWorktree(input)
  )
  ipcMain.handle(
    CH.worktreeRemove,
    (_e, input: { id: string; force?: boolean; cwd?: string }) => removeWorktree(input)
  )
  ipcMain.handle(
    CH.worktreeGc,
    (_e, input?: { maxAge?: string; dryRun?: boolean; cwd?: string }) => gcWorktrees(input)
  )

  /* ---------- 登录 ---------- */
  // grok login 是交互式命令：主进程不给 TTY，因此给出完整原文让用户自行判断下一步
  ipcMain.handle(CH.login, async (_e, opts?: { oauth?: boolean }): Promise<string> => {
    const text = await grokLogin(opts)
    await restartAgentIfNeeded()
    return text
  })

  /* ---------- 会话工具 ---------- */
  ipcMain.handle(
    CH.sessionSearch,
    (_e, args: { query: string; candidates: Array<{ sessionId: string; cwd: string; title: string }> }) =>
      searchSessions(
        String(args?.query ?? ''),
        Array.isArray(args?.candidates) ? args.candidates : []
      )
  )

  // 导出 Markdown：先取文本，再弹保存对话框写盘（用户取消则什么都不做）
  ipcMain.handle(
    CH.sessionExportMarkdown,
    async (
      event,
      args: { sessionId: string; cwd: string; title: string }
    ): Promise<{ ok: boolean; path?: string; source?: 'grok' | 'local'; canceled?: boolean }> => {
      const { markdown, source } = await exportSessionMarkdown(args)
      const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
      const safeName = (args.title || 'session').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)
      const opts = {
        title: '导出会话为 Markdown',
        defaultPath: join(app.getPath('documents'), `${safeName}.md`),
        filters: [{ name: 'Markdown', extensions: ['md'] }]
      }
      const result = win
        ? await dialog.showSaveDialog(win, opts)
        : await dialog.showSaveDialog(opts)
      if (result.canceled || !result.filePath) return { ok: false, canceled: true }
      await writeFile(result.filePath, markdown, 'utf8')
      return { ok: true, path: result.filePath, source }
    }
  )

  ipcMain.handle(CH.sessionExportTrace, (_e, args: { sessionId: string; cwd?: string }) =>
    exportSessionTrace({ sessionId: args?.sessionId, cwd: args?.cwd })
  )

  // 工具调用展示密度：与终端 /density 共用 config.toml 的 ui.tool_call_density
  ipcMain.handle(CH.uiDensityGet, () => readToolCallDensity())
  ipcMain.handle(
    CH.uiDensitySet,
    async (_e, args: { value: ToolCallDensity }): Promise<ToolCallDensity> => {
      await writeToolCallDensity(args.value)
      return args.value
    }
  )

  // 账号额度：每周用量百分比（TUI `/usage` 的 Usage limit 页）。
  // 显式用户触发的读取一律回源（fetchBillingQuotaDetailed 内部会绕过 60s 缓存）。
  ipcMain.handle(CH.billingQuota, (): Promise<{ quota: unknown; error: string }> =>
    fetchBillingQuotaDetailed()
  )

  // 用量：单个会话明细（磁盘 usage.json 优先，CLI 兜底）+ 跨会话累计
  ipcMain.handle(CH.sessionUsage, (_e, args: { sessionId: string; cwd: string }) =>
    readSessionUsage({ sessionId: String(args?.sessionId ?? ''), cwd: String(args?.cwd ?? '') })
  )

  ipcMain.handle(
    CH.usageAggregate,
    (_e, candidates: Array<{ sessionId: string; cwd: string; title: string }>) =>
      aggregateUsage(Array.isArray(candidates) ? candidates : [])
  )

  // 关闭（卸载）会话：只释放 agent 进程内状态，磁盘数据与会话列表不动
  ipcMain.handle(CH.agentCloseSession, async (_e, args: { sessionId: string }) => {
    await service.closeSession(args.sessionId)
  })

  /* ---------- 关闭行为配置 ---------- */
  ipcMain.handle(CH.closeActionGet, (): CloseAction | null => readConfig().closeAction)

  ipcMain.handle(
    CH.closeActionSet,
    (_e, action: CloseAction | null): void => {
      writeConfig({ closeAction: action })
    }
  )

  /* ---------- 删除会话的默认行为 ---------- */
  // 删除确认弹窗里「同时删除磁盘文件」是否默认勾选（默认 true，即历史行为）
  ipcMain.handle(CH.deletePurgeDefaultGet, (): boolean => readConfig().deleteDiskFilesByDefault)

  ipcMain.handle(CH.deletePurgeDefaultSet, (_e, value: boolean): void => {
    writeConfig({ deleteDiskFilesByDefault: value })
  })

  // 渲染层弹窗里选择「隐藏到托盘」后调用：把窗口藏到托盘
  ipcMain.handle(CH.windowHide, () => hideWindow())

  // 渲染层弹窗里选择「直接退出」后调用：真正退出应用
  ipcMain.handle(CH.appQuit, () => requestQuit())

  /* ---------- 账号管理 ---------- */
  // 读取当前登录账户的非敏感信息（email / 姓名 / team 等），未登录返回 null
  ipcMain.handle(CH.accountGet, (): GrokAccount | null => getAccountInfo())

  // 退出登录：清除 ~/.grok 缓存凭据，并重启 agent 让会话失效（与代理/MCP 改动同语义）
  ipcMain.handle(CH.accountLogout, async (): Promise<void> => {
    await logoutAccount()
    await restartAgentIfNeeded()
  })
}
