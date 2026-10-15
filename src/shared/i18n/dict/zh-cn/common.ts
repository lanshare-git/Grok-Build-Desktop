export const common = {
  ok: '确定',
  cancel: '取消',
  close: '关闭',
  save: '保存',
  delete: '删除',
  rename: '重命名',
  retry: '重试',
  copy: '复制',
  copied: '已复制',
  loading: '加载中…',
  followSystem: '跟随系统',
  untitledSession: '未命名会话',
  chatGroup: '聊天',
  bridgeMissingTitle: '无法加载应用桥接层',
  bridgeMissingBody:
    'preload 脚本未能注入，渲染进程拿不到主进程能力。请重启应用；若持续出现，请检查构建产物是否完整。',
  connErrorTitle: 'Agent 连接异常',
  connErrorText: '与 Grok Build 进程的连接已中断',
  connStoppedTitle: 'Agent 已停止',
  connStoppedText: '后台进程已退出，需要重新连接才能继续',
  backgroundTask: '后台任务',
  promptPermTitle: '任务需要授权',
  promptQuestionTitle: '任务正在提问',
  promptPermText: (vars: { name: string; label: string }) => `「${vars.name}」请求执行：${vars.label}`,
  promptQuestionText: (vars: { name: string }) => `「${vars.name}」需要你的选择才能继续`,
  time: {
    justNow: '刚刚'
  }
}
