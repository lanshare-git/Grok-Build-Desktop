import type { tool as zh } from '../zh-cn/tool'

export const tool: typeof zh = {
  status: {
    pending: 'Pending',
    in_progress: 'In progress',
    completed: 'Completed',
    failed: 'Unsuccessful',
    interrupted: 'Interrupted'
  },
  group: {
    failedCount: (vars: { n: number }) => `${vars.n} unsuccessful`,
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
  },
  /** Client-side fallback interruption reasons (written by markStuckTools, rendered verbatim by ToolCallCard) */
  interruptTurn: 'The turn has ended without a tool result reaching the client (it may have been interrupted or timed out on the agent side).',
  interruptReplay: 'This call was left unfinished by the previous process; there will be no result after the restart.'
}
