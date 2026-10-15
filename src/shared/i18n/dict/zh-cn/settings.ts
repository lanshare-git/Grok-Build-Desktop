export const settings = {
  title: '设置',
  close: '关闭 (Esc)',
  nav: {
    general: '通用',
    account: '账号',
    usage: '用量',
    mcp: 'MCP 服务',
    plugins: '插件',
    disk: '存储占用',
    worktree: 'Worktree',
    version: '版本与更新',
    diagnostics: '环境自检',
    about: '关于'
  },
  general: {
    title: '通用',
    subtitle: '应用的基础行为',
    language: {
      title: '语言 / Language',
      desc: '界面显示语言，默认跟随系统'
    },
    closeAction: {
      title: '关闭时',
      desc: '点击窗口右上角关闭按钮时的行为',
      tray: '隐藏到托盘',
      quit: '直接退出',
      ask: '每次询问',
      hint: '选「每次询问」后，下次点击关闭会再次弹出询问窗口；其余选项会记住你的选择。'
    },
    purge: {
      title: '删除会话时',
      desc: '是否默认连磁盘文件一起删',
      on: '默认勾选',
      off: '默认不勾',
      hint: '对应删除确认弹窗里的「同时删除磁盘上的会话文件」复选框：勾选会一并删掉该会话的磁盘数据（先送系统回收站，不可用时移入应用内回收站，仍可找回）；默认不勾时，弹窗只把会话从列表移除，要连磁盘一起删需在弹窗里自己勾上。'
    },
    density: {
      title: '工具调用展示密度',
      desc: '控制对话里工具调用卡片的默认展开程度。与终端 /density 共用同一份配置（~/.grok/config.toml 的 ui.tool_call_density），这里改完终端下次启动即生效。',
      aria: '工具调用展示密度',
      writeFail: '写入 ~/.grok/config.toml 失败，本次仅对当前窗口生效。',
      hint: '切换后立即在当前会话生效；已经手动展开/收起过的工具卡片会保留你的选择。'
    }
  },
  account: {
    title: '账号',
    subtitle: '桌面端与终端版 Grok 共用同一份登录态（~/.grok/auth.json），退出将同时清掉终端版凭据。',
    current: '当前账号',
    currentDesc: '登录邮箱与姓名',
    currentEmptyDesc: '尚未登录或登录态已失效',
    notLoggedIn: '未登录',
    team: '团队',
    teamDesc: '当前账号所属的团队标识',
    authMode: '鉴权方式',
    authModeDesc: '登录时使用的认证类型',
    logout: '退出登录',
    loggingOut: '退出中…',
    loginFailed: (vars: { message: string }) => `登录失败：${vars.message}`,
    logoutHint: '退出后将清除本地缓存的凭据并重启 agent；如需再次使用，请重新登录（终端执行 grok login）。'
  }
}
