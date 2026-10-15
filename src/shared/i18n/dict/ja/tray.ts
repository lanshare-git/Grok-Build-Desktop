import type { tray as zh } from '../zh-cn/tray'

export const tray: typeof zh = {
  state: {
    ready: '接続済み',
    starting: '接続中',
    idle: '未接続',
    stopped: '切断',
    error: '接続エラー'
  },
  statusLine: (vars) => `接続状態：${vars.state}`,
  showWindow: 'メインウィンドウを表示',
  quit: '終了',
  startingTip: 'Grok Build Desktop を起動中…',
  balloon: 'アプリはシステムトレイに最小化されました。トレイアイコンをクリックで再表示します。'
}
