import type { ChatItem, ToolStatus } from '@shared/types'
import { densityHidesShellSummary } from '@shared/types'
import { useStore } from '../store'
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
  if (status === 'completed') return <IconCheck size={13} className="status-ok" />
  if (status === 'failed') return <IconClose size={13} className="status-err" />
  if (status === 'in_progress') return <span className="spinner" />
  return <span className="status-idle" />
}

export default function ToolCallCard({ item }: { item: ToolItem }): JSX.Element {
  // 展开态存在 store 里，跨会话/跨重启记忆。语义是「覆盖集合优先，其次按密度默认态」
  //（详细档默认展开，其余档默认折叠）—— 见 store.isToolCallExpanded。
  // ⚠️ selector 必须返回 boolean 原始值 —— zustand 用 Object.is 比较，
  // 若返回数组/对象，每次渲染都是新引用，会导致无限重渲染。
  const open = useStore((s) => s.isToolCallExpanded(item.toolCallId))
  const toggleToolCall = useStore((s) => s.toggleToolCall)
  const density = useStore((s) => s.toolCallDensity)

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
  // JSON.stringify 兜底串（以 { 开头）在折叠行里是纯噪声：参数已完整躺在展开区的「输入」里
  // 「收起命令输出」档额外把 shell/终端类卡片的摘要也藏掉（那类摘要往往是一整条命令）
  const isShell = iconName === 'terminal'
  const showSummary =
    !!summary && !summary.trimStart().startsWith('{') && !(isShell && densityHidesShellSummary(density))
  const inputText = stringifyPretty(item.input)
  const outputText = stringifyPretty(item.output)

  return (
    <div className={`tool-card tool-${item.status}`}>
      <button
        className="tool-head"
        aria-expanded={open}
        onClick={() => toggleToolCall(item.toolCallId)}
      >
        <IconChevron size={13} className={`tool-chevron${open ? ' is-open' : ''}`} />
        <Icon size={13} className="tool-icon" />
        {/* title 现在会被 ellipsis 截断，原生 tooltip 是完整内容的唯一出口 */}
        <span className="tool-title" title={item.title}>{item.title}</span>
        {showSummary && <span className="tool-summary" title={summary}>{summary}</span>}
        <span className="tool-status">
          <StatusGlyph status={item.status} />
          {STATUS_LABEL[item.status]}
        </span>
      </button>

      {/* 失败原因不藏在展开区：折叠态直接给出（通常一两行），
          否则用户只看到「失败」两个字，得挨个展开才知道出了什么事。
          完整内容仍在展开区的「输出」里，点击卡片可看全部。 */}
      {item.status === 'failed' && outputText && (
        <div className="tool-fail-reason" title={outputText}>
          {outputText}
        </div>
      )}

      {open && (
        <div className="tool-body">
          {/* toolName 从折叠行移到这里：信息不丢失，只是不再占折叠行的视觉预算 */}
          {item.toolName && (
            <div className="tool-meta">
              工具 <span className="tool-name">{item.toolName}</span>
            </div>
          )}
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
