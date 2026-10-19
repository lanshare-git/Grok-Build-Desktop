import type { settings as zh } from '../zh-cn/settings'

export const settings: typeof zh = {
  title: 'Settings',
  close: 'Close (Esc)',
  nav: {
    general: 'General',
    account: 'Account',
    usage: 'Usage',
    mcp: 'MCP Servers',
    plugins: 'Plugins',
    disk: 'Storage',
    worktree: 'Worktree',
    version: 'Version & Updates',
    diagnostics: 'Diagnostics',
    about: 'About'
  },
  general: {
    title: 'General',
    subtitle: 'Basic app behavior',
    language: {
      title: 'Language / 语言',
      desc: 'Interface language; follows the system by default'
    },
    closeAction: {
      title: 'On close',
      desc: 'What happens when you click the window close button',
      tray: 'Minimize to tray',
      quit: 'Quit',
      ask: 'Ask every time',
      hint: 'With "Ask every time", closing the window prompts again next time; the other options remember your choice.'
    },
    purge: {
      title: 'When deleting a session',
      desc: 'Whether to also delete on-disk files by default',
      on: 'Checked by default',
      off: 'Unchecked by default',
      hint: 'Controls the "Also delete session files on disk" checkbox in the delete confirmation: when checked, the session\'s disk data is deleted too (sent to the system recycle bin first, or the in-app recycle bin when unavailable, still recoverable); when unchecked, the dialog only removes the session from the list — tick the checkbox yourself to delete the files.'
    },
    desktopPermToast: {
      title: 'Permission toast',
      desc: 'Whether to show a desktop toast with Allow/Deny when another session needs approval or the window is in the background',
      on: 'On',
      off: 'Off',
      hint: 'When off, rely on the in-session panel and sidebar dots only. You can turn it back on here or from the toast footer.',
      disableFromToast: 'Turn off these toasts'
    },
    density: {
      title: 'Tool call display density',
      desc: 'Controls how expanded tool call cards are in chats. Shares the same config with the terminal /density command (ui.tool_call_density in ~/.grok/config.toml); changes here take effect in the terminal on its next launch.',
      aria: 'Tool call display density',
      writeFail: 'Failed to write ~/.grok/config.toml; the change only applies to this window.',
      hint: 'Applies immediately to the current session; tool cards you expanded or collapsed manually keep your choice.'
    }
  },
  account: {
    title: 'Account',
    subtitle: 'The desktop app shares the same login state as terminal Grok (~/.grok/auth.json); signing out here also clears the terminal credentials.',
    current: 'Current account',
    currentDesc: 'Signed-in email and name',
    currentEmptyDesc: 'Not signed in, or the login session has expired',
    notLoggedIn: 'Not signed in',
    team: 'Team',
    teamDesc: 'Team identifier of the current account',
    authMode: 'Auth method',
    authModeDesc: 'Authentication type used at sign-in',
    login: 'Sign in',
    loggingIn: 'Signing in…',
    loginHint: 'A browser window will open for device-code authorization. After that, the desktop app and terminal share the same login state.',
    logout: 'Sign out',
    loggingOut: 'Signing out…',
    loginFailed: (vars) => `Sign-in failed: ${vars.message}`,
    logoutHint: 'Signing out clears locally cached credentials and restarts the agent; sign in again from this page when you need to use the app.'
  }
}
