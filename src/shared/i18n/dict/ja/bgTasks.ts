import type { bgTasks as zh } from '../zh-cn/bgTasks'

export const bgTasks: typeof zh = {
  summaryRunning: (vars) =>
    vars.n === 1 ? 'バックグラウンドタスクが 1 件実行中' : `バックグラウンドタスクが ${vars.n} 件実行中`,
  summaryIdle: (vars) => `バックグラウンドタスク ${vars.n} 件が終了`,
  stop: '停止',
  stopping: '停止中…',
  stopTitle: 'kill_task でこのタスクを停止するよう agent に依頼',
  killPrompt: (vars) =>
    `kill_task でバックグラウンドタスク ${vars.taskId}（${vars.description}）を直ちに停止してください。他のことはしないでください。`,
  kind: {
    command: 'コマンド',
    subagent: 'サブエージェント',
    monitor: 'モニター',
    loop: 'ループ',
    other: 'タスク'
  },
  status: {
    running: '実行中',
    completed: '完了',
    failed: '失敗',
    cancelled: 'キャンセル'
  }
}
