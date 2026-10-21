export const tool = {
  status: {
    pending: '等待中',
    in_progress: '执行中',
    completed: '已完成',
    // 工具返回错误（如目录不存在）是 Agent 试探常态，别写成「失败」像会话崩了
    failed: '未成功',
    // 客户端兜底态：agent 没给结果，不是「执行失败」，文案必须区分开
    interrupted: '已中断'
  },
  group: {
    failedCount: (vars: { n: number }) => `${vars.n} 个未成功`,
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
  },
  /** 客户端兜底中断说明（markStuckTools 写入 failReason，ToolCallCard 直接渲染） */
  interruptTurn: '回合已结束，客户端未收到该工具的返回结果（可能是被中断或 agent 侧超时）。',
  interruptReplay: '这是上一次进程里未完成的调用，重启后不会再有结果。'
}
