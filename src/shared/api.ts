/** 渲染进程可见的 API 契约（由 preload 通过 contextBridge 暴露） */

import type {
  AcpStreamEvent,
  ConnectionEvent,
  DiagnosticsReport,
  ImageAttachment,
  InitializeResult,
  NewSessionOptions,
  PermissionRequestEvent,
  ProxySettings,
  SessionNewResult
} from './types'

export interface AppInfo {
  version: string
  platform: string
  grokHome: string
  grokBinary: string | null
  /** 首次启动时的默认工作目录 */
  defaultCwd: string
}

export interface GrokDesktopApi {
  /* 连接 */
  start(): Promise<InitializeResult>
  status(): Promise<{ state: ConnectionEvent['state']; message?: string }>
  stop(): Promise<void>

  /* 会话 */
  newSession(options: NewSessionOptions): Promise<SessionNewResult>
  loadSession(sessionId: string, cwd: string): Promise<SessionNewResult>
  /** 确保会话已在当前 agent 进程中加载（未知则自动 session/load），防止幽灵会话 */
  ensureSession(sessionId: string, cwd: string): Promise<void>
  prompt(sessionId: string, text: string, images?: ImageAttachment[]): Promise<{ stopReason?: string }>
  cancel(sessionId: string): Promise<void>
  setConfigOption(sessionId: string, configId: string, value: string): Promise<unknown>
  respondPermission(requestId: number, optionId: string | null): Promise<void>

  /* 环境 */
  diagnostics(): Promise<DiagnosticsReport>
  pickDirectory(): Promise<string | null>
  appInfo(): Promise<AppInfo>
  openExternal(url: string): Promise<void>
  /** 拉起系统截图（Win+Shift+S 截图模式），结果进剪贴板，用户再 Ctrl+V 粘贴 */
  screenshotSnip(): Promise<void>

  /* 代理 */
  getProxy(): Promise<ProxySettings>
  /** 设置代理并重启 agent 使其生效；传 null 表示直连 */
  setProxy(proxy: string | null): Promise<ProxySettings>
  /** 扫描本机常见代理端口，返回命中的代理（不自动写入） */
  detectProxy(): Promise<ProxySettings | null>

  /* 事件订阅（返回取消订阅函数） */
  onStream(cb: (event: AcpStreamEvent) => void): () => void
  onState(cb: (event: ConnectionEvent) => void): () => void
  onPermission(cb: (event: PermissionRequestEvent) => void): () => void
  onLog(cb: (line: string) => void): () => void
}
