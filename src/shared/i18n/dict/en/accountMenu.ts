import type { accountMenu as zh } from '../zh-cn/accountMenu'

export const accountMenu: typeof zh = {
  conn: {
    idle: 'Disconnected',
    starting: 'Starting',
    ready: 'Ready',
    error: 'Connection failed',
    stopped: 'Stopped'
  },
  quota: {
    weekly: 'Weekly usage',
    period: 'Usage this period',
    fallback: 'Usage quota',
    used: (vars) => `${vars.percent}% used`,
    unavailable: 'Quota temporarily unavailable',
    unknown: 'Quota unknown',
    tooltip: (vars) =>
      `${vars.period}: ${vars.start} to ${vars.end}\n${vars.remaining}% remaining\nClick to open Settings → Usage`,
    tooltipUnavailable: (vars) => `${vars.error}\nClick to open Settings → Usage`,
    tooltipErrorDefault: 'Quota info unavailable'
  },
  versionUnknown: 'Unknown version',
  notLoggedIn: 'Not signed in',
  settings: 'Settings',
  language: 'Language',
  logout: 'Sign out',
  loggingOut: 'Signing out…'
}
