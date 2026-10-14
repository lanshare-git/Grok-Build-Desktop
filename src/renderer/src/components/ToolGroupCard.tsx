import { useState } from 'react'

import type { ChatItem } from '@shared/types'
import { toolIconName } from '../utils'
import ToolCallCard from './ToolCallCard'
import { IconChevron, IconClose, IconFile, IconList, IconSearch, IconTerminal } from './Icons'

type ToolItem = Extract<ChatItem, { kind: 'tool' }>

/**
 * 工具调用汇总卡 —— 对应 grok 1.0.52 的 `compact-grouped` / `compact-all-grouped`：
 * 终端会把**连续的同种工具调用**折成一行摘要（"read_file ×12"），
 * 客户端此前只能逐张卡片平铺，长会话里工具调用一多就非常占屏。
 *
 * 规则（与终端一致）：
 *  - 只合并**连续**且**同工具名**的工具调用；中间夹了其它工具/消息就断开
 *  - 只有 ≥2 张才值得合并，单张仍走普通 ToolCallCard
 *  - 组卡默认收起，展开后逐张渲染（每张卡仍可单独展开）
 */
export default function ToolGroupCard({ items }: { items: ToolItem[] }): JSX.Element {
  const [open, setOpen] = useState(false)

  const first = items[0]
  const toolName = first.toolName || first.title
  const failed = items.filter((i) => i.status === 'failed').length
  const running = items.filter((i) => i.status === 'in_progress' || i.status === 'pending').length

  const iconName = toolIconName(first.toolKind, first.toolName)
  const Icon =
    iconName === 'terminal'
      ? IconTerminal
      : iconName === 'search'
        ? IconSearch
        : iconName === 'list'
          ? IconList
          : IconFile

  return (
    <div className={`tool-card tool-group${failed > 0 ? ' tool-failed' : ''}`}>
      <button className="tool-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <IconChevron size={13} className={`tool-chevron${open ? ' is-open' : ''}`} />
        <Icon size={13} className="tool-icon" />
        <span className="tool-title" title={toolName}>
          {toolName}
        </span>
        <span className="tool-summary">× {items.length}</span>
        {failed > 0 && (
          <span className="tool-status">
            <IconClose size={13} className="status-err" />
            {failed} 个失败
          </span>
        )}
        {running > 0 && <span className="tool-status">进行中</span>}
      </button>

      {open && (
        <div className="tool-group-body">
          {items.map((item) => (
            <ToolCallCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}