import type { accountMenu as zh } from '../zh-cn/accountMenu'

export const accountMenu: typeof zh = {
  conn: {
    idle: '未接続',
    starting: '起動中',
    ready: '準備完了',
    error: '接続失敗',
    stopped: '停止'
  },
  quota: {
    weekly: '週間使用量',
    period: '本期間の使用量',
    fallback: '使用量クォータ',
    used: (vars) => `${vars.percent}% 使用済み`,
    unavailable: 'クォータを一時的に取得できません',
    unknown: 'クォータ不明',
    tooltip: (vars) =>
      `${vars.period}：${vars.start} 〜 ${vars.end}\n残り ${vars.remaining}%\nクリックで「設定 → 使用量」を開く`,
    tooltipUnavailable: (vars) => `${vars.error}\nクリックで「設定 → 使用量」を開く`,
    tooltipErrorDefault: 'クォータ情報を取得できません'
  },
  versionUnknown: 'バージョン不明',
  notLoggedIn: '未ログイン',
  settings: '設定',
  language: '言語',
  logout: 'ログアウト',
  loggingOut: 'ログアウト中…'
}
