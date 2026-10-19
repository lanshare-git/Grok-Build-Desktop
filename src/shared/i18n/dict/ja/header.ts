import type { header as zh } from '../zh-cn/header'

export const header: typeof zh = {
  newTaskTitle: '新規タスク（作業ディレクトリを選択）',
  renameInputTitle:
    'そのまま編集できます。空欄または元のタイトルに戻すと、grok の自動タイトルに追従します',
  titleRename: (vars: { title: string }) => `${vars.title}\n（ダブルクリックで改名）`,
  titleRenameWithOriginal: (vars: { title: string; original: string }) =>
    `${vars.title}\n（ダブルクリックで改名。元の名前：${vars.original}）`,
  titleLockedChatSuffix:
    '\nチャットセッション：ホームディレクトリ固定・プロジェクト非紐付けのため、読み取り専用にロックされています（ファイル書き込み不可）',
  titleMovedChatSuffix:
    '\nチャットから移動したタスク：プロジェクトに紐付け済み。通常タスクと同様に権限モードを選べます',
  pathTitleLocked:
    'チャットセッションはホームディレクトリ固定でディレクトリを切り替えられません。別の作業ディレクトリを使うには通常タスクを新規作成してください',
  pathTitleChat: (vars: { cwd: string }) =>
    `現在の作業ディレクトリ：${vars.cwd}\nクリックで既存のワークスペースから切り替えるか、別のディレクトリを開けます。切り替え後は「新規」タスクが作成され、現在のセッションは変わりません`,
  pathTitleTask: (vars: { cwd: string }) =>
    `現在の作業ディレクトリ：${vars.cwd}\nクリックで既存のワークスペースから切り替えるか、別のディレクトリを開けます。切り替え後は「新規」タスクが作成され、現在のセッションは変わりません\nこのセッション自身のディレクトリを変えるには：左側セッション行の「☰」メニューから「作業ディレクトリへ移動」を選択（生成中のセッションは移動できません）`,
  model: 'モデル',
  effort: '推論の強度',
  modeTitleLocked: 'チャットセッションは読み取り専用（プランモード）にロックされており、変更できません',
  modeTitleChat: 'このセッションはチャットから移動されました。通常タスクと同様に権限モードを切り替えられます',
  modeTitle: (vars: { desc: string }) => `権限モード · ${vars.desc}`,
  usageTitle: (vars: { input: number; output: number; cacheRead: number }) =>
    `前回：入力 ${vars.input} · 出力 ${vars.output} · キャッシュ読み取り ${vars.cacheRead}\nクリックでこのセッションのターン別明細と全セッションの累計を表示`,
  usageTitleEmpty: '使用量：クリックでこのセッションのターン別明細と全セッションの累計を表示'
}
