import type { plan as zh } from '../zh-cn/plan'

export const plan: typeof zh = {
  title: '実行計画',
  status: {
    pending: '未対応',
    in_progress: '進行中',
    completed: '完了',
    cancelled: 'キャンセル済み'
  }
}
