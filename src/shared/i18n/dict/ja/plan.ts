import type { plan as zh } from '../zh-cn/plan'

export const plan: typeof zh = {
  title: '実行計画',
  status: {
    pending: '未対応',
    in_progress: '進行中',
    completed: '完了',
    cancelled: 'キャンセル済み'
  },
  barRunning: (vars: { done: number; total: number; step: string }) =>
    `実行計画 ${vars.done}/${vars.total} · 作業中：${vars.step}`,
  barIdle: (vars: { done: number; total: number; step: string }) =>
    `実行計画 ${vars.done}/${vars.total} · ターン終了、表示は「${vars.step}」のまま`,
  barDone: (vars: { total: number }) => `実行計画完了（${vars.total} 件）`
}
