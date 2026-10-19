import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

import { CH } from '../shared/channels'
import type { GrokDesktopApi } from '../shared/api'
import type { Locale } from '../shared/i18n/types'
import type {
  AcpStreamEvent,
  AgentMetaEvent,
  CloseAction,
  ConnectionEvent,
  McpServerInput,
  MemoryClearScope,
  NewSessionOptions,
  PermissionRequestEvent,
  ToolCallDensity,
  TurnCompleteEvent,
  UserQuestionAnswers,
  UserQuestionEvent
} from '../shared/types'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.off(channel, listener)
  }
}

const api: GrokDesktopApi = {
  start: () => ipcRenderer.invoke(CH.agentStart),
  status: () => ipcRenderer.invoke(CH.agentStatus),
  stop: () => ipcRenderer.invoke(CH.agentStop),

  newSession: (options: NewSessionOptions) => ipcRenderer.invoke(CH.agentNewSession, options),
  loadSession: (sessionId: string, cwd: string) =>
    ipcRenderer.invoke(CH.agentLoadSession, { sessionId, cwd }),
  prompt: (sessionId: string, text: string, images?: Array<{ data: string; mimeType: string; name?: string }>) =>
    ipcRenderer.invoke(CH.agentPrompt, { sessionId, text, images }),
  cancel: (sessionId: string) => ipcRenderer.invoke(CH.agentCancel, { sessionId }),
  ensureSession: (sessionId: string, cwd: string) =>
    ipcRenderer.invoke(CH.agentEnsureSession, { sessionId, cwd }),
  setConfigOption: (sessionId: string, configId: string, value: string) =>
    ipcRenderer.invoke(CH.agentSetConfig, { sessionId, configId, value }),
  setPermissionMode: (sessionId: string, modeId: string) =>
    ipcRenderer.invoke(CH.agentSetMode, { sessionId, modeId }),
  respondPermission: (requestId: number, optionId: string | null) =>
    ipcRenderer.invoke(CH.agentPermissionResponse, { requestId, optionId }),
  respondQuestion: (requestId: number, answers: UserQuestionAnswers | null) =>
    ipcRenderer.invoke(CH.agentQuestionResponse, { requestId, answers }),

  diagnostics: () => ipcRenderer.invoke(CH.diagnosticsRun),
  pickDirectory: () => ipcRenderer.invoke(CH.pickDirectory),
  appInfo: () => ipcRenderer.invoke(CH.appInfo),
  appVersion: () => ipcRenderer.invoke(CH.appVersion),
  openExternal: (url: string) => ipcRenderer.invoke(CH.openExternal, url),
  revealPath: (path: string) => ipcRenderer.invoke(CH.revealPath, path),
  sessionStoragePath: (cwd: string, sessionId: string) =>
    ipcRenderer.invoke(CH.sessionStoragePath, { cwd, sessionId }),
  sessionActivity: (items: Array<{ sessionId: string; cwd: string }>) =>
    ipcRenderer.invoke(CH.sessionActivity, items),
  sessionDeleteData: (args: { cwd: string; sessionId: string }) =>
    ipcRenderer.invoke(CH.sessionDeleteData, args),
  sessionMoveData: (args: { sessionId: string; fromCwd: string; toCwd: string }) =>
    ipcRenderer.invoke(CH.sessionMoveData, args),
  screenshotSnip: () => ipcRenderer.invoke(CH.screenshotSnip),
  capturePageRect: (rect) => ipcRenderer.invoke(CH.capturePageRect, rect),
  saveLongShotPng: (args) => ipcRenderer.invoke(CH.saveLongShotPng, args),
  resolveAsset: (rawUri: string) => ipcRenderer.invoke(CH.assetResolve, rawUri),

  getProxy: () => ipcRenderer.invoke(CH.proxyGet),
  setProxy: (proxy: string | null) => ipcRenderer.invoke(CH.proxySet, { proxy }),
  detectProxy: () => ipcRenderer.invoke(CH.proxyDetect),

  onStream: (cb: (event: AcpStreamEvent) => void) => subscribe(CH.pushStream, cb),
  onState: (cb: (event: ConnectionEvent) => void) => subscribe(CH.pushState, cb),
  onPermission: (cb: (event: PermissionRequestEvent) => void) => subscribe(CH.pushPermission, cb),
  onQuestion: (cb: (event: UserQuestionEvent) => void) => subscribe(CH.pushQuestion, cb),
  onLog: (cb: (line: string) => void) => subscribe(CH.pushLog, cb),
  onLoginProgress: (cb: (line: string) => void) => subscribe(CH.pushLoginProgress, cb),
  onMeta: (cb: (meta: AgentMetaEvent) => void) => subscribe(CH.pushMeta, cb),
  onTurnComplete: (cb: (event: TurnCompleteEvent) => void) =>
    subscribe(CH.pushTurnComplete, cb),

  mcpList: () => ipcRenderer.invoke(CH.mcpList),
  mcpAdd: (server: McpServerInput) => ipcRenderer.invoke(CH.mcpAdd, server),
  mcpRemove: (name: string) => ipcRenderer.invoke(CH.mcpRemove, name),
  mcpSetEnabled: (name: string, enabled: boolean) =>
    ipcRenderer.invoke(CH.mcpSetEnabled, { name, enabled }),
  mcpDoctor: (name: string | null) => ipcRenderer.invoke(CH.mcpDoctor, name),

  /* 终端能力：插件与市场 */
  pluginList: (cwd?: string) => ipcRenderer.invoke(CH.pluginList, cwd),
  pluginInstall: (source: string, cwd?: string) => ipcRenderer.invoke(CH.pluginInstall, { source, cwd }),
  pluginUninstall: (name: string, cwd?: string) => ipcRenderer.invoke(CH.pluginUninstall, { name, cwd }),
  pluginSetEnabled: (name: string, enabled: boolean, cwd?: string) =>
    ipcRenderer.invoke(CH.pluginSetEnabled, { name, enabled, cwd }),
  pluginDetails: (name: string, cwd?: string) => ipcRenderer.invoke(CH.pluginDetails, { name, cwd }),
  marketplaceList: (cwd?: string) => ipcRenderer.invoke(CH.marketplaceList, cwd),
  marketplaceAdd: (source: string, cwd?: string) => ipcRenderer.invoke(CH.marketplaceAdd, { source, cwd }),
  marketplaceRemove: (name: string, cwd?: string) =>
    ipcRenderer.invoke(CH.marketplaceRemove, { name, cwd }),
  marketplaceUpdate: (cwd?: string) => ipcRenderer.invoke(CH.marketplaceUpdate, cwd),

  /* 终端能力：存储 / 更新 / 记忆 / 环境 */
  diskUsage: (cwd?: string) => ipcRenderer.invoke(CH.diskUsage, cwd),
  versionInfo: (cwd?: string) => ipcRenderer.invoke(CH.versionInfo, cwd),
  updateCheck: (cwd?: string) => ipcRenderer.invoke(CH.updateCheck, cwd),
  updateInstall: (opts?: { version?: string; alpha?: boolean }) =>
    ipcRenderer.invoke(CH.updateInstall, opts),
  memoryClear: (scope: MemoryClearScope, cwd?: string) =>
    ipcRenderer.invoke(CH.memoryClear, { scope, cwd }),
  envInspect: (cwd: string) => ipcRenderer.invoke(CH.envInspect, cwd),

  /* 终端能力：git worktree */
  worktreeList: (cwd?: string) => ipcRenderer.invoke(CH.worktreeList, cwd),
  worktreeCreate: (input: { cwd: string; name?: string; ref?: string }) =>
    ipcRenderer.invoke(CH.worktreeCreate, input),
  worktreeRemove: (input: { id: string; force?: boolean; cwd?: string }) =>
    ipcRenderer.invoke(CH.worktreeRemove, input),
  worktreeGc: (input?: { maxAge?: string; dryRun?: boolean; cwd?: string }) =>
    ipcRenderer.invoke(CH.worktreeGc, input),

  login: (opts?: { oauth?: boolean }) => ipcRenderer.invoke(CH.login, opts ?? {}),

  /* 会话工具 */
  sessionSearch: (query: string, candidates: Array<{ sessionId: string; cwd: string; title: string }>) =>
    ipcRenderer.invoke(CH.sessionSearch, { query, candidates }),
  sessionExportMarkdown: (input: { sessionId: string; cwd: string; title: string }) =>
    ipcRenderer.invoke(CH.sessionExportMarkdown, input),
  sessionExportTrace: (sessionId: string, cwd?: string) =>
    ipcRenderer.invoke(CH.sessionExportTrace, { sessionId, cwd }),
  closeSession: (sessionId: string) => ipcRenderer.invoke(CH.agentCloseSession, { sessionId }),
  uiDensityGet: () => ipcRenderer.invoke(CH.uiDensityGet),
  uiDensitySet: (value: ToolCallDensity) => ipcRenderer.invoke(CH.uiDensitySet, { value }),
  billingQuota: (force?: boolean) => ipcRenderer.invoke(CH.billingQuota, { force: !!force }),
  sessionUsage: (args: { sessionId: string; cwd: string }) =>
    ipcRenderer.invoke(CH.sessionUsage, args),
  usageAggregate: (candidates: Array<{ sessionId: string; cwd: string; title: string }>) =>
    ipcRenderer.invoke(CH.usageAggregate, candidates),

  /* 关闭行为配置 */
  getCloseAction: () => ipcRenderer.invoke(CH.closeActionGet),
  setCloseAction: (action: CloseAction | null) => ipcRenderer.invoke(CH.closeActionSet, action),
  getLocale: () => ipcRenderer.invoke(CH.localeGet),
  setLocale: (locale: Locale | null) => ipcRenderer.invoke(CH.localeSet, locale),
  getDeletePurgeDefault: () => ipcRenderer.invoke(CH.deletePurgeDefaultGet),
  setDeletePurgeDefault: (value: boolean) => ipcRenderer.invoke(CH.deletePurgeDefaultSet, value),
  getDesktopPermToast: () => ipcRenderer.invoke(CH.desktopPermToastGet),
  setDesktopPermToast: (mode) => ipcRenderer.invoke(CH.desktopPermToastSet, mode),
  hideWindow: () => ipcRenderer.invoke(CH.windowHide),
  quitApp: () => ipcRenderer.invoke(CH.appQuit),

  accountGet: () => ipcRenderer.invoke(CH.accountGet),
  accountLogout: () => ipcRenderer.invoke(CH.accountLogout),

  onCloseActionRequest: (cb: () => void) => subscribe(CH.closeActionRequest, cb),
  onFocusSession: (cb: (event: { sessionId: string }) => void) =>
    subscribe(CH.pushFocusSession, cb),
  onPermissionSettled: (cb: (event: { requestId: number }) => void) =>
    subscribe(CH.pushPermissionSettled, cb),
  reportActiveSession: (sessionId: string | null) =>
    ipcRenderer.invoke(CH.reportActiveSession, { sessionId }),
  reportTaskbarBadge: (kind: 'none' | 'unread' | 'pending') =>
    ipcRenderer.invoke(CH.reportTaskbarBadge, { kind }),
  onLocaleChanged: (cb: (locale: Locale) => void) => subscribe(CH.localeChanged, cb)
}

contextBridge.exposeInMainWorld('grok', api)
