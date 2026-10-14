import { memo } from 'react'

import type { ChatItem } from '@shared/types'
import { IconList } from './Icons'

type PlanItem = Extract<ChatItem, { kind: 'plan' }>

const STATUS_TEXT: Record<string, string> = {
  pending: '待办',
  in_progress: '进行中',
  completed: '已完成',
  cancelled: '已取消'
}

function PlanPanelImpl({ item }: { item: PlanItem }): JSX.Element {
  if (!item.entries?.length) return <></>

  return (
    <div className="plan">
      <div className="plan-head">
        <IconList size={14} />
        <span>执行计划</span>
      </div>
      <ol className="plan-list">
        {item.entries.map((entry, i) => (
          <li key={i} className={`plan-item plan-${entry.status ?? 'pending'}`}>
            <span className="plan-marker" />
            <span className="plan-content">{entry.content}</span>
            <span className="plan-status">{STATUS_TEXT[entry.status ?? 'pending'] ?? entry.status}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** memo：重放时每批 update 都会重渲整张列表，未变化的条目引用稳定，memo 可直接跳过 */
export default memo(PlanPanelImpl)
