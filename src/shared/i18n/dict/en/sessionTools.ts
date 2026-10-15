import type { sessionTools as zh } from '../zh-cn/sessionTools'

export const sessionTools: typeof zh = {
  exportMarkdown: 'Export as Markdown',
  exporting: 'Exporting…',
  trace: 'Export diagnostics bundle',
  tracing: 'Packaging…',
  traceTitleDraft: 'Draft sessions are not persisted yet, so no diagnostics bundle can be exported',
  traceTitle: 'Export diagnostics data (saved locally only, never uploaded)',
  unload: 'Unload session (keep data)',
  unloading: 'Unloading…',
  unloadTitleRunning: 'Generating — cannot unload',
  unloadTitleLoaded:
    'Release the memory held by this session in the agent process; on-disk data is kept (the current session reloads immediately)',
  unloadTitleUnloaded: 'This session is not currently in the agent process; nothing to unload',
  moveLabel: 'Move to workspace',
  moveTitleRunning: 'Generating — wait for the current round to finish before moving',
  moveTitle: (vars: { path: string }) =>
    `Move this session's on-disk records to ${vars.path}; it will run in that directory afterwards`,
  deleteTitle: 'Delete session (optionally including on-disk files)',
  delete: 'Delete session',
  exported: (vars: { path: string }) => `Exported to ${vars.path}`,
  failed: (vars: { message: string }) => `Export failed: ${vars.message}`,
  traceDone: (vars: { path: string }) => `Diagnostics bundle created: ${vars.path}`,
  unloaded: 'Unloaded from the agent (on-disk data kept)',
  unloadFailed: (vars: { message: string }) => `Unload failed: ${vars.message}`,
  unknownError: 'Unknown error',

  dir: {
    title: 'Choose a working directory',
    empty: 'No recent directories — add a workspace first',
    browse: 'Add workspace…'
  },

  /** WorkspaceToolsMenu: the "more" menu on a workspace row */
  workspace: {
    rename: 'Rename alias',
    renameTitle: 'Rename alias (double-click the name also works)',
    remove: 'Remove from list',
    removeTitle: 'Remove from the workspace list (on-disk data is unaffected)'
  }
}
