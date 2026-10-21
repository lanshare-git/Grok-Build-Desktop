export const plan = {
  title: '执行计划',
  status: {
    pending: '待办',
    in_progress: '进行中',
    completed: '已完成',
    cancelled: '已取消'
  },
  /** 输入框上方状态条：Agent 仍在跑 */
  barRunning: (vars: { done: number; total: number; step: string }) =>
    `执行计划 ${vars.done}/${vars.total} · 正在：${vars.step}`,
  /** 输入框上方状态条：本轮已停但计划未全部完成（常见：计划卡停在时间线中部） */
  barIdle: (vars: { done: number; total: number; step: string }) =>
    `执行计划 ${vars.done}/${vars.total} · 本轮已结束，当前步骤仍显示「${vars.step}」`,
  barDone: (vars: { total: number }) => `执行计划已全部完成（${vars.total} 项）`
}
