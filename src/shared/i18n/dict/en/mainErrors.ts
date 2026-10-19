import type { mainErrors as zh } from '../zh-cn/mainErrors'

export const mainErrors: typeof zh = {
  sessionDelete: {
    missingCwd: 'The session has no working directory',
    invalidId: 'Invalid session ID; deletion refused',
    dataRemain: (vars) =>
      `Deletion failed (the session may be in use by grok): session data remains in the original directory. A copy was saved to the in-app recycle bin: ${vars.path}`,
    failed: (vars) => `Deletion failed (the session may be in use by grok): ${vars.message}`
  },
  sessionMove: {
    invalidId: 'Invalid session ID; move refused',
    missingCwd: 'Missing working directory',
    sameDir: 'Already in the target working directory',
    targetNotDir: (vars) => `The target path is not a folder: ${vars.path}`,
    targetMissing: (vars) => `The target directory does not exist: ${vars.path}`,
    notFound: 'The session directory was not found on disk (draft session or already cleaned up)',
    outOfBounds: 'The target path escapes the sessions root; move refused',
    collision: (vars) =>
      `A session directory with the same ID already exists under the target; nothing was overwritten: ${vars.path}`,
    failed: (vars) => `Move failed (the session may be in use by grok): ${vars.message}`
  },
  grokCli: {
    binaryMissing:
      'grok executable not found. Make sure Grok Build is installed, or set the GROK_BIN environment variable.',
    operationFailed: 'Operation failed',
    commandFailed: (vars) => `grok ${vars.command} failed`,
    pluginUnnamed: '(unnamed)',
    pluginSourceRequired: 'Enter a plugin source (git URL, user/repo, or local path).',
    marketplaceSourceRequired: 'Enter a marketplace source (git URL, user/repo, or local path).',
    marketplaceAdded: 'Marketplace source added.',
    marketplaceRemoved: 'Marketplace source removed.',
    marketplaceUpdated: 'Marketplace sources refreshed.',
    noOutput: '(no output)',
    updateNoOutput:
      'The update command finished with no output. If the version number did not change, the download likely did not complete or the replacement failed; close all grok processes and retry `grok update` in a terminal.',
    updateFailedHint: (vars) =>
      vars.message +
      '\n\nHint: the update needs to replace ~/.grok/bin/grok.exe. Make sure no other grok processes (grok TUI in terminals, grok agent, etc.) are running; ' +
      'the desktop app already stops the agent it launched automatically. You can also quit the app and run `grok update` in a terminal.',
    memoryCleared: 'Memory cleared.',
    worktreeNoPath: 'grok did not return a worktree path',
    worktreeRemoved: 'Worktree removed.',
    loginFinished: 'The login flow has finished.',
    loginTimeout:
      'Sign-in timed out (no browser authorization within 5 minutes). Retry, or run grok login in a terminal.'
  },
  exportMarkdown: {
    dialogTitle: 'Export session as Markdown'
  },
  longShot: {
    dialogTitle: 'Save session long screenshot'
  }
}
