import type { plan as zh } from '../zh-cn/plan'

export const plan: typeof zh = {
  title: 'Execution plan',
  status: {
    pending: 'To do',
    in_progress: 'In progress',
    completed: 'Completed',
    cancelled: 'Cancelled'
  }
}
