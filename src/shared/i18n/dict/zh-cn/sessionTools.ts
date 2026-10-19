export const sessionTools = {
  exportMarkdown: '导出为 Markdown',
  exporting: '导出中…',
  longShot: '长截屏…',
  longShotTitle: '从指定消息截到对话底部，复制到剪贴板并可另存为 PNG',
  trace: '导出诊断包',
  tracing: '打包中…',
  traceTitleDraft: '草稿会话尚未落盘，无法导出诊断包',
  traceTitle: '导出诊断数据（只落本地，不上传）',
  unload: '卸载会话（保留数据）',
  unloading: '卸载中…',
  unloadTitleRunning: '正在生成中，无法卸载',
  unloadTitleLoaded: '释放 agent 进程内该会话占用的内存，磁盘数据保留（当前会话会立即重新加载）',
  unloadTitleUnloaded: '该会话当前不在 agent 进程内，无需卸载',
  moveLabel: '移动到工作目录',
  moveTitleRunning: '正在生成中，等这一轮结束再移动',
  moveTitle: (vars: { path: string }) => `把该会话的磁盘记录搬到 ${vars.path}，之后就在这个目录里跑`,
  deleteTitle: '删除会话（可选择是否连磁盘一起删除）',
  delete: '删除会话',
  exported: (vars: { path: string }) => `已导出到 ${vars.path}`,
  failed: (vars: { message: string }) => `导出失败：${vars.message}`,
  traceDone: (vars: { path: string }) => `诊断包已生成：${vars.path}`,
  unloaded: '已从 agent 卸载（磁盘数据保留）',
  unloadFailed: (vars: { message: string }) => `卸载失败：${vars.message}`,
  unknownError: '未知错误',

  /** DirPickerMenu：新建任务 / 切换工作目录的目录选择弹层 */
  dir: {
    title: '选择工作目录',
    switchTitle: '切换工作目录',
    empty: '暂无最近目录，请打开其他目录',
    browse: '添加工作目录…',
    browseOther: '打开其他目录…',
    current: '当前'
  },

  /** WorkspaceToolsMenu：工作目录行的「更多」菜单 */
  workspace: {
    rename: '改别名',
    renameTitle: '改别名（双击名字也行）',
    remove: '从列表移除',
    removeTitle: '从工作目录列表移除（磁盘不受影响）'
  }
}
