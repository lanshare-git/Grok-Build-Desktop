import type { common as zh } from '../zh-cn/common'

export const common: typeof zh = {
  ok: 'OK',
  cancel: 'Cancel',
  close: 'Close',
  save: 'Save',
  delete: 'Delete',
  rename: 'Rename',
  retry: 'Retry',
  copy: 'Copy',
  copied: 'Copied',
  loading: 'Loading…',
  followSystem: 'System default',
  untitledSession: 'Untitled session',
  chatGroup: 'Chats',
  bridgeMissingTitle: 'Failed to load app bridge',
  bridgeMissingBody:
    'The preload script was not injected, so the renderer cannot reach main-process capabilities. Restart the app; if it persists, check the build output.',
  connErrorTitle: 'Agent connection error',
  connErrorText: 'Connection to the Grok Build process was lost',
  connStoppedTitle: 'Agent stopped',
  connStoppedText: 'The background process exited; reconnect to continue',
  backgroundTask: 'Background task',
  promptPermTitle: 'Task needs approval',
  promptQuestionTitle: 'Task is asking a question',
  promptPermText: (vars) => `"${vars.name}" requests: ${vars.label}`,
  promptQuestionText: (vars) => `"${vars.name}" needs your input to continue`,
  time: {
    justNow: 'just now'
  }
}
