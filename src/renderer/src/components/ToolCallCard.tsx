import { useState } from 'react'

import type { ChatItem, ToolStatus } from '@shared/types'
import { stringifyPretty, summarizeInput, toolIconName } from '../utils'
import { IconCheck, IconChevron, IconClose, IconFile, IconList, IconSearch, IconTerminal } from './Icons'

type ToolItem = Extract<ChatItem, { kind: 'tool' }>

const STATUS_LABEL: Record<ToolStatus, string> = {
  pending: '等待中',
  in_progress: '执行中',
  completed: '已完成',
  failed: '失败'
}

function StatusGlyph({ status }: { status: ToolStatus }): JSX.Element {
  if (status === 'completed') return <IconCheck size={14} className="status-ok" />
  if (status === 'failed') return <IconClose size={14} className="status-err" />
  if (status === 'in_progress') return <span className="spinner" />
  return <span className="status-idle" />
}

export default function ToolCallCard({ item }: { item: ToolItem }): JSX.Element {
  const [open, setOpen] = useState(false)
  const iconName = toolIconName(item.toolKind, item.toolName)
  const Icon =
    iconName === 'terminal'
      ? IconTerminal
      : iconName === 'search'
        ? IconSearch
        : iconName === 'list'
          ? IconList
          : IconFile

  const summary = summarizeInput(item.input)
  const inputText = stringifyPretty(item.input)
  const outputText = stringifyPretty(item.output)

  return (
    <div className={`tool-card tool-${item.status}`}>
      <button className="tool-head" onClick={() => setOpen((v) => !v)}>
        <IconChevron size={14} className={`tool-chevron${open ? ' is-open' : ''}`} />
        <Icon size={14} className="tool-icon" />
        <span className="tool-title">{item.title}</span>
        {item.toolName && <span className="tool-name">{item.toolName}</span>}
        {summary && <span className="tool-summary" title={summary}>{summary}</span>}
        <span className="tool-status">
          <StatusGlyph status={item.status} />
          {STATUS_LABEL[item.status]}
        </span>
      </button>

      {open && (
        <div className="tool-body">
          {item.locations && item.locations.length > 0 && (
            <div className="tool-section">
              <div className="tool-section-label">涉及文件</div>
              <ul className="tool-paths">
                {item.locations.map((loc) => (
                  <li key={`${loc.path}:${loc.line ?? ''}`}>
                    {loc.path}
                    {loc.line ? `:${loc.line}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {inputText && (
            <div className="tool-section">
              <div className="tool-section-label">输入</div>
              <pre className="tool-pre">{inputText}</pre>
            </div>
          )}
          {outputText && (
            <div className="tool-section">
              <div className="tool-section-label">输出</div>
              <pre className="tool-pre">{outputText}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
