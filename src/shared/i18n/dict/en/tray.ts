import type { tray as zh } from '../zh-cn/tray'

export const tray: typeof zh = {
  state: {
    ready: 'Connected',
    starting: 'Connecting',
    idle: 'Not connected',
    stopped: 'Disconnected',
    error: 'Connection error'
  },
  statusLine: (vars) => `Status: ${vars.state}`,
  showWindow: 'Show main window',
  quit: 'Quit',
  startingTip: 'Grok Build Desktop is starting…',
  balloon: 'The app was minimized to the system tray. Click the tray icon to reopen.'
}
