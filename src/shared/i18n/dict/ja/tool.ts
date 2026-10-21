import type { tool as zh } from '../zh-cn/tool'

export const tool: typeof zh = {
  status: {
    pending: '待機中',
    in_progress: '実行中',
    completed: '完了',
    failed: '未成功',
    interrupted: '中断済み'
  },
  group: {
    failedCount: (vars: { n: number }) => `${vars.n} 件未成功`,
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
  },
  /** クライアント側フォールバックの中断説明（markStuckTools が failReason に書き込み、ToolCallCard がそのまま表示） */
  interruptTurn: 'ターンは終了しましたが、クライアントはこのツールの結果を受け取っていません（中断されたか、agent 側でタイムアウトした可能性があります）。',
  interruptReplay: '前回のプロセスで完了しなかった呼び出しです。再起動後は結果が届きません。'
}
