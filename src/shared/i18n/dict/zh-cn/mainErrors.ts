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
    failed: (vars: { message: string }) => `搬移失败（该会话可能正被 grok 占用）：${vars.message}`
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
    loginTimeout: '登录等待超时（5 分钟内未完成浏览器授权）。请重试，或在终端执行 grok login。'
  },
  exportMarkdown: {
    dialogTitle: '导出会话为 Markdown'
  }
}
