import type { bgTasks as zh } from '../zh-cn/bgTasks'

export const bgTasks: typeof zh = {
  summaryRunning: (vars) =>
    vars.n === 1 ? '1 background task running' : `${vars.n} background tasks running`,
  summaryIdle: (vars) => `${vars.n} background task(s) finished`,
  stop: 'Stop',
  stopping: 'Stopping…',
  stopTitle: 'Ask the agent to stop this task via kill_task',
  killPrompt: (vars) =>
    `Immediately stop background task ${vars.taskId} (${vars.description}) with kill_task. Do nothing else.`,
  kind: {
    command: 'Command',
    subagent: 'Subagent',
    monitor: 'Monitor',
    loop: 'Loop',
    other: 'Task'
  },
  status: {
    running: 'Running',
    completed: 'Completed',
    failed: 'Failed',
    cancelled: 'Cancelled'
  }
}
