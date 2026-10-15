import type { tool as zh } from '../zh-cn/tool'

export const tool: typeof zh = {
  status: {
    pending: 'Pending',
    in_progress: 'In progress',
    completed: 'Completed',
    failed: 'Failed',
    interrupted: 'Interrupted'
  },
  group: {
    failedCount: (vars: { n: number }) => `${vars.n} failed`,
    interruptedCount: (vars: { n: number }) => `${vars.n} interrupted`,
    inProgress: 'In progress'
  },
  thinking: {
    title: 'Thinking process',
    live: 'In progress'
  },
  meta: {
    toolLabel: 'Tool',
    involvedFiles: 'Files involved',
    input: 'Input',
    output: 'Output'
  }
}
