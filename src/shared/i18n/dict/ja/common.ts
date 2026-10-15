import type { common as zh } from '../zh-cn/common'

export const common: typeof zh = {
  ok: 'OK',
  cancel: 'キャンセル',
  close: '閉じる',
  save: '保存',
  delete: '削除',
  rename: '名前を変更',
  retry: '再試行',
  copy: 'コピー',
  copied: 'コピーしました',
  loading: '読み込み中…',
  followSystem: 'システムに従う',
  untitledSession: '無題のセッション',
  chatGroup: 'チャット',
  bridgeMissingTitle: 'アプリブリッジを読み込めません',
  bridgeMissingBody:
    'preload スクリプトを注入できなかったため、レンダラーがメインプロセスの機能にアクセスできません。アプリを再起動してください。解消しない場合はビルド成果物を確認してください。',
  connErrorTitle: 'Agent 接続エラー',
  connErrorText: 'Grok Build プロセスとの接続が切れました',
  connStoppedTitle: 'Agent が停止しました',
  connStoppedText: 'バックグラウンドプロセスが終了しました。続行するには再接続してください',
  backgroundTask: 'バックグラウンドタスク',
  promptPermTitle: 'タスクが承認を求めています',
  promptQuestionTitle: 'タスクが質問しています',
  promptPermText: (vars) => `「${vars.name}」が実行をリクエスト：${vars.label}`,
  promptQuestionText: (vars) => `「${vars.name}」が続行するには選択が必要です`,
  time: {
    justNow: 'たった今'
  }
}
