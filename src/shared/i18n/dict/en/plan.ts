import type { plan as zh } from '../zh-cn/plan'

export const plan: typeof zh = {
  title: 'Execution plan',
  status: {
    pending: 'To do',
    in_progress: 'In progress',
    completed: 'Completed',
    cancelled: 'Cancelled'
  },
  barRunning: (vars: { done: number; total: number; step: string }) =>
    `Plan ${vars.done}/${vars.total} · working on: ${vars.step}`,
  barIdle: (vars: { done: number; total: number; step: string }) =>
    `Plan ${vars.done}/${vars.total} · turn ended; still showing “${vars.step}”`,
  barDone: (vars: { total: number }) => `Plan complete (${vars.total} items)`
}
