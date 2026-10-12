import { useState } from 'react'

import type { ChatItem } from '@shared/types'
import { IconBrain, IconChevron } from './Icons'

type ThinkingItem = Extract<ChatItem, { kind: 'thinking' }>

export default function ThinkingBlock({ item }: { item: ThinkingItem }): JSX.Element {
  const [open, setOpen] = useState(false)

  return (
    <div className="thinking">
      <button className="thinking-head" onClick={() => setOpen((v) => !v)}>
        <IconChevron size={14} className={`tool-chevron${open ? ' is-open' : ''}`} />
        <IconBrain size={14} />
        <span>思考过程</span>
        {item.streaming && <span className="thinking-live">进行中</span>}
      </button>
      {open && <div className="thinking-body">{item.text}</div>}
    </div>
  )
}
