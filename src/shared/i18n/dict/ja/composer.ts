import type { composer as zh } from '../zh-cn/composer'

export const composer: typeof zh = {
  placeholder: 'タスクを入力するか、スクリーンショットを貼って質問…（Enter で送信、Shift+Enter で改行）',
  send: '送信',
  stop: '現在のターンを中断',
  toolMenuTitle: '画像の追加・スクリーンショット撮影、または worktree で新規タスク',
  uploadImage: '画像をアップロード',
  uploadImageDesc: '送信前に入力欄の上でプレビューできます',
  screenshot: 'スクリーンショットで質問',
  screenshotDesc: '切り取り後、入力欄で Ctrl+V で貼り付け',
  worktreeMenu: 'worktree で新規タスク',
  worktreeMenuDesc: '独立したコードコピー · grok -w と同等',
  removeAttachment: '削除',
  imageFallback: '画像',
  clipboardImage: 'クリップボード画像',
  duration: '長さ',
  ratio: 'アスペクト比',
  resolution: '解像度',
  model: 'モデル',
  includeParams:
    '送信時にパラメータを付与（オフの場合はプロンプトのみ送信。パラメータは入力欄に追記してください）',
  seedWorktreeDesc:
    '独立した git worktree コピーで新規タスクを作成（ターミナルの grok -w と同等）。メインリポジトリとは干渉しません',
  worktreeConfirmTitle: 'worktree で新規タスクを作成しますか？',
  worktreeConfirmPre: '',
  worktreeConfirmPost: ' を基に独立した git worktree を作成し、その中で新しいタスクを開始します。',
  worktreeConfirmDetail:
    'メインリポジトリの変更とは干渉しません（worktree 名は grok が自動生成）。対象ディレクトリは git リポジトリである必要があります。一覧とクリーンアップは「設定 → Worktree」で行えます。',
  worktreeConfirmOk: '作成して開始',
  worktreeCreated: (vars: { path: string }) => `worktree で新規タスクを作成しました：${vars.path}`,
  worktreeFailed: (vars: { message?: string }) =>
    `worktree の作成に失敗しました：${vars.message || '不明なエラー'}`,
  queueSendTitle: '案内を送信（現在のターン終了後；すぐ止めるなら入力を消して ■）',
  queuedHint: '予約済み：現在のターン終了後に自動送信（すぐ止めるなら入力を消すと ■ に戻ります）'
}
