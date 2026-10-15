import type { header as zh } from '../zh-cn/header'

export const header: typeof zh = {
  newTaskTitle: 'New task (choose working directory)',
  renameInputTitle:
    'Edit directly; leave empty or restore the original title to follow grok\'s automatic title again',
  titleRename: (vars: { title: string }) => `${vars.title}\n(double-click to rename)`,
  titleRenameWithOriginal: (vars: { title: string; original: string }) =>
    `${vars.title}\n(double-click to rename; original: ${vars.original})`,
  titleLockedChatSuffix:
    '\nChat session: rooted at the home directory, not bound to a project, locked read-only (no file writes)',
  titleMovedChatSuffix:
    '\nTask moved from a chat session: bound to a project; permission mode can be chosen like a normal task',
  pathTitleLocked:
    'Chat sessions are rooted at the home directory and cannot switch directories; create a normal task to use another working directory',
  pathTitleChat: (vars: { cwd: string }) =>
    `Working directory: ${vars.cwd}\nClicking to choose a directory will CREATE a new task in it; the current session stays unchanged`,
  pathTitleTask: (vars: { cwd: string }) =>
    `Working directory: ${vars.cwd}\nClicking to choose a directory will CREATE a new task in it; the current session stays unchanged\nTo change this session's own directory: use "Move to working directory" in the "☰" menu on the session row (sessions currently generating cannot be moved)`,
  model: 'Model',
  effort: 'Reasoning effort',
  modeTitleLocked: 'Chat session is locked read-only (plan mode) and cannot be changed',
  modeTitleChat: 'This session was moved from a chat; permission mode can be switched like a normal task',
  modeTitle: (vars: { desc: string }) => `Permission mode · ${vars.desc}`,
  usageTitle: (vars: { input: number; output: number; cacheRead: number }) =>
    `Last turn: input ${vars.input} · output ${vars.output} · cache read ${vars.cacheRead}\nClick to view per-turn details for this session and totals across all sessions`,
  usageTitleEmpty: 'Usage: click to view per-turn details for this session and totals across all sessions'
}
