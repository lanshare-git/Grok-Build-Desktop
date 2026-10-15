import type { chat as zh } from '../zh-cn/chat'

export const chat: typeof zh = {
  newChat: '新しいチャット',
  newTask: '新しいタスク',
  preparingMedia: 'メディアを準備中…',
  imageFallback: '画像',
  edit: '編集',
  editHint: '編集するとここから会話がやり直されます。既存の成果物は削除されません',
  readyLine1: 'セッションの準備ができました。やりたいことを入力してください。',
  readyLine2:
    'Agent はファイルの読み書き、コマンド実行、コード検索ができます。ターミナル版 Grok Build と同等の能力です。',
  agentWorking: 'Agent が作業中…'
}
