import type { tool as zh } from '../zh-cn/tool'

export const tool: typeof zh = {
  status: {
    pending: '待機中',
    in_progress: '実行中',
    completed: '完了',
    failed: '失敗',
    interrupted: '中断済み'
  },
  group: {
    failedCount: (vars: { n: number }) => `${vars.n} 件失敗`,
    interruptedCount: (vars: { n: number }) => `${vars.n} 件中断`,
    inProgress: '進行中'
  },
  thinking: {
    title: '思考プロセス',
    live: '進行中'
  },
  meta: {
    toolLabel: 'ツール',
    involvedFiles: '関連ファイル',
    input: '入力',
    output: '出力'
  }
}
