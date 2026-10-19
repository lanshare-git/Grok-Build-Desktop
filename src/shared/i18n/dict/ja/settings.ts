import type { settings as zh } from '../zh-cn/settings'

export const settings: typeof zh = {
  title: '設定',
  close: '閉じる (Esc)',
  nav: {
    general: '一般',
    account: 'アカウント',
    usage: '使用量',
    mcp: 'MCP サービス',
    plugins: 'プラグイン',
    disk: 'ストレージ使用量',
    worktree: 'Worktree',
    version: 'バージョンと更新',
    diagnostics: '環境診断',
    about: 'について'
  },
  general: {
    title: '一般',
    subtitle: 'アプリの基本動作',
    language: {
      title: '言語 / Language',
      desc: '表示言語。既定はシステムに従う'
    },
    closeAction: {
      title: '閉じるとき',
      desc: 'ウィンドウ右上の閉じるボタンを押したときの動作',
      tray: 'トレイに最小化',
      quit: '終了する',
      ask: '毎回確認する',
      hint: '「毎回確認する」を選ぶと、次回閉じるときに再度確認ダイアログが表示されます。それ以外は選択が記憶されます。'
    },
    purge: {
      title: 'セッション削除時',
      desc: 'ディスク上のファイルも既定で一緒に削除するか',
      on: '既定でオン',
      off: '既定でオフ',
      hint: '削除確認ダイアログの「ディスク上のセッションファイルも削除」チェックに対応します。オンにするとセッションのディスクデータも削除されます（まずシステムのごみ箱へ、使えない場合はアプリ内ごみ箱へ移動し、復元可能）。オフの場合は一覧からの削除のみで、ディスクも消すにはダイアログで自分でオンにしてください。'
    },
    desktopPermToast: {
      title: '右下の承認トースト',
      desc: '他セッションやウィンドウが非前面のときに、許可/拒否できるデスクトップトーストを出すか',
      on: 'オン',
      off: 'オフ',
      hint: 'オフにするとセッション内パネルとサイドバーの色点のみ。ここ、またはトースト下部から再度オンにできます。',
      disableFromToast: 'この通知をオフにする'
    },
    density: {
      title: 'ツール呼び出しの表示密度',
      desc: 'チャット内のツール呼び出しカードの既定の展開具合を制御します。ターミナルの /density と同じ設定（~/.grok/config.toml の ui.tool_call_density）を共有し、ここでの変更はターミナルの次回起動時に反映されます。',
      aria: 'ツール呼び出しの表示密度',
      writeFail: '~/.grok/config.toml への書き込みに失敗しました。今回はこのウィンドウのみに適用されます。',
      hint: '切り替えは現在のセッションに即時反映されます。手動で展開/折りたたみしたツールカードはその状態を保持します。'
    }
  },
  account: {
    title: 'アカウント',
    subtitle: 'デスクトップ版はターミナル版 Grok と同じログイン状態（~/.grok/auth.json）を共有します。ログアウトするとターミナル版の資格情報も削除されます。',
    current: '現在のアカウント',
    currentDesc: 'ログイン中のメールアドレスと名前',
    currentEmptyDesc: '未ログイン、またはログインの有効期限が切れています',
    notLoggedIn: '未ログイン',
    team: 'チーム',
    teamDesc: '現在のアカウントが所属するチーム識別子',
    authMode: '認証方式',
    authModeDesc: 'ログイン時に使用した認証タイプ',
    login: 'ログイン',
    loggingIn: 'ログイン中…',
    loginHint: 'ブラウザが開き、デバイスコード認証を行います。完了後、デスクトップ版とターミナル版は同じログイン状態を共有します。',
    logout: 'ログアウト',
    loggingOut: 'ログアウト中…',
    loginFailed: (vars) => `ログイン失敗：${vars.message}`,
    logoutHint: 'ログアウトするとローカルにキャッシュされた資格情報を削除し、agent を再起動します。再度利用するにはこのページから再ログインしてください。'
  }
}
