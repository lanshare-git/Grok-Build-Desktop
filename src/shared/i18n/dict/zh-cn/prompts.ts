export const prompts = {
  perm: {
    badge: '待授权',
    title: '工具执行请求',
    wantPre: 'Agent 想要执行 ',
    wantPost: '',
    fallbackTool: '一个工具',
    reject: '拒绝',
    allowOnce: '允许（仅本次）',
    allowAlways: '允许（不再询问）',
    rejectOnce: '拒绝（仅本次）',
    rejectAlways: '拒绝（不再询问）',
    allowSameBash: '允许，且同类命令不再询问',
    rejectTellGrok: '拒绝，并告诉 Grok 改用别的做法',
    rejectNoAsk: '拒绝，且此命令不再询问',
    allow: '允许本次执行'
  },
  question: {
    badge: '待回答',
    title: 'Agent 提问',
    subtitle: '需要你的选择才能继续',
    customPlaceholder: '或者输入自定义回答…',
    submit: '提交回答',
    cancelLetAgent: '取消（让 Agent 自行决定）'
  },
  toast: {
    reconnect: '重新连接',
    goHandle: '前往处理',
    /** 桌面授权浮窗：可选唤起主窗口 */
    openApp: '打开应用'
  }
}
