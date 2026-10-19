export const sidebar = {
  newTask: '新建任务',
  newChatLongTitle: '以主目录为根、不绑定任何项目，且锁定为只读（不写文件）开一段随聊随用的会话',
  searchPlaceholder: '搜索会话（标题与对话内容）',
  clearSearch: '清空搜索',
  searchHits: (vars: { n: number }) =>
    `命中 ${vars.n} 个会话${vars.n === 0 ? '，试试更短的关键词' : ''}`,
  workspacesLabel: '工作目录',
  noSessions: '还没有会话',
  noChats: '还没有聊天',
  newHere: '在此新建',
  homeGroupTitle: (vars: { path: string }) =>
    `聊天：固定以你的主目录为根，不绑定任何项目\n${vars.path}\n点击可折叠 / 展开`,
  groupTitle: (vars: { path: string; alias: string }) =>
    vars.alias ? `${vars.path}　别名：${vars.alias}` : vars.path,
  newChatReadonly: '新建聊天（以主目录为根、只读）',
  newTaskInDir: (vars: { path: string }) => `在 ${vars.path} 新建任务`,
  newWorktreeInDir: (vars: { path: string }) =>
    `在 ${vars.path} 的 git worktree 里新建任务（独立代码副本，等价终端 grok -w）`,
  renameAlias: '改别名（双击名字也行）',
  removeFromList: '从工作目录列表移除',
  statusRunning: '正在生成',
  statusPending: '需要你响应',
  statusUnread: '已完成（未读）',
  statusDone: '空闲',
  tagRunning: '生成中',
  tagPending: '待响应',
  tagUnread: '未读',
  renameInputTitle: '直接编辑；留空或改回原标题，则恢复跟随 grok 的自动标题',
  sessionTitleCustom: (vars: { title: string; original: string }) =>
    `${vars.title}\n（双击改名；原名：${vars.original}）`,
  sessionTitleAuto: (vars: { title: string }) => `${vars.title}\n（双击改名）`,
  renameSession: '重命名（双击标题也行）',
  moreActions: '更多（导出 / 卸载 / 删除）',
  deleteSession: '删除会话',
  unknownError: '未知错误',

  /** 悬停会话行时浮出的详情卡 */
  preview: {
    fileLabel: '会话文件',
    notPersisted: '未落盘（首次发送后创建）',
    copyPathTitle: (vars: { path: string }) => `${vars.path}\n点击复制完整路径`,
    openInExplorer: '在资源管理器中打开所在文件夹',
    open: '打开',
    originalTitle: (vars: { title: string }) => `grok 原标题：${vars.title}`
  },

  /** 侧栏底部的即时提示（ws-hint） */
  flash: {
    workspaceRemoved: (vars: { path: string }) => `已移除工作目录 ${vars.path}`,
    sessionRunning: '该会话正在生成中，等这一轮结束再移动',
    sessionRunningDrag: '该会话正在生成中，等这一轮结束（或先停止生成）再移动',
    removedFromList: (vars: { title: string }) => `已从列表移除会话「${vars.title}」，磁盘记录保留`,
    deletedWithShellLeft: (vars: { title: string }) =>
      `已删除会话「${vars.title}」（原目录残留空壳，不影响使用）`,
    deletedToQuarantine: (vars: { title: string }) =>
      `已删除会话「${vars.title}」（已移入应用内回收站）`,
    deletedFully: (vars: { title: string }) =>
      `已删除会话「${vars.title}」及其磁盘文件（可在系统回收站还原）`,
    worktreeCreated: (vars: { path: string }) => `已在 worktree 中新建任务：${vars.path}`,
    worktreeFailed: (vars: { message: string }) => `创建 worktree 失败：${vars.message}`,
    moved: (vars: { title: string; label: string }) => `已把「${vars.title}」移动到 ${vars.label}`,
    moveFailed: (vars: { message: string }) => `移动失败：${vars.message}`
  },

  /** 各类二次确认弹窗（message 里的 <strong> 用前后片段拼，变量落在分界处） */
  confirm: {
    blockedTitle: '无法移除这个工作目录',
    blockedMsgA: '「',
    blockedMsgB: (vars: { n: number }) =>
      `」下还有 ${vars.n} 个会话，只要这些会话还在，这个目录就会一直出现在列表里。`,
    blockedDetailA: '会话的工作目录在 ',
    blockedDetailB:
      ' 时由 grok 确定，之后无法更改。要让它消失，请先删除该目录下的所有会话（删除会话前会再确认一次）。',
    gotIt: '知道了',
    removeTitle: '移除工作目录？',
    removeMsgA: '将把 ',
    removeMsgB: ' 从工作目录列表移除。',
    removeDetailAliased: (vars: { label: string; path: string }) =>
      `只是取消登记（含别名「${vars.label}」），磁盘上的 ${vars.path} 不受影响；之后在该目录新建任务时会自动重新出现。`,
    removeDetail: (vars: { path: string }) =>
      `只是取消登记，磁盘上的 ${vars.path} 不受影响；之后在该目录新建任务时会自动重新出现。`,
    remove: '移除',
    deleteTitlePurge: '删除会话及其磁盘文件？',
    deleteTitle: '删除会话？',
    deleteMsgA: '即将删除会话 ',
    deleteMsgB: (vars: { n: number }) => (vars.n > 0 ? `（${vars.n} 条记录）。` : '。'),
    deleteWarnRunning: '该会话正在生成中，删除会中断当前这一轮。',
    deleteWarnActive: '它是当前打开的会话，删除后会自动切到另一个会话。',
    deleteDraftNote: '这是尚未落盘的草稿会话，磁盘上没有对应文件。',
    purgeOption: '同时删除磁盘上的会话文件',
    purgeHint:
      '把 ~/.grok/sessions 下该会话的目录移入系统回收站（可还原）；系统回收站不可用时移入应用内回收站。取消勾选则仅从应用列表移除，磁盘记录保留。',
    deleteConfirmPurge: '删除会话和文件',
    deleteConfirmList: '从列表移除',
    deleteFailedTitle: '磁盘文件没能删掉',
    deleteFailedMsgA: '会话 ',
    deleteFailedMsgB: ' 的磁盘文件仍然存在。',
    deleteFailedDetail:
      '多半是 grok 正在使用这个会话（文件被占用）。可以等它跑完再重试，或者这次只把它从应用列表移除 —— 磁盘记录会保留，下次启动仍可能出现在列表里。',
    deleteFailedConfirm: '仅从列表移除',
    deleteFailedCancel: '先不删',
    worktreeTitle: '在 worktree 中新建任务？',
    worktreeMsgA: '将基于 ',
    worktreeMsgB: ' 创建一份独立的 git worktree，并在其中开新任务。',
    worktreeDetail:
      '与主仓库的改动互不干扰（worktree 名由 grok 自动生成）。目标目录需要是 git 仓库。清单与清理在「设置 → Worktree」。',
    worktreeConfirm: '创建并新建',
    moveTitle: '移动到其它工作目录？',
    moveMsgA: '把会话 ',
    moveMsgB: ' 移入 ',
    moveMsgC: '。',
    moveDraft: '这是还没落盘的草稿会话，只会改掉它的工作目录。',
    moveDetail:
      '磁盘上的会话记录会连整段历史一起搬过去，之后这个会话就在新目录里跑：工具执行、读写文件、以及 grok 的工作区记忆都以新目录为根。',
    moveChatWarn:
      '这是纯聊天会话（原本锁定只读）。搬进项目目录后它就和普通任务一样了，可以自己切换权限模式；想继续只读，搬完在右上角选回「计划模式」即可。',
    moveActiveNote: '它是当前打开的会话，搬完会自动以新目录重新加载。',
    move: '移动'
  },

  /** 左下角账号入口 */
  account: {
    menuTitle: (vars: { email: string }) => `${vars.email}\n点击打开账号菜单`,
    menuTitleLoggedOut: '未登录 · 点击打开账号菜单',
    loggedIn: '已登录',
    login: '登录'
  }
}
