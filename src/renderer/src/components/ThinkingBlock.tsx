import { useEffect, useState } from 'react'

import type { ChatItem } from '@shared/types'
import { densityCollapsesThinking } from '@shared/types'
import { useStore } from '../store'
import { IconBrain, IconChevron } from './Icons'

type ThinkingItem = Extract<ChatItem, { kind: 'thinking' }>

export default function ThinkingBlock({ item }: { item: ThinkingItem }): JSX.Element {
  // 「最紧凑」档默认收起（grok 的 compact-all-grouped 同义）；其余档保持可点开。
  const collapseByDefault = useStore((s) => densityCollapsesThinking(s.toolCallDensity))
  const [open, setOpen] = useState(() => !collapseByDefault)

  // ⚠️ 只在 useState 里取初值是不够的：思考块是**流式生成时陆续挂载**的，
  // 用户改档位时早已存在的块不会重新初始化，于是「最紧凑」看起来没生效。
  // 这里监听档位变化：切到最紧凑就收起；切走时不强行展开（尊重用户已手动打开的状态）。
  useEffect(() => {
    if (collapseByDefault) setOpen(false)
  }, [collapseByDefault])

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
