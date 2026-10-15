import type { chat as zh } from '../zh-cn/chat'

export const chat: typeof zh = {
  newChat: 'New chat',
  newTask: 'New task',
  preparingMedia: 'Preparing media…',
  imageFallback: 'image',
  edit: 'Edit',
  editHint: 'Editing restarts the conversation from here; existing artifacts will not be deleted',
  readyLine1: 'Session ready. Describe what you want to do.',
  readyLine2:
    'The agent can read/write files, run commands, and search code — same capabilities as terminal Grok Build.',
  agentWorking: 'Agent is working…'
}
