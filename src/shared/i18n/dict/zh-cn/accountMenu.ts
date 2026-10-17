export const accountMenu = {
  conn: {
    idle: '未连接',
    starting: '启动中',
    ready: '已就绪',
    error: '连接失败',
    stopped: '已停止'
  },
  quota: {
    weekly: '每周用量',
    period: '本周期用量',
    fallback: '用量额度',
    used: (vars: { percent: string }) => `已用 ${vars.percent}%`,
    unavailable: '额度暂不可用',
    unknown: '额度未知',
    tooltip: (vars: { period: string; start: string; end: string; remaining: number }) =>
      `${vars.period}：${vars.start} 至 ${vars.end}\n剩余 ${vars.remaining}%\n点击打开「设置 → 用量」`,
    tooltipUnavailable: (vars: { error: string }) => `${vars.error}\n点击打开「设置 → 用量」`,
    tooltipErrorDefault: '额度信息不可用'
  },
  versionUnknown: '版本未知',
  notLoggedIn: '未登录',
  settings: '设置',
  language: '语言',
  login: '登录',
  logout: '退出登录',
  loggingOut: '退出中…'
}
