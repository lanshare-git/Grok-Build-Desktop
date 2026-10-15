export const tool = {
  status: {
    pending: '等待中',
    in_progress: '执行中',
    completed: '已完成',
    failed: '失败',
    // 客户端兜底态：agent 没给结果，不是「执行失败」，文案必须区分开
    interrupted: '已中断'
  },
  group: {
    failedCount: (vars: { n: number }) => `${vars.n} 个失败`,
    interruptedCount: (vars: { n: number }) => `${vars.n} 个中断`,
    inProgress: '进行中'
  },
  thinking: {
    title: '思考过程',
    live: '进行中'
  },
  meta: {
    toolLabel: '工具',
    involvedFiles: '涉及文件',
    input: '输入',
    output: '输出'
  }
}
