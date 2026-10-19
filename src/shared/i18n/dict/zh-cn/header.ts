export const header = {
  newTaskTitle: '新建任务（选择工作目录）',
  renameInputTitle: '直接编辑；留空或改回原标题，则恢复跟随 grok 的自动标题',
  titleRename: (vars: { title: string }) => `${vars.title}\n（双击改名）`,
  titleRenameWithOriginal: (vars: { title: string; original: string }) =>
    `${vars.title}\n（双击改名；原名：${vars.original}）`,
  titleLockedChatSuffix: '\n聊天会话：固定以主目录为根、不绑定项目，已锁定为只读（不写文件）',
  titleMovedChatSuffix: '\n由聊天会话搬来的任务：已绑定项目，可按普通任务自选权限模式',
  pathTitleLocked: '聊天会话固定以主目录为根，不可切换目录；要切换工作目录请新建普通任务',
  pathTitleChat: (vars: { cwd: string }) =>
    `当前会话工作目录：${vars.cwd}\n点击可从已有工作空间切换，或打开其他目录；切换后会「新建」一个任务，当前会话保持不变`,
  pathTitleTask: (vars: { cwd: string }) =>
    `当前会话工作目录：${vars.cwd}\n点击可从已有工作空间切换，或打开其他目录；切换后会「新建」一个任务，当前会话保持不变\n要改当前会话自己的目录：在左侧会话行「☰」菜单里选「移动到工作目录」（生成中的会话不能移动）`,
  model: '模型',
  effort: '推理强度',
  modeTitleLocked: '聊天会话已锁定为只读（计划模式），不可更改',
  modeTitleChat: '该会话由聊天搬来，已可按普通任务切换权限模式',
  modeTitle: (vars: { desc: string }) => `权限模式 · ${vars.desc}`,
  usageTitle: (vars: { input: number; output: number; cacheRead: number }) =>
    `上一轮：输入 ${vars.input} · 输出 ${vars.output} · 缓存读 ${vars.cacheRead}\n点击查看本会话逐轮明细与全部会话累计`,
  usageTitleEmpty: '用量：点击查看本会话逐轮明细与全部会话累计'
}
