import type { sidebar as zh } from '../zh-cn/sidebar'

export const sidebar: typeof zh = {
  newTask: 'New task',
  newChatLongTitle:
    'Start a casual read-only chat rooted at your home directory — not tied to any project and never writes files',
  searchPlaceholder: 'Search sessions (titles and content)',
  clearSearch: 'Clear search',
  searchHits: (vars: { n: number }) =>
    vars.n === 0
      ? 'No sessions matched — try a shorter keyword'
      : `${vars.n} ${vars.n === 1 ? 'session' : 'sessions'} matched`,
  workspacesLabel: 'Workspaces',
  noSessions: 'No sessions yet',
  noChats: 'No chats yet',
  newHere: 'New here',
  homeGroupTitle: (vars: { path: string }) =>
    `Chats: always rooted at your home directory, not tied to any project\n${vars.path}\nClick to collapse / expand`,
  groupTitle: (vars: { path: string; alias: string }) =>
    vars.alias ? `${vars.path}　Alias: ${vars.alias}` : vars.path,
  newChatReadonly: 'New chat (rooted at home directory, read-only)',
  newTaskInDir: (vars: { path: string }) => `New task in ${vars.path}`,
  newWorktreeInDir: (vars: { path: string }) =>
    `New task in a git worktree of ${vars.path} (separate working copy, same as "grok -w" in the terminal)`,
  renameAlias: 'Rename alias (or double-click the name)',
  removeFromList: 'Remove from the workspace list',
  statusRunning: 'Generating',
  statusPending: 'Needs your response',
  statusDone: 'Done',
  tagRunning: 'Generating',
  tagPending: 'Pending',
  renameInputTitle:
    "Edit directly; leave empty or restore the original title to follow grok's automatic title again",
  sessionTitleCustom: (vars: { title: string; original: string }) =>
    `${vars.title}\n(Double-click to rename; original: ${vars.original})`,
  sessionTitleAuto: (vars: { title: string }) => `${vars.title}\n(Double-click to rename)`,
  renameSession: 'Rename (or double-click the title)',
  moreActions: 'More (export / unload / delete)',
  deleteSession: 'Delete session',
  unknownError: 'Unknown error',

  preview: {
    fileLabel: 'Session file',
    notPersisted: 'Not persisted (created after the first message)',
    copyPathTitle: (vars: { path: string }) => `${vars.path}\nClick to copy the full path`,
    openInExplorer: 'Open the containing folder in Explorer',
    open: 'Open',
    originalTitle: (vars: { title: string }) => `grok original title: ${vars.title}`
  },

  flash: {
    workspaceRemoved: (vars: { path: string }) => `Removed workspace ${vars.path}`,
    sessionRunning: 'This session is generating — wait for the current round to finish before moving it',
    sessionRunningDrag:
      'This session is generating — wait for the current round to finish (or stop it) before moving it',
    removedFromList: (vars: { title: string }) =>
      `Removed "${vars.title}" from the list; on-disk records kept`,
    deletedWithShellLeft: (vars: { title: string }) =>
      `Deleted session "${vars.title}" (an empty shell remains at the original location; harmless)`,
    deletedToQuarantine: (vars: { title: string }) =>
      `Deleted session "${vars.title}" (moved to the in-app recycle bin)`,
    deletedFully: (vars: { title: string }) =>
      `Deleted session "${vars.title}" and its files (restorable from the system Recycle Bin)`,
    worktreeCreated: (vars: { path: string }) => `New task created in worktree: ${vars.path}`,
    worktreeFailed: (vars: { message: string }) => `Failed to create worktree: ${vars.message}`,
    moved: (vars: { title: string; label: string }) => `Moved "${vars.title}" to ${vars.label}`,
    moveFailed: (vars: { message: string }) => `Move failed: ${vars.message}`
  },

  confirm: {
    blockedTitle: 'Cannot remove this workspace',
    blockedMsgA: '"',
    blockedMsgB: (vars: { n: number }) =>
      `" still has ${vars.n} ${vars.n === 1 ? 'session' : 'sessions'}. As long as they exist, this directory stays in the list.`,
    blockedDetailA: "A session's working directory is fixed by grok at ",
    blockedDetailB:
      ' time and cannot be changed later. To make it disappear, delete all sessions under it first (you will be asked to confirm before each deletion).',
    gotIt: 'Got it',
    removeTitle: 'Remove workspace?',
    removeMsgA: 'Remove ',
    removeMsgB: ' from the workspace list.',
    removeDetailAliased: (vars: { label: string; path: string }) =>
      `This only unregisters it (including the alias "${vars.label}"); ${vars.path} on disk is not affected, and it will reappear automatically when you create a task there again.`,
    removeDetail: (vars: { path: string }) =>
      `This only unregisters it; ${vars.path} on disk is not affected, and it will reappear automatically when you create a task there again.`,
    remove: 'Remove',
    deleteTitlePurge: 'Delete the session and its on-disk files?',
    deleteTitle: 'Delete session?',
    deleteMsgA: 'About to delete session ',
    deleteMsgB: (vars: { n: number }) =>
      vars.n > 0 ? ` (${vars.n} ${vars.n === 1 ? 'record' : 'records'}).` : '.',
    deleteWarnRunning: 'This session is generating — deleting it will interrupt the current round.',
    deleteWarnActive: 'It is the currently open session; another session will be selected after deletion.',
    deleteDraftNote: 'This is a draft session that has not been persisted; there is no file on disk.',
    purgeOption: 'Also delete the session files on disk',
    purgeHint:
      'Moves the session directory under ~/.grok/sessions to the system Recycle Bin (restorable); falls back to the in-app recycle bin when the system one is unavailable. Uncheck to only remove it from the app list while keeping the on-disk records.',
    deleteConfirmPurge: 'Delete session and files',
    deleteConfirmList: 'Remove from list',
    deleteFailedTitle: 'Could not delete the on-disk files',
    deleteFailedMsgA: 'The on-disk files of session ',
    deleteFailedMsgB: ' still exist.',
    deleteFailedDetail:
      'Most likely grok is using this session (files are locked). You can retry after it finishes, or only remove it from the app list this time — the on-disk records will be kept and may reappear in the list on next launch.',
    deleteFailedConfirm: 'Remove from list only',
    deleteFailedCancel: 'Not now',
    worktreeTitle: 'Create a task in a worktree?',
    worktreeMsgA: 'Create a separate git worktree based on ',
    worktreeMsgB: ' and start a new task in it.',
    worktreeDetail:
      'Independent from the changes in the main repository (the worktree name is generated by grok). The target directory must be a git repository. Manage and clean up worktrees in Settings → Worktree.',
    worktreeConfirm: 'Create and start',
    moveTitle: 'Move to another workspace?',
    moveMsgA: 'Move session ',
    moveMsgB: ' into ',
    moveMsgC: '.',
    moveDraft: 'This is a draft session that has not been persisted; only its working directory will change.',
    moveDetail:
      "The session's on-disk records will be moved along with its full history, and the session will run in the new directory afterwards: tool execution, file reads/writes, and grok's workspace memory will all be rooted there.",
    moveChatWarn:
      'This is a pure chat session (originally locked read-only). Once moved into a project directory it behaves like a normal task and you can switch permission modes yourself; to keep it read-only, switch back to "Plan mode" in the top-right corner after moving.',
    moveActiveNote: 'It is the currently open session; it will be reloaded with the new directory after the move.',
    move: 'Move'
  },

  account: {
    menuTitle: (vars: { email: string }) => `${vars.email}\nClick to open the account menu`,
    menuTitleLoggedOut: 'Not signed in · Click to open the account menu',
    loggedIn: 'Signed in',
    login: 'Sign in'
  }
}
