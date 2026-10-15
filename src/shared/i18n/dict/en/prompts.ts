import type { prompts as zh } from '../zh-cn/prompts'

export const prompts: typeof zh = {
  perm: {
    badge: 'Pending approval',
    title: 'Tool execution request',
    wantPre: 'The agent wants to run ',
    wantPost: '',
    fallbackTool: 'a tool',
    reject: 'Reject',
    allowOnce: 'Allow (this time only)',
    allowAlways: "Allow (don't ask again)",
    rejectOnce: 'Reject (this time only)',
    rejectAlways: "Reject (don't ask again)",
    allowSameBash: "Allow, and don't ask again for similar commands",
    rejectTellGrok: 'Reject, and tell Grok to do it differently',
    rejectNoAsk: "Reject, and don't ask again for this command",
    allow: 'Allow this run'
  },
  question: {
    badge: 'Answer needed',
    title: 'Agent question',
    subtitle: 'Your choice is needed to continue',
    customPlaceholder: 'Or type a custom answer…',
    submit: 'Submit answer',
    cancelLetAgent: 'Cancel (let the agent decide)'
  },
  toast: {
    reconnect: 'Reconnect',
    goHandle: 'Handle it'
  }
}
