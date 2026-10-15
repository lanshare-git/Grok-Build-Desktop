import type { dialogs as zh } from '../zh-cn/dialogs'

export const dialogs: typeof zh = {
  closeAction: {
    title: 'When closing the window?',
    message: 'Choose what happens when you click the window close button. You can change this anytime in Settings → General.',
    later: 'Ask me later',
    quit: 'Quit',
    tray: 'Minimize to tray'
  }
}
