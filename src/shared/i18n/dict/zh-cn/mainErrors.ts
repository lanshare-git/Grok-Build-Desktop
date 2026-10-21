export const mainErrors = {
  sessionDelete: {
    missingCwd: '会话缺少工作目录',
    invalidId: '会话 ID 不合法，已拒绝删除',
    dataRemain: (vars: { path: string }) =>
      `删除失败（该会话可能正被 grok 占用）：原目录仍有会话数据。数据副本已存于应用内回收站：${vars.path}`,
    failed: (vars: { message: string }) => `删除失败（该会话可能正被 grok 占用）：${vars.message}`
  },
  sessionMove: {
    invalidId: '会话 ID 不合法，已拒绝搬移',
    missingCwd: '缺少工作目录',
    sameDir: '已经在目标工作目录下',
    targetNotDir: (vars: { path: string }) => `目标目录不是文件夹：${vars.path}`,
    targetMissing: (vars: { path: string }) => `目标目录不存在：${vars.path}`,
    notFound: '磁盘上找不到该会话的目录（草稿会话，或已被清理）',
    outOfBounds: '目标路径越界，已拒绝搬移',
    collision: (vars: { path: string }) => `目标目录下已存在同名会话目录，未做覆盖：${vars.path}`,
    failed: (vars: { message: string }) => `搬移失败（该会话可能正被 grok 占用）：${vars.message}`,
    failedSimple: '搬移失败',
    done: '已移动到新工作目录'
  },
  /** 渲染层 actions.ts 的 appendNotice 用户可见提示 */
  notices: {
    permSwitchFailed: (vars: { message: string }) => `切换权限模式失败：${vars.message}`,
    alreadyAtCwd: (vars: { dir: string }) => `当前会话已经以 ${vars.dir} 为工作目录。`,
    switchedCwd: (vars: { dir: string }) => `已切换到工作目录 ${vars.dir}。`,
    resumeFailed: (vars: { message: string }) => `恢复会话失败：${vars.message}`,
    resumeGone:
      '会话的磁盘数据已不存在（多半已被删除或移动过），无法恢复。可在侧栏删除这条记录，避免反复点开报错。',
    createFailed: (vars: { message: string }) => `创建会话失败：${vars.message}`,
    requestFailed: (vars: { message: string }) => `请求失败：${vars.message}`,
    configSwitchFailed: (vars: { id: string; message: string }) =>
      `切换 ${vars.id} 失败：${vars.message}`
  },
  grokCli: {
    binaryMissing: '未找到 grok 可执行文件。请确认已安装 Grok Build，或设置环境变量 GROK_BIN。',
    operationFailed: '操作失败',
    commandFailed: (vars: { command: string }) => `grok ${vars.command} 执行失败`,
    pluginUnnamed: '(未命名)',
    pluginSourceRequired: '请填写插件来源（git 地址、user/repo 或本地路径）。',
    marketplaceSourceRequired: '请填写市场源（git 地址、user/repo 或本地路径）。',
    marketplaceAdded: '已添加市场源。',
    marketplaceRemoved: '已移除市场源。',
    marketplaceUpdated: '市场源已刷新。',
    noOutput: '（无输出）',
    updateNoOutput:
      '更新命令已结束但没有输出。若版本号没变，多半是下载未完成或替换失败，可关闭所有 grok 进程后在终端重试 `grok update`。',
    updateFailedHint: (vars: { message: string }) =>
      vars.message +
      '\n\n提示：更新需要替换 ~/.grok/bin/grok.exe。请确认没有其它 grok 进程（终端里的 grok TUI、grok agent 等）在运行；' +
      '桌面端已会自动停止自己拉起的 agent。也可以关闭客户端后在终端执行 `grok update`。',
    memoryCleared: '记忆已清空。',
    worktreeNoPath: 'grok 未返回 worktree 路径',
    worktreeRemoved: '已删除 worktree。',
    loginFinished: '登录流程已结束。',
    loginTimeout: '登录等待超时（5 分钟内未完成浏览器授权）。请重试，或在终端执行 grok login。',
    logoutFailed: '退出登录失败',
    serverNameRequired: '服务器名称不能为空。',
    remoteUrlRequired: '远程 MCP 服务器需要填写连接地址（URL）。',
    stdioCommandRequired: 'stdio 服务器需要填写启动命令。',
    diagDoneNoOutput: '诊断完成，无输出。'
  },
  exportMarkdown: {
    dialogTitle: '导出会话为 Markdown',
    nothingToExport: '该会话在磁盘上没有可导出的内容（可能尚未落盘）。',
    metaSessionId: (vars: { id: string }) => `- 会话 ID：${vars.id}`,
    metaCwd: (vars: { cwd: string }) => `- 工作目录：${vars.cwd}`,
    roleMe: '我',
    footerLocal: (vars: { at: string }) => `导出于 ${vars.at}（客户端兜底渲染，非 grok export 原样输出）`
  },
  longShot: {
    dialogTitle: '保存会话长截屏',
    windowUnavailable: '窗口不可用'
  },
  /** acp/service.ts 冒泡到连接状态与 prompt 错误的用户可见串 */
  service: {
    binaryMissingShort: '未找到 grok 可执行文件',
    starting: (vars: { binary: string }) => `正在启动 ${vars.binary}`,
    exited: (vars: { code: string }) => `agent 进程已退出（code=${vars.code}）`,
    ready: 'agent 已就绪',
    stopped: '已停止',
    emptyContent: '消息内容为空',
    requestTimeout: (vars: { method: string }) => `请求超时：${vars.method}`,
    alreadyRunning: 'agent 客户端已在运行',
    agentNotReady: 'agent 进程未就绪，无法发送请求',
    methodFailed: (vars: { method: string; detail: string }) => `${vars.method} 失败：${vars.detail}`
  },
  /** proxy.ts 代理/端点探测的 detail（嵌进诊断面板 detail 显示） */
  proxy: {
    unparsable: (vars: { url: string }) => `无法解析代理地址：${vars.url}`,
    reachable: (vars: { addr: string }) => `${vars.addr} 可连接`,
    unreachable: (vars: { addr: string }) => `${vars.addr} 无法连接`,
    timeout: '连接超时'
  },
  /** billing.ts 额度读取失败原因（AccountMenu 额度行显示） */
  billing: {
    notLoggedIn: '未登录',
    unavailable: '额度信息不可用'
  }
}
