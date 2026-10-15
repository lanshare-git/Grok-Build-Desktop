import type { diagChecks as zh } from '../zh-cn/diagChecks'

export const diagChecks: typeof zh = {
  binary: {
    label: 'grok 実行ファイル',
    detailMissing: '見つかりません',
    hintMissing:
      'Grok Build がインストール済みか確認するか、環境変数 GROK_BIN に grok 実行ファイルを指定してください。'
  },
  grokHome: {
    label: '設定ディレクトリ',
    hintMissing:
      'このディレクトリが存在しません。Grok Build が未インストールか未初期化の可能性があります。'
  },
  version: {
    label: 'Grok Build バージョン',
    detailUnknown: '不明'
  },
  auth: {
    label: 'ログイン状態',
    detailMissing: 'auth.json が見つかりません',
    hintMissing:
      'ターミナルで `grok login` を実行してログインしてください。デスクトップ版が自動で引き継ぎます。',
    detailValid: (vars) => `${vars.account}（トークン有効、${vars.expiresAt} まで）`,
    detailExpired: (vars) =>
      `${vars.account}（トークン期限切れ、自動更新されます。${vars.expiresAt} まで）`,
    detailNoAccount: (vars) => `ログイン済み、${vars.expiresAt} まで`,
    hintExpired:
      '期限切れのトークンは grok が refresh_token で自動更新します。失敗した場合はターミナルで再ログインしてください。'
  },
  models: {
    label: '利用可能なモデル',
    detailEmpty: 'モデルキャッシュを読み取れません'
  },
  proxy: {
    label: 'ネットワークプロキシ',
    detail: (vars) => `${vars.proxy}（${vars.detail}）`,
    hintUnreachable:
      'プロキシポートに到達できません。プロキシクライアントが起動しているか確認するか、「プロキシを自動検出」をご利用ください。',
    detailDirect: '未設定、直接接続',
    hintDirect:
      'モデルサービスは国外にあります。直接接続がタイムアウトする場合は、下でプロキシを設定してください（ワンクリックで自動検出できます）。'
  },
  network: {
    label: 'モデルサービスへの接続性',
    detailViaProxy: (vars) => `${vars.proxy} 経由で転送`,
    detailProxyDown: 'プロキシに到達できず、モデルサービスにアクセスできません',
    hintViaProxy: '実際の接続性は会話の結果で確認してください。',
    hintProxyDown: '先にプロキシを利用可能にしてから、再チェックしてください。',
    detailDirect: (vars) => `${vars.endpoint} → ${vars.detail}`,
    hintDirectFail:
      'モデルサービスに直接接続できません。プロキシクライアントがある場合は、下で設定するか「プロキシを自動検出」をクリックしてください。'
  }
}
