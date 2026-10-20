export const chat = {
  newChat: '新建聊天',
  newTask: '新任务',
  preparingMedia: '正在准备媒体…',
  imageFallback: '图片',
  imageZoomOpen: '点击放大查看',
  imageZoomIn: '放大',
  imageZoomOut: '缩小',
  imageZoomReset: '重置为适应窗口',
  imageZoomClose: '关闭',
  imageZoomHint: '滚轮缩放 · 拖拽平移 · 双击切换适应/原尺寸 · 点空白或 Esc 关闭',
  edit: '编辑',
  editHint: '编辑后将从此处重新开始对话，已有产物不会被删除',
  readyLine1: '会话已就绪，开始描述你想做的事。',
  readyLine2: 'Agent 可以读写文件、执行命令、检索代码——与终端版 Grok Build 能力一致。',
  agentWorking: 'Agent 正在工作…',
  /** 回合空闲自动打断后的提示（prompt 已返回且中途无再产出） */
  turnIdleCancelled:
    'Agent 超过 5 分钟无新输出，已自动结束本轮。若任务未完成可继续发消息，或点 ■ 后重试。',
  /** 长截屏选点条 */
  longShotPickHint: '点击一条消息作为起点，将截取到对话底部',
  longShotFromTop: '从当前顶部',
  longShotFromStart: '从对话开头',
  longShotCancel: '取消',
  longShotCapturing: '正在长截屏…',
  longShotDone: (vars: { path?: string }) =>
    vars.path ? `长截屏已复制到剪贴板，并保存到 ${vars.path}` : '长截屏已复制到剪贴板',
  longShotDoneClipboardOnly: '长截屏已复制到剪贴板（未另存文件）',
  longShotFailed: (vars: { message: string }) => `长截屏失败：${vars.message}`,
  longShotTruncated: '内容过长，仅截取了起点以下约 16000px，其余已省略'
}
