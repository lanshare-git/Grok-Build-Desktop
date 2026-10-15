export const tray = {
  state: {
    ready: '已连接',
    starting: '连接中',
    idle: '未连接',
    stopped: '已断开',
    error: '连接错误'
  },
  statusLine: (vars: { state: string }) => `连接状态：${vars.state}`,
  showWindow: '显示主窗口',
  quit: '退出',
  startingTip: 'Grok Build Desktop 启动中…',
  balloon: '应用已最小化到系统托盘，点击托盘图标可重新打开。'
}
