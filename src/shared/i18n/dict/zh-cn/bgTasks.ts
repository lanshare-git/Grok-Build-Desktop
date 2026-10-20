export const bgTasks = {
  summaryRunning: (vars: { n: number }) =>
    vars.n === 1 ? '1 个后台任务运行中' : `${vars.n} 个后台任务运行中`,
  summaryIdle: (vars: { n: number }) => `${vars.n} 个后台任务已结束`,
  stop: '停止',
  stopping: '停止中…',
  stopTitle: '让 agent 停止该后台任务（经 kill_task）',
  killPrompt: (vars: { taskId: string; description: string }) =>
    `请立即用 kill_task 停止后台任务 ${vars.taskId}（${vars.description}），不要做其它事。`,
  kind: {
    command: '命令',
    subagent: '子代理',
    monitor: '监视',
    loop: '定时',
    other: '任务'
  },
  status: {
    running: '运行中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消'
  }
}
