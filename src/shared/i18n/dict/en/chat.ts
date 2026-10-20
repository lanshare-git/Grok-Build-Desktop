import type { chat as zh } from '../zh-cn/chat'

export const chat: typeof zh = {
  newChat: 'New chat',
  newTask: 'New task',
  preparingMedia: 'Preparing media…',
  imageFallback: 'image',
  imageZoomOpen: 'Click to enlarge',
  imageZoomIn: 'Zoom in',
  imageZoomOut: 'Zoom out',
  imageZoomReset: 'Fit to window',
  imageZoomClose: 'Close',
  imageZoomHint: 'Scroll to zoom · Drag to pan · Double-click fit/actual size · Click outside or Esc to close',
  edit: 'Edit',
  editHint: 'Editing restarts the conversation from here; existing artifacts will not be deleted',
  readyLine1: 'Session ready. Describe what you want to do.',
  readyLine2:
    'The agent can read/write files, run commands, and search code — same capabilities as terminal Grok Build.',
  agentWorking: 'Agent is working…',
  turnIdleCancelled:
    'No new output for over 5 minutes — this turn was ended automatically. Send another message to continue, or press Stop and retry.',
  longShotPickHint: 'Click a message as the start — capture continues to the bottom',
  longShotFromTop: 'From current top',
  longShotFromStart: 'From conversation start',
  longShotCancel: 'Cancel',
  longShotCapturing: 'Capturing long screenshot…',
  longShotDone: (vars: { path?: string }) =>
    vars.path
      ? `Long screenshot copied to clipboard and saved to ${vars.path}`
      : 'Long screenshot copied to clipboard',
  longShotDoneClipboardOnly: 'Long screenshot copied to clipboard (file not saved)',
  longShotFailed: (vars: { message: string }) => `Long screenshot failed: ${vars.message}`,
  longShotTruncated: 'Content was too long; only ~16000px below the start were captured'
}
