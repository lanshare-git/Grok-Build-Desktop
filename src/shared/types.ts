/**
 * 共享类型定义 —— 主进程 / preload / 渲染进程三端共用。
 *
 *  ACP (Agent Client Protocol) 相关类型依据 grok agent stdio 的实际行为定义，
 *  字段命名保持与协议一致（snake_case / camelCase 混用是协议原貌，不做改写）。
 */

import type { MessageKey } from './i18n'

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

/**
 * 助手侧产出的媒体（图片/视频）。来源是 ACP `resource_link` / `image` 内容块，
 * 经 store 折叠进 assistant 消息。uri 是 grok 下发的原始地址（可能是 http(s) URL、
 * `file://`、本地绝对路径或内联 data URL），渲染前由 `window.grok.resolveAsset` 归一化。
 */
export interface MediaAttachment {
  kind: 'video' | 'image'
  uri: string
  mimeType?: string
  name?: string
}

/* ------------------------------------------------------------------ *
 *  ACP 协议：工具调用 / 计划 / 配置项
 * ------------------------------------------------------------------ */

/** ACP 协议里 agent 会下发的状态（`session/update` 的 status 字段只有这四种） */
export type AcpToolStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

/**
 * 工具卡状态 = ACP 状态 + 客户端兜底态 `interrupted`。
 *
 * `interrupted` **不会**由 agent 下发：回合已经结束（正常返回 / 报错 / 超时 / 被
 * `session/cancel` 中断），但客户端始终没收到该工具的终态 update 时，由客户端本地
 * 标记（见 `store.markStuckTools`）。语义是「没收到结果」，不是「执行失败」——
 * 区别在于：**失败是 agent 明确报错，中断是 agent 压根没再说话**。
 */
export type ToolStatus = AcpToolStatus | 'interrupted'

export interface ToolCallLocation {
  path: string
  line?: number | null
}

/** ACP `tool_call` / `tool_call_update` 的载体 */
export interface AcpToolCall {
  toolCallId: string
  title?: string
  kind?: string
  status?: AcpToolStatus
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
  /** agent 只会下发 AcpToolStatus 那四种；`interrupted` 是客户端本地兜底态，不会出现在协议里 */
  status?: AcpToolStatus
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
  /**
   * 本次 session/load 实际重放了多少条 session/update。
   * 主进程保证「重放全部下发」才返回这个结果，渲染层据此显示加载进度；
   * 为 0 表示没有重放（已在 agent 进程内、走了短路）。
   */
  replayed?: number
}

/* ------------------------------------------------------------------ *
 *  应用层：会话与消息模型
 * ------------------------------------------------------------------ */

export type ChatItem =
  | {
      kind: 'user'
      id: string
      text: string
      images?: ImageAttachment[]
      at: number
      /**
       * 客户端乐观插入（用户点发送时立刻上屏）。agent 回放/回显的
       * `user_message_chunk` 不得拼进这类消息，也不该在 session/load 清空时丢掉。
       */
      local?: boolean
    }
  | {
      kind: 'assistant'
      id: string
      text: string
      streaming: boolean
      at: number
      /** 助手侧产出的图片/视频（/imagine、/imagine-video 等生成结果） */
      media?: MediaAttachment[]
    }
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
  /** grok 自动生成的标题（session_info_update 下发，会随对话变化） */
  title: string
  /**
   * 会话种类标记（展示层用，不影响 grok 行为）：
   *  - `'chat'`：纯聊天 / 临时会话，不绑定任何项目，以用户主目录为工作根
   *  - 未标记：普通会话（默认按工作目录分组，多为项目会话）
   */
  kind?: 'chat'
  /**
   * 草稿会话标记：点击「新建会话 / 纯聊天」时只建本地草稿（不调 grok 的 session/new，
   * 磁盘不落文件），用户首次发送时才真正 newSession 并 materialize 成真实会话。
   */
  isDraft?: boolean
  /**
   * 草稿会话待定的权限模式：在 materialize 时传给 newSession。
   * 普通会话取当时的全局权限模式；纯聊天会话固定 'plan'（只读）。
   */
  pendingPermissionMode?: PermissionMode
  /**
   * 草稿待定的模型 / 推理强度：首发 `session/new` 时带上。
   * 真实会话以 `configOptions` 为准，这两个字段仅草稿使用。
   */
  pendingModel?: string
  pendingEffort?: string
  /**
   * 用户手动改的名字。展示时优先于 title；
   * 清空后回落到 grok 的自动标题，不会被自动标题覆盖。
   */
  customTitle?: string
  cwd: string
  createdAt: number
  /**
   * 会话最后活动时间。**优先取磁盘真值**（磁盘 events.jsonl 末条 ts，字段 activityAt），
   * 只在没有磁盘真值时才回落到这里由客户端记的时间。
   * 排序一律走 `sessionActivityAt()`，不要直接读本字段 —— 客户端记的值会被
   * 重放污染（见 store.ts 的说明）。
   */
  updatedAt: number
  /**
   * 会话真实活动时间（ms）。来源：
   *  1) 启动/加载/回合结束时主进程从磁盘 events.jsonl 的 turn_* 回填；
   *  2) 回合进行中客户端在真实流式更新与发消息时同步刷成现在。
   * 侧栏优先读它（`sessionActivityAt`），避免 updatedAt 被 session/load 重放污染；
   * 也避免「只刷 updatedAt、旧 activityAt 压住正在进行的回合」。
   */
  activityAt?: number
  items: ChatItem[]
  /** 会话级配置项（模型、推理强度） */
  configOptions: ConfigOption[]
  commands: AvailableCommand[]
  /** 上一次 turn 的用量统计 */
  usage?: TurnUsage
}

/** 工作目录：别名与手动登记的目录（会话分组以此为准） */
export interface WorkspaceMeta {
  /** 目录路径；比较时统一走 normalizeDir */
  path: string
  /** 用户起的别名；缺省时界面显示目录名 */
  alias?: string
  /** 由用户在侧栏手动加入，即使目录下还没有会话也保留在列表里 */
  manual?: boolean
  createdAt: number
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

/** 点击窗口关闭按钮时的行为：'tray'=隐藏到托盘，'quit'=直接退出 */
export type CloseAction = 'tray' | 'quit'

/**
 * 屏幕右下角桌面授权浮窗：
 *  - 'on'：后台或其它会话有待授权时弹出（默认）
 *  - 'off'：不弹浮窗（只靠会话内联面板 + 侧栏色点）
 */
export type DesktopPermToastMode = 'on' | 'off'

/**
 * 当前登录的 grok 账户信息（非敏感字段）。
 * 从 ~/.grok/auth.json 提取，刻意排除 refresh_token / key / expires_at 等凭据。
 * 用于在设置中心展示「当前账号」。auth.json 不存在或为空时整体为 null。
 */
export interface GrokAccount {
  /** 登录邮箱（auth.json 的 email 字段） */
  email?: string
  /** 名字 / 姓氏 */
  firstName?: string
  lastName?: string
  /** 用户唯一标识 */
  userId?: string
  /** 所属团队 id（个人账号可能为空） */
  teamId?: string
  /** 主体类型，如 'user' / 'team' */
  principalType?: string
  /** 鉴权方式，如 'oauth' / 'device' */
  authMode?: string
}

/** 代理配置（主进程 <-> 渲染进程） */
export interface ProxySettings {
  proxy: string | null
  proxyAutoDetected: boolean
  /** 自动探测命中的代理描述，仅探测接口返回 */
  label?: string
}

/* ------------------------------------------------------------------ *
 *  应用层：MCP 服务器管理
 *
 *  grok CLI 自带 `grok mcp` 子命令，配置落地在
 *  ~/.grok/config.toml（user 作用域）或 ./grok/config.toml（project 作用域）。
 *  桌面端只走 user 作用域，等价于「为当前账户配置、对所有项目生效」。
 *  `grok mcp list --json` 实际只回传 command/args/enabled/name/scope，
 *  远程服务器的 url、env、headers 不出现在列表里，编辑时需要用户重新填写。
 * ------------------------------------------------------------------ */

export type McpTransport = 'stdio' | 'http' | 'sse'

/** `grok mcp list --json` 解析出的单个服务器（已规整化） */
export interface McpServer {
  name: string
  scope: 'user' | 'project'
  enabled: boolean
  /** 传输类型：有 command 视为 stdio，否则按 url 视为 remote（默认 http） */
  transport: McpTransport
  /** stdio：启动命令可执行文件 */
  command?: string
  /** stdio：命令参数 */
  args?: string[]
  /** remote：连接地址（list --json 不回传，编辑时由用户补填） */
  url?: string
}

/** 新增 / 编辑服务器时提交的表单数据 */
export interface McpServerInput {
  name: string
  transport: McpTransport
  /** stdio：完整启动命令行，如 "npx -y @modelcontextprotocol/server-postgres" */
  commandLine?: string
  /** http/sse：连接地址 */
  url?: string
  /** 注入给服务器进程的环境变量（KEY=VALUE） */
  env?: string[]
  /** 远程服务器的 HTTP 头（"Name: Value"） */
  headers?: string[]
}

/* ------------------------------------------------------------------ *
 *  应用层：终端能力（grok CLI 子命令，经主进程 grok-cli.ts 驱动）
 *
 *  这些能力 ACP 协议没有暴露，只能直接驱动 CLI：
 *  插件市场 / 存储占用 / 版本更新 / 跨会话记忆 / git worktree / 配置自检 / 会话导出。
 *  与 agent 共用同一份 ~/.grok，因此桌面端看到的就是终端看到的状态。
 * ------------------------------------------------------------------ */

/** 已安装插件（`grok plugin list --json` 规整化后） */
export interface PluginInfo {
  name: string
  version: string
  enabled: boolean
  description: string
  /** 来源：git 地址 / 本地路径 / 类型名 */
  source: string
  /** 插件安装目录（grok 未回传时为空） */
  path: string
}

export interface DiskUsageDirEntry {
  name: string
  bytes: number
}

/** `grok du --json` 规整化结果 */
export interface DiskUsageReport {
  grokHome: string
  totalBytes: number
  /** 顶层目录占用，按字节倒序 */
  dirs: DiskUsageDirEntry[]
  worktrees: Array<{ id: string; path: string; label: string; bytes: number }>
  registryPath: string
}

/** `grok worktree list --json` 规整化结果（等价终端的 `grok -w`） */
export interface WorktreeInfo {
  id: string
  path: string
  label: string
  repoName: string
  sourceRepo: string
  /** fork = 独立副本；其他类型原样透传 */
  kind: string
  branch: string
  status: string
  /** ms */
  createdAt: number
  /** ms；从未访问过为 0 */
  lastAccessedAt: number
}

/** `grok update --check --json` */
export interface GrokUpdateInfo {
  currentVersion: string
  latestVersion: string
  updateAvailable: boolean
  installer: string
  /** stable / alpha */
  channel: string
  autoUpdate: boolean
  error: string
}

export interface GrokVersionInfo {
  version: string
  raw: string
  error?: string
}

export type MemoryClearScope = 'workspace' | 'global' | 'all'

/**
 * `grok inspect --json` 的精简视图。
 * skills / agents 是关键：终端 TUI 会把全部内置技能与子代理列进命令面板，
 * 而 ACP 只上报 7 条运行时命令，客户端必须靠这里补齐。
 */
export interface GrokEnvInfo {
  grokVersion: string
  channel: string
  cwd: string
  projectRoot: string
  projectTrusted: boolean
  skills: Array<{ name: string; description: string; source: string }>
  agents: Array<{ name: string; description: string; source: string }>
  pluginCount: number
  mcpServerCount: number
}

/* ------------------------------------------------------------------ *
 *  用量（token / 花费）
 *
 *  数据源 = `~/.grok/sessions/<编码cwd>/<sid>/usage.json`（内容与终端
 *  `grok usage <sid>` 的输出完全一致），拿不到时回退调 CLI。
 *  这个文件**不受 session/load 重放影响**（重放只刷 mtime），所以是可信的持久化数据。
 *
 *  ⚠️ `inputTokens` **包含**缓存命中部分（cachedReadTokens 是它的子集），
 *     展示时必须写成「输入 X（其中缓存命中 Y）」，否则会重复计数。
 *  ⚠️ 花费字段叫 `costUsdTicks`，单位是 1e-9 美元（十亿美元分之一），要除以 1e9。
 * ------------------------------------------------------------------ */

export interface UsageTotals {
  inputTokens: number
  outputTokens: number
  cachedReadTokens: number
  cacheCreationTokens: number
  reasoningTokens: number
  totalTokens: number
  /** 模型调用次数（一次用户输入可能触发多次模型调用） */
  modelCalls: number
  /** 已结算花费（美元，由 ticks 换算而来） */
  costUsd: number
  /** 用户轮数 */
  turnCount: number
  primaryModelId?: string
}

export interface TurnUsageRecord extends UsageTotals {
  turnNumber: number
  /** 该轮结束时刻（ISO 8601） */
  endedAt?: string
}

/** 单个会话的用量报告（等价终端 `grok usage <sid>`） */
export interface SessionUsageReport {
  sessionId: string
  updatedAt?: string
  totals: UsageTotals
  /** 按模型拆分的花费/ token */
  byModel: Array<{ modelId: string } & UsageTotals>
  turns: TurnUsageRecord[]
  /** true = 来自磁盘 usage.json；false = 由 CLI 兜底 */
  fromDisk: boolean
}

/** 全局累计（扫所有会话目录的 usage.json） */
export interface GlobalUsageReport {
  totals: UsageTotals
  /** 覆盖到的会话数（有 usage.json 的） */
  sessionCount: number
  /** 扫过但没有 usage.json 的会话数（多为草稿/未产生消耗） */
  missingCount: number
  byModel: Array<{ modelId: string } & UsageTotals>
  /** 花销最高的会话（降序） */
  topSessions: Array<{
    sessionId: string
    title: string
    cwd: string
    costUsd: number
    totalTokens: number
    turnCount: number
    updatedAt?: string
  }>
}

/* ------------------------------------------------------------------ *
 *  账号额度（每周用量百分比）
 *
 *  数据源 = `cli-chat-proxy.grok.com/v1/billing?format=credits`（ACP 没有暴露，
 *  见 main/billing.ts 的说明）。周期默认每周重置（USAGE_PERIOD_TYPE_WEEKLY）。
 *  ⚠️ `usedPercent` 是**已用**百分比，不是剩余；剩余要用 100 减。
 * ------------------------------------------------------------------ */

export interface BillingProductUsage {
  /** GrokBuild / GrokChat / GrokImagine … */
  product: string
  usagePercent: number
}

export interface BillingQuota {
  /** 本计费周期内**已用**百分比（0-100） */
  usedPercent: number
  remainingPercent: number
  /** 形如 USAGE_PERIOD_TYPE_WEEKLY */
  periodType: string
  periodStart: string
  periodEnd: string
  products: BillingProductUsage[]
  prepaidBalance: number
  onDemandCap: number
  onDemandUsed: number
  isUnifiedBillingUser: boolean
  fetchedAt: number
}

/** 会话搜索命中（主进程扫 chat_history.jsonl 得到） */
export interface SessionSearchHit {
  sessionId: string
  cwd: string
  where: 'title' | 'content'
  snippet: string
}

/** agent 上报的元能力（主进程 -> 渲染进程） */
export interface AgentMetaEvent {
  /** initialize 响应里给出的内置命令清单 */
  commands: AvailableCommand[]
  /** 运行期下发的公告 */
  announcements: GrokAnnouncement[]
}

/* ------------------------------------------------------------------ *
 *  工具调用展示密度（grok 1.0.52 新增，终端 `/density`）
 *
 *  落盘位置 `~/.grok/config.toml` 的 `ui.tool_call_density`，
 *  **与终端共用同一份配置**：客户端改完，终端下次启动即生效（反之亦然）。
 *  这五档的取值必须与 grok 完全一致，不要自创。
 * ------------------------------------------------------------------ */

export type ToolCallDensity =
  | 'detailed'
  | 'compact-shells'
  | 'compact-ungrouped'
  | 'compact-grouped'
  | 'compact-all-grouped'

export interface ToolCallDensityOption {
  value: ToolCallDensity
  /** 字典键（density.<value>.label），消费处渲染时 t(labelKey) */
  labelKey: MessageKey
  /** 字典键（density.<value>.desc） */
  descKey: MessageKey
}

/** 从详细到紧凑；desc 说明客户端的具体行为 */
export const DENSITY_OPTIONS: ToolCallDensityOption[] = [
  {
    value: 'detailed',
    labelKey: 'density.detailed.label',
    descKey: 'density.detailed.desc'
  },
  {
    value: 'compact-shells',
    labelKey: 'density.compact-shells.label',
    descKey: 'density.compact-shells.desc'
  },
  {
    value: 'compact-ungrouped',
    labelKey: 'density.compact-ungrouped.label',
    descKey: 'density.compact-ungrouped.desc'
  },
  {
    value: 'compact-grouped',
    labelKey: 'density.compact-grouped.label',
    descKey: 'density.compact-grouped.desc'
  },
  {
    value: 'compact-all-grouped',
    labelKey: 'density.compact-all-grouped.label',
    descKey: 'density.compact-all-grouped.desc'
  }
]

/** 是否把连续的同种工具调用合并成汇总卡 */
export function densityGroupsTools(d: ToolCallDensity): boolean {
  return d === 'compact-grouped' || d === 'compact-all-grouped'
}

/** 是否连命令/终端类卡片的参数摘要也不显示 */
export function densityHidesShellSummary(d: ToolCallDensity): boolean {
  return d === 'compact-shells'
}

/** 是否把「思考过程」默认收起 */
export function densityCollapsesThinking(d: ToolCallDensity): boolean {
  return d === 'compact-all-grouped'
}

/** 是否默认展开工具卡片（仅 detailed） */
export function densityExpandsByDefault(d: ToolCallDensity): boolean {
  return d === 'detailed'
}

/** grok 下发的公告（`_x.ai/announcements/update`）：新功能提示，终端里表现为启动横幅 */
export interface GrokAnnouncement {
  id: string
  title?: string
  message: string
  severity?: string
  /** 带命令提示的公告，如「用 /density 选择工具展示密度」 */
  cta?: string | null
  expiresAt?: string | null
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

/**
 * grok 权限模式（ACP `session/set_mode` 的 modeId，见 grok 官方文档）：
 *  - `default`          只读工具与内置只读 shell 免询问，其余每次询问（Codex「请求批准」）
 *  - `auto`             安全分类器放行日常操作，仅风险操作弹窗（Codex「帮我审批」）
 *  - `acceptEdits`      文件编辑免询问，其他工具仍逐次询问
 *  - `plan`             兼容占位模式
 *  - `dontAsk`          仅 allow 规则内的工具免询问，最严格
 *  - `bypassPermissions` 全部放行（always-approve/yolo；deny 规则与 hook 仍生效）
 */
export type PermissionMode =
  | 'default'
  | 'auto'
  | 'acceptEdits'
  | 'plan'
  | 'dontAsk'
  | 'bypassPermissions'

export interface PermissionModeOption {
  value: PermissionMode
  /** 字典键（permissionMode.<value>.label），消费处渲染时 t(labelKey) */
  labelKey: MessageKey
  /** 字典键（permissionMode.<value>.desc） */
  descKey: MessageKey
}

/** 全部权限模式（顺序即界面展示顺序；前三档与 Codex 三档一一对应） */
export const PERMISSION_MODE_OPTIONS: PermissionModeOption[] = [
  {
    value: 'default',
    labelKey: 'permissionMode.default.label',
    descKey: 'permissionMode.default.desc'
  },
  {
    value: 'auto',
    labelKey: 'permissionMode.auto.label',
    descKey: 'permissionMode.auto.desc'
  },
  {
    value: 'bypassPermissions',
    labelKey: 'permissionMode.bypassPermissions.label',
    descKey: 'permissionMode.bypassPermissions.desc'
  },
  {
    value: 'acceptEdits',
    labelKey: 'permissionMode.acceptEdits.label',
    descKey: 'permissionMode.acceptEdits.desc'
  },
  {
    value: 'dontAsk',
    labelKey: 'permissionMode.dontAsk.label',
    descKey: 'permissionMode.dontAsk.desc'
  },
  {
    value: 'plan',
    labelKey: 'permissionMode.plan.label',
    descKey: 'permissionMode.plan.desc'
  }
]

export interface NewSessionOptions {
  cwd: string
  model?: string
  reasoningEffort?: string
  /** 会话级规则，附加到系统提示词 */
  rules?: string
  /** 新建会话使用的权限模式。默认 bypassPermissions（完全访问） */
  permissionMode?: PermissionMode
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

/**
 * agent 回合终态通知（`_x.ai/session/update` → turn_completed，
 * 或 `x.ai/session/prompt_complete`）。
 * 与 `session/prompt` 的 JSON-RPC 返回是一对信号；桌面端此前只等后者，
 * 后者若迟迟不到 UI 就会一直「正在工作」——即使用户可见内容已写完。
 */
export interface TurnCompleteEvent {
  sessionId: string
  promptId?: string
  stopReason?: string
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

/* ------------------------------------------------------------------ *
 *  用户提问（grok 的 ask_user_question 工具，经 ACP 扩展方法）
 * ------------------------------------------------------------------ */

export interface UserQuestionOption {
  label: string
  description?: string
}

export interface UserQuestion {
  question: string
  options: UserQuestionOption[]
  multiSelect?: boolean
}

export interface UserQuestionEvent {
  requestId: number
  sessionId: string
  questions: UserQuestion[]
}

/** 用户回答：问题文本 -> 所选 label 或自定义回答 */
export type UserQuestionAnswers = Record<string, string>
