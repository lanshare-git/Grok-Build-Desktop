import type { sidebar as zh } from '../zh-cn/sidebar'

export const sidebar: typeof zh = {
  newTask: '新しいタスク',
  newChatLongTitle:
    'ホームディレクトリをルートとし、どのプロジェクトにも紐付けず、読み取り専用（ファイル書き込みなし）で気軽に会話を始めます',
  searchPlaceholder: 'セッションを検索（タイトルと会話内容）',
  clearSearch: '検索をクリア',
  searchHits: (vars: { n: number }) =>
    vars.n === 0
      ? 'セッションが見つかりません。短いキーワードを試してください'
      : `${vars.n} 件のセッションがヒットしました`,
  workspacesLabel: '作業ディレクトリ',
  noSessions: 'まだセッションがありません',
  noChats: 'まだチャットがありません',
  newHere: 'ここで新規作成',
  homeGroupTitle: (vars: { path: string }) =>
    `チャット：常にホームディレクトリをルートとし、どのプロジェクトにも紐付けません\n${vars.path}\nクリックで折りたたみ / 展開`,
  groupTitle: (vars: { path: string; alias: string }) =>
    vars.alias ? `${vars.path}　エイリアス：${vars.alias}` : vars.path,
  newChatReadonly: '新しいチャット（ホームディレクトリをルート、読み取り専用）',
  newTaskInDir: (vars: { path: string }) => `${vars.path} で新しいタスク`,
  newWorktreeInDir: (vars: { path: string }) =>
    `${vars.path} の git worktree で新しいタスク（独立したコードコピー、ターミナルの grok -w と同等）`,
  renameAlias: 'エイリアスを変更（名前のダブルクリックでも可）',
  removeFromList: '作業ディレクトリ一覧から削除',
  statusRunning: '生成中',
  statusPending: '応答が必要です',
  statusDone: '完了',
  tagRunning: '生成中',
  tagPending: '応答待ち',
  renameInputTitle:
    '直接編集できます。空欄または元のタイトルに戻すと、grok の自動タイトルに再び従います',
  sessionTitleCustom: (vars: { title: string; original: string }) =>
    `${vars.title}\n（ダブルクリックで改名。元の名前：${vars.original}）`,
  sessionTitleAuto: (vars: { title: string }) => `${vars.title}\n（ダブルクリックで改名）`,
  renameSession: '名前を変更（タイトルのダブルクリックでも可）',
  moreActions: 'その他（エクスポート / アンロード / 削除）',
  deleteSession: 'セッションを削除',
  unknownError: '不明なエラー',

  preview: {
    fileLabel: 'セッションファイル',
    notPersisted: '未保存（最初の送信後に作成されます）',
    copyPathTitle: (vars: { path: string }) => `${vars.path}\nクリックでフルパスをコピー`,
    openInExplorer: 'エクスプローラーでフォルダーを開く',
    open: '開く',
    originalTitle: (vars: { title: string }) => `grok の元タイトル：${vars.title}`
  },

  flash: {
    workspaceRemoved: (vars: { path: string }) => `作業ディレクトリ ${vars.path} を削除しました`,
    sessionRunning: 'このセッションは生成中です。このラウンドが終わってから移動してください',
    sessionRunningDrag:
      'このセッションは生成中です。このラウンドが終わるまで待つ（または先に生成を停止して）から移動してください',
    removedFromList: (vars: { title: string }) =>
      `セッション「${vars.title}」を一覧から削除しました。ディスク上の記録は残ります`,
    deletedWithShellLeft: (vars: { title: string }) =>
      `セッション「${vars.title}」を削除しました（元の場所に空の殻が残りますが、使用には影響しません）`,
    deletedToQuarantine: (vars: { title: string }) =>
      `セッション「${vars.title}」を削除しました（アプリ内ごみ箱に移動しました）`,
    deletedFully: (vars: { title: string }) =>
      `セッション「${vars.title}」とそのディスクファイルを削除しました（システムのごみ箱から復元できます）`,
    worktreeCreated: (vars: { path: string }) => `worktree で新しいタスクを作成しました：${vars.path}`,
    worktreeFailed: (vars: { message: string }) => `worktree の作成に失敗しました：${vars.message}`,
    moved: (vars: { title: string; label: string }) => `「${vars.title}」を ${vars.label} に移動しました`,
    moveFailed: (vars: { message: string }) => `移動に失敗しました：${vars.message}`
  },

  confirm: {
    blockedTitle: 'この作業ディレクトリは削除できません',
    blockedMsgA: '「',
    blockedMsgB: (vars: { n: number }) =>
      `」の下にはまだ ${vars.n} 件のセッションがあります。これらが残っている限り、このディレクトリは一覧に表示され続けます。`,
    blockedDetailA: 'セッションの作業ディレクトリは ',
    blockedDetailB:
      ' 時に grok によって決定され、後から変更できません。一覧から消すには、そのディレクトリ配下のセッションをすべて先に削除してください（削除前に再度確認があります）。',
    gotIt: '了解',
    removeTitle: '作業ディレクトリを削除しますか？',
    removeMsgA: '',
    removeMsgB: ' を作業ディレクトリ一覧から削除します。',
    removeDetailAliased: (vars: { label: string; path: string }) =>
      `登録を解除するだけです（エイリアス「${vars.label}」を含む）。ディスク上の ${vars.path} には影響しません。このディレクトリで新しいタスクを作成すると自動的に再表示されます。`,
    removeDetail: (vars: { path: string }) =>
      `登録を解除するだけです。ディスク上の ${vars.path} には影響しません。このディレクトリで新しいタスクを作成すると自動的に再表示されます。`,
    remove: '削除',
    deleteTitlePurge: 'セッションとそのディスクファイルを削除しますか？',
    deleteTitle: 'セッションを削除しますか？',
    deleteMsgA: 'セッション ',
    deleteMsgB: (vars: { n: number }) =>
      vars.n > 0 ? `（${vars.n} 件の記録）を削除します。` : ' を削除します。',
    deleteWarnRunning: 'このセッションは生成中です。削除すると現在のラウンドが中断されます。',
    deleteWarnActive: '現在開いているセッションです。削除後は自動的に別のセッションに切り替わります。',
    deleteDraftNote: 'これはまだ保存されていない下書きセッションで、ディスク上に対応するファイルはありません。',
    purgeOption: 'ディスク上のセッションファイルも削除する',
    purgeHint:
      '~/.grok/sessions 配下のこのセッションのディレクトリをシステムのごみ箱に移します（復元可能）。システムのごみ箱が使えない場合はアプリ内ごみ箱に移します。チェックを外すとアプリの一覧から削除するだけで、ディスク上の記録は残ります。',
    deleteConfirmPurge: 'セッションとファイルを削除',
    deleteConfirmList: '一覧から削除',
    deleteFailedTitle: 'ディスクファイルを削除できませんでした',
    deleteFailedMsgA: 'セッション ',
    deleteFailedMsgB: ' のディスク上のファイルは残っています。',
    deleteFailedDetail:
      '多くの場合、grok がこのセッションを使用中です（ファイルがロックされています）。完了を待って再試行するか、今回はアプリの一覧から削除するだけにすることもできます。その場合、ディスク上の記録は残り、次回起動時に一覧に再表示される可能性があります。',
    deleteFailedConfirm: '一覧からのみ削除',
    deleteFailedCancel: '削除しない',
    worktreeTitle: 'worktree で新しいタスクを作成しますか？',
    worktreeMsgA: '',
    worktreeMsgB: ' を基に独立した git worktree を作成し、その中で新しいタスクを開始します。',
    worktreeDetail:
      'メインリポジトリの変更とは互いに干渉しません（worktree 名は grok が自動生成します）。対象ディレクトリは git リポジトリである必要があります。一覧とクリーンアップは「設定 → Worktree」にあります。',
    worktreeConfirm: '作成して開始',
    moveTitle: '別の作業ディレクトリに移動しますか？',
    moveMsgA: 'セッション ',
    moveMsgB: ' を ',
    moveMsgC: ' に移動します。',
    moveDraft: 'これはまだ保存されていない下書きセッションで、作業ディレクトリのみ変更されます。',
    moveDetail:
      'ディスク上のセッション記録は全履歴ごと移動され、以降このセッションは新しいディレクトリで実行されます。ツール実行、ファイルの読み書き、grok のワークスペースメモリはすべて新しいディレクトリをルートとします。',
    moveChatWarn:
      'これは純粋なチャットセッションです（元は読み取り専用に固定）。プロジェクトディレクトリに移動すると通常のタスクと同じになり、権限モードを自分で切り替えられます。読み取り専用を続けるには、移動後に右上で「計画モード」に戻してください。',
    moveActiveNote: '現在開いているセッションです。移動後に新しいディレクトリで自動的に再読み込みされます。',
    move: '移動'
  },

  account: {
    menuTitle: (vars: { email: string }) => `${vars.email}\nクリックでアカウントメニューを開く`,
    menuTitleLoggedOut: '未ログイン · クリックでアカウントメニューを開く',
    loggedIn: 'ログイン済み',
    login: 'ログイン'
  }
}
