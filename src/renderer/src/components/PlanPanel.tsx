import { memo } from 'react'

import type { ChatItem } from '@shared/types'
import { useT, type MessageKey } from '../i18n'
import { IconList } from './Icons'

type PlanItem = Extract<ChatItem, { kind: 'plan' }>

const STATUS_KEY: Record<string, MessageKey> = {
  pending: 'plan.status.pending',
  in_progress: 'plan.status.in_progress',
  completed: 'plan.status.completed',
  cancelled: 'plan.status.cancelled'
}

function PlanPanelImpl({ item }: { item: PlanItem }): JSX.Element {
  const t = useT()
  if (!item.entries?.length) return <></>

  return (
    <div className="plan">
      <div className="plan-head">
        <IconList size={14} />
        <span>{t('plan.title')}</span>
      </div>
      <ol className="plan-list">
        {item.entries.map((entry, i) => {
          const status = entry.status ?? 'pending'
          const statusKey = STATUS_KEY[status]
          return (
            <li key={i} className={`plan-item plan-${status}`}>
              <span className="plan-marker" />
              <span className="plan-content">{entry.content}</span>
              <span className="plan-status">{statusKey ? t(statusKey) : status}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** memo：重放时每批 update 都会重渲整张列表，未变化的条目引用稳定，memo 可直接跳过 */
export default memo(PlanPanelImpl)
