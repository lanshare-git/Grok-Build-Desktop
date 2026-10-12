/**
 * 共享类型定义 —— 主进程 / preload / 渲染进程三端共用。
 *
 * ACP (Agent Client Protocol) 相关类型依据 grok agent stdio 的实际行为定义，
 * 字段命名保持与协议一致（snake_case / camelCase 混用是协议原貌，不做改写）。
 */

/* ------------------------------------------------------------------ *
 *  ACP 协议：内容块
 * ------------------------------------------------------------------ */

export interface TextContentBlock {
  type: 'text'
  text: string
}

export interface ResourceLinkBlock {
  type: 'resource_link'
  uri: string
  name?: string
  mimeType?: string
}

export interface ImageContentBlock {
  type: 'image'
  data: string
  mimeType: string
  uri?: string
}

export type ContentBlock = TextContentBlock | ResourceLinkBlock | ImageContentBlock

/* ------------------------------------------------------------------ *
 *  ACP 协议：工具调用 / 计划 / 配置项
 * ------------------------------------------------------------------ */

export type ToolStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

export interface ToolCallLocation {
  path: string
  line?: number | null
}

/** ACP `tool_call` / `tool_call_update` 的载体 */
export interface AcpToolCall {
  toolCallId: string
  title?: string
  kind?: string
  status?: ToolStatus
  /** xAI 扩展：内部工具 ID，如 read_file / run_terminal_cmd */
  toolName?: string
  rawInput?: unknown
  rawOutput?: unknown
  content?: unknown[]
  locations?: ToolCallLocation[]
}

export interface PlanEntry {
  content: string
  status?: string
  priority?: string
}

export interface ConfigOptionChoice {
  value: string
  name?: string
  description?: string
}

/** `session/new` 返回的 configOptions 元素（标准 ACP） */
export interface ConfigOption {
  id?: string
  configId?: string
  name?: string
  description?: string
  category?: string
  currentValue?: string
  options?: ConfigOptionChoice[]
}

export interface AvailableCommand {
  name: string
  description?: string
  input?: unknown
}

/* ------------------------------------------------------------------ *
 *  ACP 协议：session/update 通知
 * ------------------------------------------------------------------ */

/**
 * 协议本身把 sessionUpdate 当作判别字段，且未来会新增类型，
 * 因此这里保持宽松结构，消费端按 sessionUpdate 分支处理。
 */
export interface SessionUpdateEnvelope {
  sessionUpdate: string
  content?: TextContentBlock
  toolCallId?: string
  title?: string
  kind?: string
  status?: ToolStatus
  toolName?: string
  rawInput?: unknown
  rawOutput?: unknown
  entries?: PlanEntry[]
  availableCommands?: AvailableCommand[]
  configOptions?: ConfigOption[]
  [key: string]: unknown
}

/* ------------------------------------------------------------------ *
 *  ACP 协议：握手结果
 * ------------------------------------------------------------------ */

export interface AuthMethod {
  id: string
  name?: string
  description?: string
}

export interface InitializeResult {
  protocolVersion?: number
  agentInfo?: { name?: string; title?: string; version?: string }
  authMethods?: AuthMethod[]
  agentCapabilities?: Record<string, unknown>
  _meta?: Record<string, unknown>
}

export interface SessionNewResult {
  sessionId: string
  configOptions?: ConfigOption[]
  modes?: unknown
}

/* ------------------------------------------------------------------ *
 *  应用层：会话与消息模型
 * ------------------------------------------------------------------ */

export type ChatItem =
  | { kind: 'user'; id: string; text: string; images?: ImageAttachment[]; at: number }
  | { kind: 'assistant'; id: string; text: string; streaming: boolean; at: number }
  | { kind: 'thinking'; id: string; text: string; streaming: boolean; at: number }
  | {
      kind: 'tool'
      id: string
      toolCallId: string
      title: string
      toolKind?: string
      toolName?: string
      status: ToolStatus
      input?: unknown
      output?: unknown
      locations?: ToolCallLocation[]
      at: number
    }
  | { kind: 'plan'; id: string; entries: PlanEntry[]; at: number }
  | { kind: 'notice'; id: string; text: string; level: 'info' | 'warn' | 'error'; at: number }

export interface SessionMeta {
  id: string
  title: string
  cwd: string
  createdAt: number
  updatedAt: number
  items: ChatItem[]
  /** 会话级配置项（模型、推理强度） */
  configOptions: ConfigOption[]
  commands: AvailableCommand[]
  /** 上一次 turn 的用量统计 */
  usage?: TurnUsage
}

export interface TurnUsage {
  inputTokens?: number
  outputTokens?: number
  cacheReadInputTokens?: number
  cacheCreationInputTokens?: number
  reasoningTokens?: number
  totalTokens?: number
  numTurns?: number
  costUsd?: number
  model?: string
}

export type ConnectionState = 'idle' | 'starting' | 'ready' | 'error' | 'stopped'

/* ------------------------------------------------------------------ *
 *  应用层：诊断
 * ------------------------------------------------------------------ */

export type CheckLevel = 'ok' | 'warn' | 'error'

export interface DiagnosticCheck {
  id: string
  label: string
  level: CheckLevel
  detail: string
  hint?: string
}

export interface DiagnosticsReport {
  checks: DiagnosticCheck[]
  grokHome: string
  grokBinary: string | null
  version: string | null
  account: string | null
  tokenExpiresAt: string | null
  models: string[]
  /** 当前生效的代理地址；null 表示直连 */
  proxy: string | null
  at: number
}

/** 代理配置（主进程 <-> 渲染进程） */
export interface ProxySettings {
  proxy: string | null
  proxyAutoDetected: boolean
  /** 自动探测命中的代理描述，仅探测接口返回 */
  label?: string
}

/* ------------------------------------------------------------------ *
 *  应用层：渲染进程 -> 主进程 的调用载荷
 * ------------------------------------------------------------------ */

/** 随消息发送的图片附件（data 为不带 data: 前缀的 base64） */
export interface ImageAttachment {
  data: string
  mimeType: string
  /** 展示用文件名，可缺省 */
  name?: string
}

export interface NewSessionOptions {
  cwd: string
  model?: string
  reasoningEffort?: string
  /** 会话级规则，附加到系统提示词 */
  rules?: string
  /** 是否自动批准工具执行（yolo）。默认 true */
  autoApprove?: boolean
}

export interface PromptPayload {
  sessionId: string
  text: string
  /** 图片附件，作为 image 内容块随 prompt 一起发送 */
  images?: ImageAttachment[]
}

/* ------------------------------------------------------------------ *
 *  IPC 通道事件
 * ------------------------------------------------------------------ */

export interface AcpStreamEvent {
  sessionId: string
  update: SessionUpdateEnvelope
}

export interface ConnectionEvent {
  state: ConnectionState
  message?: string
}

export interface PermissionRequestEvent {
  requestId: number
  sessionId: string
  toolCall?: AcpToolCall
  options: Array<{ optionId: string; name?: string; kind?: string }>
}
