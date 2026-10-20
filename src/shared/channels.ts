/** IPC 通道名常量 —— 三端共用，避免字符串漂移 */

export const CH = {
  /* renderer -> main（invoke，有返回值） */
  agentStart: 'agent:start',
  agentStatus: 'agent:status',
  agentNewSession: 'agent:new-session',
  agentLoadSession: 'agent:load-session',
  agentPrompt: 'agent:prompt',
  agentCancel: 'agent:cancel',
  agentEnsureSession: 'agent:ensure-session',
  agentSetConfig: 'agent:set-config',
  agentSetMode: 'agent:set-mode',
  agentPermissionResponse: 'agent:permission-response',
  agentQuestionResponse: 'agent:question-response',
  agentStop: 'agent:stop',

  diagnosticsRun: 'diagnostics:run',
  /** 冷启动模型目录种子（读 grok 磁盘缓存合成 model/reasoning_effort 选项，供无会话时的草稿下拉） */
  modelConfigSeed: 'grok:model-config-seed',
  proxyGet: 'proxy:get',
  proxySet: 'proxy:set',
  proxyDetect: 'proxy:detect',
  pickDirectory: 'dialog:pick-directory',
  appInfo: 'app:info',
  appVersion: 'app:version',
  openExternal: 'app:open-external',
  /** 在资源管理器中显示某个本地文件/目录 */
  revealPath: 'app:reveal-path',
  /** 计算会话在磁盘上的存储目录（~/.grok/sessions/<编码cwd>/<sessionId>） */
  sessionStoragePath: 'session:storage-path',
  /** 批量读取会话在磁盘上的真实活动时间（events.jsonl 最后一条 ts），用于侧栏排序 */
  sessionActivity: 'session:activity',
  /** 删除会话在磁盘上的落盘目录（走回收站，可还原） */
  sessionDeleteData: 'session:delete-data',
  /** 把会话的落盘目录搬到另一个工作目录下（grok 没有「改会话工作目录」的接口，只能搬目录） */
  sessionMoveData: 'session:move-data',
  screenshotSnip: 'app:screenshot-snip',
  /**
   * 截取当前窗口某一矩形区域为 PNG（DIP 坐标，相对窗口客户区）。
   * 给会话「长截屏」滚屏拼图用。
   */
  capturePageRect: 'app:capture-page-rect',
  /** 把 PNG 写入剪贴板，并可选弹出另存为对话框 */
  saveLongShotPng: 'app:save-long-shot-png',
  /** 把 grok 下发的媒体地址（file://、本地绝对路径、http(s)、data:）归一化为可加载的 URL */
  assetResolve: 'asset:resolve',

  /* MCP 服务器管理 */
  mcpList: 'mcp:list',
  mcpAdd: 'mcp:add',
  mcpRemove: 'mcp:remove',
  mcpSetEnabled: 'mcp:set-enabled',
  mcpDoctor: 'mcp:doctor',

  /* ---------- 终端能力（grok CLI 子命令） ---------- */
  /** 插件与插件市场 */
  pluginList: 'grok:plugin-list',
  pluginInstall: 'grok:plugin-install',
  pluginUninstall: 'grok:plugin-uninstall',
  pluginSetEnabled: 'grok:plugin-set-enabled',
  pluginDetails: 'grok:plugin-details',
  marketplaceList: 'grok:marketplace-list',
  marketplaceAdd: 'grok:marketplace-add',
  marketplaceRemove: 'grok:marketplace-remove',
  marketplaceUpdate: 'grok:marketplace-update',
  /** 存储占用 / 版本更新 / 记忆 / 配置自检 */
  diskUsage: 'grok:disk-usage',
  versionInfo: 'grok:version-info',
  updateCheck: 'grok:update-check',
  updateInstall: 'grok:update-install',
  memoryClear: 'grok:memory-clear',
  envInspect: 'grok:env-inspect',
  /** git worktree */
  worktreeList: 'grok:worktree-list',
  worktreeCreate: 'grok:worktree-create',
  worktreeRemove: 'grok:worktree-remove',
  worktreeGc: 'grok:worktree-gc',
  /** 登录（grok login） */
  login: 'grok:login',
  /** 登录过程中的实时输出（设备码 / URL 等） */
  pushLoginProgress: 'push:login-progress',
  /** 会话全文搜索 */
  sessionSearch: 'session:search',
  /** 导出：Markdown 落盘（弹出保存对话框）/ trace 诊断包 */
  sessionExportMarkdown: 'session:export-markdown',
  sessionExportTrace: 'session:export-trace',
  /** 关闭（卸载）会话：只从 agent 进程释放，不动磁盘数据 */
  agentCloseSession: 'agent:close-session',
  /** 工具调用展示密度（grok 1.0.52 的 `ui.tool_call_density`，与终端共用） */
  uiDensityGet: 'grok:ui-density-get',
  uiDensitySet: 'grok:ui-density-set',
  /** 账号额度（每周用量百分比，等价 TUI `/usage` 的 Usage limit 页） */
  billingQuota: 'grok:billing-quota',
  /** 用量：单个会话明细（等价 `grok usage <sid>`）/ 跨会话累计 */
  sessionUsage: 'session:usage',
  usageAggregate: 'session:usage-aggregate',

  /* 关闭行为配置 */
  closeActionGet: 'config:close-action-get',
  closeActionSet: 'config:close-action-set',

  /* 界面语言（locale） */
  localeGet: 'config:locale-get',
  localeSet: 'config:locale-set',

  /* 删除确认弹窗的默认值：是否默认勾选「同时删除磁盘文件」 */
  deletePurgeDefaultGet: 'config:delete-purge-default-get',
  deletePurgeDefaultSet: 'config:delete-purge-default-set',

  /* 屏幕右下角桌面授权浮窗 */
  desktopPermToastGet: 'config:desktop-perm-toast-get',
  desktopPermToastSet: 'config:desktop-perm-toast-set',

  /* 账号：读取当前登录信息 / 退出登录 */
  accountGet: 'account:get',
  accountLogout: 'account:logout',
  /** 主进程隐藏窗口到托盘（不退出） */
  windowHide: 'window:hide',
  /** 主进程标记退出并 app.quit() */
  appQuit: 'app:quit',

  /* main -> renderer（send，单向推送） */
  pushStream: 'push:stream',
  /** agent 回合终态（turn_completed / prompt_complete），用于立刻收尾 running */
  pushTurnComplete: 'push:turn-complete',
  /** 后台任务快照（`_x.ai/session_notification` → background_tasks） */
  pushBackgroundTasks: 'push:background-tasks',
  /** 主进程请求渲染层弹窗询问「关闭时如何」（配置为空时触发） */
  closeActionRequest: 'close:action-request',
  pushState: 'push:state',
  pushPermission: 'push:permission',
  pushQuestion: 'push:question',
  pushLog: 'push:log',
  /** agent 上报的内置命令（initialize）与公告（announcements/update） */
  pushMeta: 'push:meta',
  /** 系统通知被点击：请渲染层切到该会话去处理待授权/提问 */
  pushFocusSession: 'push:focus-session',
  /** 桌面授权浮窗已处理（或主窗口已响应）：渲染层清掉对应 permission 卡 */
  pushPermissionSettled: 'push:permission-settled',
  /** 桌面授权浮窗：用户点了允许/拒绝 */
  toastPermissionDecide: 'toast:permission-decide',
  /** 桌面授权浮窗：用户点 × 仅关闭（不代替授权决定） */
  toastPermissionDismiss: 'toast:permission-dismiss',
  /** 桌面授权浮窗：用户点「打开应用」 */
  toastOpenApp: 'toast:open-app',
  /** 渲染层汇报当前正在看的会话（用于：看该会话时自动收起桌面浮窗） */
  reportActiveSession: 'ui:report-active-session',
  /** 渲染层汇报任务栏角标：none / unread（蓝）/ pending（橙） */
  reportTaskbarBadge: 'ui:report-taskbar-badge',
  /** 语言切换后广播给所有窗口（payload 为归一后的 Locale） */
  localeChanged: 'push:locale-changed'
} as const
