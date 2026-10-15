import type { density as zh } from '../zh-cn/density'

export const density: typeof zh = {
  detailed: {
    label: 'Detailed',
    desc: 'Tool cards are expanded by default, showing input and output inline'
  },
  'compact-shells': {
    label: 'Collapse command output',
    desc: 'Collapsed by default; terminal/command cards hide even the argument summary'
  },
  'compact-ungrouped': {
    label: 'Compact (ungrouped)',
    desc: 'Collapsed by default; each tool call gets its own row (grok default)'
  },
  'compact-grouped': {
    label: 'Compact + grouped',
    desc: 'Consecutive calls of the same tool merge into one summary card'
  },
  'compact-all-grouped': {
    label: 'Most compact',
    desc: 'Same-tool calls merge, and "Thinking" is collapsed by default'
  }
}
