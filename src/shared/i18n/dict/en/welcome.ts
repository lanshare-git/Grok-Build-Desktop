import type { welcome as zh } from '../zh-cn/welcome'

export const welcome: typeof zh = {
  title: 'Grok Build Desktop',
  lead: 'Reuses the login state, models, and toolchain of your terminal Grok Build, driving the same Agent over the ACP protocol.',
  point1: 'Streaming output, thinking process, tool calls, and execution plans are visible throughout',
  point2: 'File read/write, command execution, and code search — same capabilities as the terminal version',
  point3: 'Sessions can be saved and resumed, with history shared with the terminal version',
  connFailed: 'Connection failed: ',
  unknownError: 'Unknown error',
  viewDiagnostics: 'View diagnostics',
  diagIssues: (vars: { n: number }) =>
    `Diagnostics found ${vars.n} ${vars.n === 1 ? 'issue' : 'issues'}: `,
  listSeparator: ', ',
  viewDetails: 'View details',
  newTask: 'New task',
  chatTitle:
    'Start a casual read-only chat rooted at your home directory — not tied to any project and never writes files',
  foot: 'Don\'t want to bind a project? Click "New chat" to start right away: the session is rooted at your home directory and locked read-only (no file writes). Project-bound tasks are rooted at the chosen working directory, which cannot be changed after creation.'
}
