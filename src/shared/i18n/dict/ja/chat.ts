import type { chat as zh } from '../zh-cn/chat'

export const chat: typeof zh = {
  newChat: '新しいチャット',
  newTask: '新しいタスク',
  preparingMedia: 'メディアを準備中…',
  imageFallback: '画像',
  imageZoomOpen: 'クリックして拡大',
  imageZoomIn: '拡大',
  imageZoomOut: '縮小',
  imageZoomReset: 'ウィンドウに合わせる',
  imageZoomClose: '閉じる',
  imageZoomHint: 'スクロールで拡大縮小 · ドラッグで移動 · ダブルクリックでフィット/原寸 · 余白クリックまたは Esc で閉じる',
  edit: '編集',
  editHint: '編集するとここから会話がやり直されます。既存の成果物は削除されません',
  readyLine1: 'セッションの準備ができました。やりたいことを入力してください。',
  readyLine2:
    'Agent はファイルの読み書き、コマンド実行、コード検索ができます。ターミナル版 Grok Build と同等の能力です。',
  agentWorking: 'Agent が作業中…',
  historyTrimmed: (vars: { n: number; max: number }) =>
    `会話が長いため、古いツール/思考 ${vars.n} 件を折りたたみました（表示上限約 ${vars.max}）。あなたのメッセージは残します。`,
  turnIdleCancelled:
    '5 分以上出力がないため、このターンを自動終了しました。続けてメッセージを送るか、■ で停止して再試行してください。',
  longShotPickHint: '起点にするメッセージをクリックすると、末尾まで長截図します',
  longShotFromTop: '現在の上端から',
  longShotFromStart: '会話の先頭から',
  longShotCancel: 'キャンセル',
  longShotCapturing: '長截図を作成中…',
  longShotDone: (vars: { path?: string }) =>
    vars.path
      ? `長截図をクリップボードにコピーし、${vars.path} に保存しました`
      : '長截図をクリップボードにコピーしました',
  longShotDoneClipboardOnly: '長截図をクリップボードにコピーしました（ファイルは未保存）',
  longShotFailed: (vars: { message: string }) => `長截図に失敗しました：${vars.message}`,
  longShotTruncated: '内容が長すぎるため、起点から約 16000px までを截図しました',
  longShotNoContent: '截図できる内容がありません',
  longShotNoCanvas: 'キャンバスを作成できません'
}
