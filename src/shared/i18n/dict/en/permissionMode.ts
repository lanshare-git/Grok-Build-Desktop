import type { permissionMode as zh } from '../zh-cn/permissionMode'

export const permissionMode: typeof zh = {
  default: {
    label: 'Ask for approval',
    desc: 'Read-only operations run without asking; everything else asks each time (Codex "Ask for approval")'
  },
  auto: {
    label: 'Auto-approve',
    desc: 'A safety classifier auto-approves routine operations; only risky ones prompt (Codex "Auto-approve")'
  },
  bypassPermissions: {
    label: 'Full access',
    desc: 'All tools run without asking; deny rules and hooks still apply (Codex "Full access")'
  },
  acceptEdits: {
    label: 'Auto-accept edits',
    desc: 'File edits no longer ask; other tools still ask each time'
  },
  dontAsk: {
    label: 'Allow-list only',
    desc: 'Only tools matched by allow rules skip prompting; for strict control scenarios'
  },
  plan: {
    label: 'Plan mode',
    desc: 'Compatibility placeholder mode (used by Claude-compatible settings)'
  }
}
