/** 渲染进程可见的 API 契约（由 preload 通过 contextBridge 暴露） */

import type {
  AcpStreamEvent,
  AgentMetaEvent,
  BillingQuota,
  CloseAction,
  ConnectionEvent,
  DiagnosticsReport,
  DiskUsageReport,
  GrokAccount,
  GrokEnvInfo,
  GrokUpdateInfo,
  GrokVersionInfo,
  ImageAttachment,
  InitializeResult,
  McpServer,
  McpServerInput,
  MemoryClearScope,
  NewSessionOptions,
  PermissionRequestEvent,
  PluginInfo,
  ProxySettings,
  GlobalUsageReport,
  SessionNewResult,
  SessionSearchHit,
  SessionUsageReport,
  ToolCallDensity,
  UserQuestionAnswers,
  UserQuestionEvent,
  WorktreeInfo
} from './types'

/** 应用自身的版本信息（来自 package.json + 编译期注入的构建时刻） */
export interface AppVersionInfo {
  /** package.json 的 version，如 0.2.0 */
  version: string
  /** 打包时刻（ISO 8601），区分「同一版本号的不同构建」 */
  buildTime: string
  /** 运行形态：true = 已打包的 exe，false = npm run dev */
  packaged: boolean
  electron: string
  chrome: string
  node: string
  platform: string
}

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
  /** 切换会话权限模式：'bypassPermissions'（自动批准）或 'default'（逐次询问） */
  setPermissionMode(sessionId: string, modeId: string): Promise<void>
  respondPermission(requestId: number, optionId: string | null): Promise<void>
  respondQuestion(requestId: number, answers: UserQuestionAnswers | null): Promise<void>

  /* 环境 */
  diagnostics(): Promise<DiagnosticsReport>
  pickDirectory(): Promise<string | null>
  appInfo(): Promise<AppInfo>
  /** 应用自身版本（package.json version + 打包时刻 + 运行时版本） */
  appVersion(): Promise<AppVersionInfo>
  openExternal(url: string): Promise<void>
  /** 在系统资源管理器中显示某个本地文件/目录 */
  revealPath(path: string): Promise<void>
  /** 计算会话在磁盘上的存储目录（~/.grok/sessions/<编码cwd>/<sessionId>） */
  sessionStoragePath(cwd: string, sessionId: string): Promise<string>
  /**
   * 批量读取会话在磁盘上的真实活动时间（ms 时间戳）。
   * 取 `events.jsonl` 最后一条事件的 `ts`（grok 自己写入的回合时间），
   * **不取文件 mtime** —— 重放/启动时 grok 会重写文件、mtime 会变成「现在」，
   * 正是侧栏时间被刷成「刚刚」的根因。查不到真实时间的会话不出现在结果里。
   */
  sessionActivity(items: Array<{ sessionId: string; cwd: string }>): Promise<Record<string, number>>
  /**
   * 删除会话在磁盘上的落盘目录（`~/.grok/sessions/<编码cwd>/<sessionId>`）。
   * **不做不可逆直删**：优先系统回收站（`method:'trash'`），
   * 系统回收站不可用时移入应用内回收站（`method:'quarantine'`，见 `quarantinePath`）。
   * 只删该会话目录，不动其它会话。`{ ok:false, error:'not-found' }` = 磁盘上本来就没有。
   */
  sessionDeleteData(args: { cwd: string; sessionId: string }): Promise<{
    ok: boolean
    path?: string
    method?: 'trash' | 'quarantine'
    quarantinePath?: string
    error?: string
  }>
  /**
   * 把会话的落盘目录从旧工作目录搬到新工作目录下
   * （`~/.grok/sessions/<编码fromCwd>/<sid>` → `<编码toCwd>/<sid>`）。
   *
   * grok / ACP 没有「改会话工作目录」的接口：同 ID 用另一个 cwd 调 `session/load`
   * 会直接 `FS_NOT_FOUND`（按「编码cwd + ID」拼路径定位）。物理搬目录后加载即成功，
   * 且后续回合的 `working_directory` 就是新目录 —— 所以这是唯一可行的搬移方式。
   */
  sessionMoveData(args: {
    sessionId: string
    fromCwd: string
    toCwd: string
  }): Promise<{
    ok: boolean
    fromDir?: string
    toDir?: string
    reason?: 'invalid-id' | 'not-found' | 'target-missing' | 'same-dir' | 'collision' | 'error'
    detail?: string
  }>
  /** 拉起系统截图（Win+Shift+S 截图模式），结果进剪贴板，用户再 Ctrl+V 粘贴 */
  screenshotSnip(): Promise<void>
  /**
   * 把 grok 下发的媒体地址归一化为可在渲染进程直接加载的 URL：
   * - http(s):// / data: / grok-asset:// 原样返回
   * - file://… 或本地绝对路径 → 转成 `grok-asset://<base64url>`（由主进程协议处理器流式读取）
   */
  resolveAsset(rawUri: string): Promise<string>

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
  onQuestion(cb: (event: UserQuestionEvent) => void): () => void
  onLog(cb: (line: string) => void): () => void

  /* MCP 服务器管理 */
  mcpList(): Promise<McpServer[]>
  /** 新增或按同名更新一个服务器；返回最新列表 */
  mcpAdd(server: McpServerInput): Promise<McpServer[]>
  /** 删除服务器；返回最新列表 */
  mcpRemove(name: string): Promise<McpServer[]>
  /** 启用/禁用；返回最新列表 */
  mcpSetEnabled(name: string, enabled: boolean): Promise<McpServer[]>
  /** 诊断（单个或全局）；返回人类可读文本 */
  mcpDoctor(name: string | null): Promise<string>

  /* ---------- 终端能力：插件与市场 ---------- */
  /** 已安装插件列表（`grok plugin list`） */
  pluginList(cwd?: string): Promise<PluginInfo[]>
  /** 从 git URL / user/repo / 本地路径安装；返回最新列表 */
  pluginInstall(source: string, cwd?: string): Promise<PluginInfo[]>
  /** 卸载插件；返回最新列表 */
  pluginUninstall(name: string, cwd?: string): Promise<PluginInfo[]>
  /** 启用/禁用插件（不卸载）；返回最新列表 */
  pluginSetEnabled(name: string, enabled: boolean, cwd?: string): Promise<PluginInfo[]>
  /** 插件组件清单（hook / MCP / skill）原文 */
  pluginDetails(name: string, cwd?: string): Promise<string>
  /** 已配置的插件市场源 */
  marketplaceList(cwd?: string): Promise<{ name: string; git: string }[]>
  marketplaceAdd(source: string, cwd?: string): Promise<string>
  marketplaceRemove(name: string, cwd?: string): Promise<string>
  /** 刷新市场缓存 */
  marketplaceUpdate(cwd?: string): Promise<string>

  /* ---------- 终端能力：存储 / 更新 / 记忆 / 环境 ---------- */
  /** `grok du`：~/.grok 各目录占用 */
  diskUsage(cwd?: string): Promise<DiskUsageReport>
  /** grok 自身版本 */
  versionInfo(cwd?: string): Promise<GrokVersionInfo>
  /** 检查 grok 更新（不安装） */
  updateCheck(cwd?: string): Promise<GrokUpdateInfo>
  /** 执行更新安装 */
  updateInstall(opts?: { version?: string; alpha?: boolean }): Promise<string>
  /** 清空跨会话记忆 */
  memoryClear(scope: MemoryClearScope, cwd?: string): Promise<string>
  /** `grok inspect`：grok 为该目录解析出的技能 / 子代理 / 插件 / MCP 视图 */
  envInspect(cwd: string): Promise<GrokEnvInfo>

  /* ---------- 终端能力：git worktree ---------- */
  worktreeList(cwd?: string): Promise<WorktreeInfo[]>
  /** 创建 worktree（等价终端 `grok -w`），返回新 worktree 信息（含绝对路径） */
  worktreeCreate(input: { cwd: string; name?: string; ref?: string }): Promise<WorktreeInfo>
  worktreeRemove(input: { id: string; force?: boolean; cwd?: string }): Promise<string>
  /** gc 预览/执行；不传 maxAge 时 grok 不会过期任何 worktree */
  worktreeGc(input?: { maxAge?: string; dryRun?: boolean; cwd?: string }): Promise<string>

  /** 触发 grok 登录流程（等价终端 `grok login`） */
  login(opts?: { oauth?: boolean }): Promise<string>

  /* ---------- 会话工具 ---------- */
  /**
   * 会话全文搜索：标题 + chat_history.jsonl 正文。
   * candidates 传渲染层已有的会话（按侧栏顺序），主进程只做只读扫描。
   */
  sessionSearch(
    query: string,
    candidates: Array<{ sessionId: string; cwd: string; title: string }>
  ): Promise<SessionSearchHit[]>
  /** 导出 Markdown：弹保存对话框；用户取消时返回 null */
  sessionExportMarkdown(input: {
    sessionId: string
    cwd: string
    title: string
  }): Promise<{ ok: boolean; path?: string; source?: 'grok' | 'local'; canceled?: boolean }>
  /** 导出诊断包（trace，只落本地） */
  sessionExportTrace(sessionId: string, cwd?: string): Promise<{
    ok: boolean
    path: string
    detail: string
  }>
  /**
   * 工具调用展示密度：读取 `~/.grok/config.toml` 的 `ui.tool_call_density`（grok 1.0.52 新增）。
   * migrated=true 表示值是从已废弃的 group_tool_verbs / collapsed_edit_blocks 推断出来的。
   */
  uiDensityGet(): Promise<{ value: ToolCallDensity; migrated: boolean; explicit: boolean }>
  /** 写入展示密度（就地改 config.toml，保留注释与其它键）；改完客户端立即生效 */
  uiDensitySet(value: ToolCallDensity): Promise<ToolCallDensity>
  /**
   * 账号额度：本周已用百分比、周期起止、按产品拆分。
   * 内部缓存 60 秒；force=true 时强制回源。
   */
  billingQuota(force?: boolean): Promise<{ quota: BillingQuota | null; error: string }>
  /**
   * 会话用量明细（token / 花费 / 每轮记录），等价终端 `grok usage <sid>`。
   * 数据来自 `usage.json`，读不到时主进程自动回退 CLI；都没有则返回 null。
   */
  sessionUsage(args: { sessionId: string; cwd: string }): Promise<SessionUsageReport | null>
  /** 跨会话累计：扫所有会话的 usage.json（最多 200 个） */
  usageAggregate(
    candidates: Array<{ sessionId: string; cwd: string; title: string }>
  ): Promise<GlobalUsageReport>
  /**
   * 关闭（卸载）会话：ACP `session/close`，只释放 agent 进程里的会话状态，
   * 磁盘数据与会话列表都不动；下次打开该会话会自动 session/load 回来。
   */
  closeSession(sessionId: string): Promise<void>

  /* 关闭行为配置 */
  /** 读取当前「点击关闭按钮时」的行为；null 表示未配置 */
  getCloseAction(): Promise<CloseAction | null>
  /** 写入行为；传 null 表示「每次询问」 */
  setCloseAction(action: CloseAction | null): Promise<void>
  /** 主进程隐藏窗口到托盘 */
  hideWindow(): Promise<void>
  /** 主进程标记退出并真正退出应用 */
  quitApp(): Promise<void>

  /* 账号管理：读取当前登录信息 / 退出登录（操作 ~/.grok/auth.json） */
  /** 读取当前登录的 grok 账户（非敏感字段）；未登录返回 null */
  accountGet(): Promise<GrokAccount | null>
  /** 退出登录：清除 ~/.grok 的缓存凭据并重启 agent 让改动生效 */
  accountLogout(): Promise<void>

  /* 事件订阅（返回取消订阅函数） */
  onStream(cb: (event: AcpStreamEvent) => void): () => void
  onState(cb: (event: ConnectionEvent) => void): () => void
  onPermission(cb: (event: PermissionRequestEvent) => void): () => void
  onQuestion(cb: (event: UserQuestionEvent) => void): () => void
  onLog(cb: (line: string) => void): () => void
  /** 主进程请求弹窗询问「关闭时如何」 */
  onCloseActionRequest(cb: () => void): () => void
  /** agent 上报的内置命令与公告 */
  onMeta(cb: (meta: AgentMetaEvent) => void): () => void
}
