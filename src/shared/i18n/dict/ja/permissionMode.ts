import type { permissionMode as zh } from '../zh-cn/permissionMode'

export const permissionMode: typeof zh = {
  default: {
    label: '承認をリクエスト',
    desc: '読み取り専用操作は確認なし、それ以外は実行前に毎回確認（Codex「承認をリクエスト」相当）'
  },
  auto: {
    label: '自動承認',
    desc: '安全分類器が日常操作を自動許可し、リスクのある操作のみ確認（Codex「自動承認」相当）'
  },
  bypassPermissions: {
    label: 'フルアクセス',
    desc: 'すべてのツールを確認なしで実行。deny ルールと hook は有効（Codex「フルアクセス」相当）'
  },
  acceptEdits: {
    label: '編集を自動承認',
    desc: 'ファイル編集は確認せず、その他のツールは毎回確認'
  },
  dontAsk: {
    label: '許可リストのみ',
    desc: 'allow ルール内のツールのみ確認をスキップ。厳格な管理向け'
  },
  plan: {
    label: 'プランモード',
    desc: '互換性のためのプレースホルダーモード（Claude 互換設定用）'
  }
}
