import type { sessionTools as zh } from '../zh-cn/sessionTools'

export const sessionTools: typeof zh = {
  exportMarkdown: 'Markdown としてエクスポート',
  exporting: 'エクスポート中…',
  longShot: '長截図…',
  longShotTitle: '指定メッセージから末尾まで截図し、クリップボードへコピー（PNG として保存も可）',
  trace: '診断パッケージをエクスポート',
  tracing: 'パッケージ化中…',
  traceTitleDraft: '下書きセッションはまだ保存されていないため、診断パッケージをエクスポートできません',
  traceTitle: '診断データをエクスポート（ローカルにのみ保存、アップロードしません）',
  unload: 'セッションをアンロード（データは保持）',
  unloading: 'アンロード中…',
  unloadTitleRunning: '生成中のためアンロードできません',
  unloadTitleLoaded:
    'agent プロセス内でこのセッションが占有しているメモリを解放します。ディスク上のデータは保持されます（現在のセッションは直ちに再読み込みされます）',
  unloadTitleUnloaded: 'このセッションは現在 agent プロセス内にないため、アンロードの必要はありません',
  moveLabel: '作業ディレクトリに移動',
  moveTitleRunning: '生成中です。このラウンドが終わってから移動してください',
  moveTitle: (vars: { path: string }) =>
    `このセッションのディスク上の記録を ${vars.path} に移動し、以降このディレクトリで実行します`,
  deleteTitle: 'セッションを削除（ディスク上のファイルも削除するか選択できます）',
  delete: 'セッションを削除',
  exported: (vars: { path: string }) => `${vars.path} にエクスポートしました`,
  failed: (vars: { message: string }) => `エクスポートに失敗しました：${vars.message}`,
  traceDone: (vars: { path: string }) => `診断パッケージを作成しました：${vars.path}`,
  unloaded: 'agent からアンロードしました（ディスク上のデータは保持されます）',
  unloadFailed: (vars: { message: string }) => `アンロードに失敗しました：${vars.message}`,
  unknownError: '不明なエラー',

  dir: {
    title: '作業ディレクトリを選択',
    switchTitle: '作業ディレクトリを切り替え',
    empty: '最近使用したディレクトリがありません。別のディレクトリを開いてください',
    browse: '作業ディレクトリを追加…',
    browseOther: '別のディレクトリを開く…',
    current: '現在'
  },

  /** WorkspaceToolsMenu：作業ディレクトリ行の「その他」メニュー */
  workspace: {
    rename: '別名を変更',
    renameTitle: '別名を変更（名前をダブルクリックでも可）',
    remove: 'リストから削除',
    removeTitle: '作業ディレクトリのリストから削除します（ディスク上のデータは影響を受けません）'
  }
}
