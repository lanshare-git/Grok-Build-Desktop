import type { prompts as zh } from '../zh-cn/prompts'

export const prompts: typeof zh = {
  perm: {
    badge: '承認待ち',
    title: 'ツール実行リクエスト',
    wantPre: 'Agent が ',
    wantPost: ' を実行しようとしています',
    fallbackTool: 'ツール',
    reject: '拒否',
    allowOnce: '許可（今回のみ）',
    allowAlways: '許可（今後は確認しない）',
    rejectOnce: '拒否（今回のみ）',
    rejectAlways: '拒否（今後は確認しない）',
    allowSameBash: '許可し、同種のコマンドは今後確認しない',
    rejectTellGrok: '拒否し、別の方法を取るよう Grok に伝える',
    rejectNoAsk: '拒否し、このコマンドは今後確認しない',
    allow: '今回の実行を許可'
  },
  question: {
    badge: '回答待ち',
    title: 'Agent からの質問',
    subtitle: '続行するには選択が必要です',
    customPlaceholder: 'またはカスタム回答を入力…',
    submit: '回答を送信',
    cancelLetAgent: 'キャンセル（Agent に任せる）'
  },
  toast: {
    reconnect: '再接続',
    goHandle: '対応する',
    openApp: 'アプリを開く'
  }
}
