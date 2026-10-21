import type { mainErrors as zh } from '../zh-cn/mainErrors'

export const mainErrors: typeof zh = {
  sessionDelete: {
    missingCwd: 'セッションに作業ディレクトリがありません',
    invalidId: 'セッション ID が不正なため、削除を拒否しました',
    dataRemain: (vars) =>
      `削除に失敗しました（セッションが grok に使用中の可能性があります）：元のディレクトリにセッションデータが残っています。データのコピーはアプリ内ごみ箱に保存済みです：${vars.path}`,
    failed: (vars) => `削除に失敗しました（セッションが grok に使用中の可能性があります）：${vars.message}`
  },
  sessionMove: {
    invalidId: 'セッション ID が不正なため、移動を拒否しました',
    missingCwd: '作業ディレクトリがありません',
    sameDir: 'すでに目的の作業ディレクトリにあります',
    targetNotDir: (vars) => `移動先がフォルダーではありません：${vars.path}`,
    targetMissing: (vars) => `移動先のディレクトリが存在しません：${vars.path}`,
    notFound: 'ディスク上にこのセッションのディレクトリが見つかりません（下書きセッション、または削除済み）',
    outOfBounds: '移動先パスが範囲外のため、移動を拒否しました',
    collision: (vars) =>
      `移動先に同名のセッションディレクトリが既に存在するため、上書きしませんでした：${vars.path}`,
    failed: (vars) => `移動に失敗しました（セッションが grok に使用中の可能性があります）：${vars.message}`,
    failedSimple: '移動に失敗しました',
    done: '新しい作業ディレクトリに移動しました'
  },
  /** レンダラー actions.ts の appendNotice によるユーザー向け通知 */
  notices: {
    permSwitchFailed: (vars) => `権限モードの切り替えに失敗しました：${vars.message}`,
    alreadyAtCwd: (vars) => `このセッションは既に ${vars.dir} を作業ディレクトリとしています。`,
    switchedCwd: (vars) => `作業ディレクトリを ${vars.dir} に切り替えました。`,
    resumeFailed: (vars) => `セッションの復元に失敗しました：${vars.message}`,
    resumeGone:
      'セッションのディスク上のデータが存在しません（削除または移動された可能性が高いです）。復元できません。繰り返しエラーが出るのを避けるため、サイドバーからこの項目を削除できます。',
    createFailed: (vars) => `セッションの作成に失敗しました：${vars.message}`,
    requestFailed: (vars) => `リクエストに失敗しました：${vars.message}`,
    configSwitchFailed: (vars) => `${vars.id} の切り替えに失敗しました：${vars.message}`
  },
  grokCli: {
    binaryMissing:
      'grok 実行ファイルが見つかりません。Grok Build がインストール済みか確認するか、環境変数 GROK_BIN を設定してください。',
    operationFailed: '操作に失敗しました',
    commandFailed: (vars) => `grok ${vars.command} の実行に失敗しました`,
    pluginUnnamed: '（無名）',
    pluginSourceRequired: 'プラグインのソース（git URL、user/repo、ローカルパス）を入力してください。',
    marketplaceSourceRequired: 'マーケットプレイスのソース（git URL、user/repo、ローカルパス）を入力してください。',
    marketplaceAdded: 'マーケットプレイスのソースを追加しました。',
    marketplaceRemoved: 'マーケットプレイスのソースを削除しました。',
    marketplaceUpdated: 'マーケットプレイスのソースを更新しました。',
    noOutput: '（出力なし）',
    updateNoOutput:
      '更新コマンドは終了しましたが出力がありません。バージョン番号が変わっていない場合、ダウンロード未完了または置き換え失敗の可能性が高いです。すべての grok プロセスを閉じてからターミナルで `grok update` を再試行してください。',
    updateFailedHint: (vars) =>
      vars.message +
      '\n\nヒント：更新には ~/.grok/bin/grok.exe の置き換えが必要です。他の grok プロセス（ターミナルの grok TUI、grok agent など）が動いていないか確認してください。' +
      'デスクトップ版は自身が起動した agent を自動で停止します。クライアントを終了してターミナルで `grok update` を実行することもできます。',
    memoryCleared: 'メモリをクリアしました。',
    worktreeNoPath: 'grok が worktree パスを返しませんでした',
    worktreeRemoved: 'worktree を削除しました。',
    loginFinished: 'ログインフローが終了しました。',
    loginTimeout:
      'ログイン待機がタイムアウトしました（5 分以内にブラウザ認可が完了しませんでした）。再試行するか、ターミナルで grok login を実行してください。',
    logoutFailed: 'ログアウトに失敗しました',
    serverNameRequired: 'サーバー名を入力してください。',
    remoteUrlRequired: 'リモート MCP サーバーには接続 URL が必要です。',
    stdioCommandRequired: 'stdio サーバーには起動コマンドが必要です。',
    diagDoneNoOutput: '診断が完了しました（出力なし）。'
  },
  exportMarkdown: {
    dialogTitle: 'セッションを Markdown としてエクスポート',
    nothingToExport: 'このセッションにはディスク上にエクスポート可能な内容がありません（まだ保存されていない可能性があります）。',
    metaSessionId: (vars) => `- セッション ID：${vars.id}`,
    metaCwd: (vars) => `- 作業ディレクトリ：${vars.cwd}`,
    roleMe: '自分',
    footerLocal: (vars) =>
      `${vars.at} にエクスポート（デスクトップクライアントによるフォールバック描画、grok export の生出力ではありません）`
  },
  longShot: {
    dialogTitle: 'セッション長截図を保存',
    windowUnavailable: 'ウィンドウが利用できません'
  },
  /** acp/service.ts から接続状態・prompt エラーとしてユーザーに見える文字列 */
  service: {
    binaryMissingShort: 'grok 実行ファイルが見つかりません',
    starting: (vars) => `起動中：${vars.binary}`,
    exited: (vars) => `agent プロセスが終了しました（code=${vars.code}）`,
    ready: 'agent が準備完了',
    stopped: '停止済み',
    emptyContent: 'メッセージ内容が空です',
    requestTimeout: (vars) => `リクエストがタイムアウトしました：${vars.method}`,
    alreadyRunning: 'agent クライアントはすでに実行中です',
    agentNotReady: 'agent プロセスが準備できていないため、リクエストを送信できません',
    methodFailed: (vars) => `${vars.method} に失敗しました：${vars.detail}`
  },
  /** proxy.ts のプロキシ/エンドポイント疎通確認 detail（診断パネルの detail に埋め込まれる） */
  proxy: {
    unparsable: (vars) => `プロキシアドレスを解析できません：${vars.url}`,
    reachable: (vars) => `${vars.addr} に接続できます`,
    unreachable: (vars) => `${vars.addr} に接続できません`,
    timeout: '接続がタイムアウトしました'
  },
  /** billing.ts の残高取得失敗理由（AccountMenu の残高行に表示） */
  billing: {
    notLoggedIn: '未ログイン',
    unavailable: '残高情報を取得できません'
  }
}
