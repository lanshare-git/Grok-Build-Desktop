import { memo, useMemo } from 'react'

import type { ChatItem, ToolStatus } from '@shared/types'
import { densityHidesShellSummary } from '@shared/types'
import { useStore } from '../store'
import { useT, type MessageKey } from '../i18n'
import { stringifyPretty, summarizeInput, toolIconName } from '../utils'
import {
  IconCheck,
  IconChevron,
  IconClose,
  IconFile,
  IconList,
  IconSearch,
  IconStop,
  IconTerminal
} from './Icons'

type ToolItem = Extract<ChatItem, { kind: 'tool' }>

const STATUS_KEY: Record<ToolStatus, MessageKey> = {
  pending: 'tool.status.pending',
  in_progress: 'tool.status.in_progress',
  completed: 'tool.status.completed',
  failed: 'tool.status.failed',
  // 客户端兜底态：agent 没给结果，不是「执行失败」，文案必须区分开
  interrupted: 'tool.status.interrupted'
}

function StatusGlyph({ status }: { status: ToolStatus }): JSX.Element {
  if (status === 'completed') return <IconCheck size={13} className="status-ok" />
  // 工具返回错误是常态反馈，用弱色；血红留给真正的系统错误
  if (status === 'failed') return <IconClose size={13} className="status-muted" />
  if (status === 'interrupted') return <IconStop size={13} className="status-warn" />
  if (status === 'in_progress') return <span className="spinner" />
  return <span className="status-idle" />
}

function ToolCallCardImpl({ item }: { item: ToolItem }): JSX.Element {
  // 展开态存在 store 里，跨会话/跨重启记忆。语义是「覆盖集合优先，其次按密度默认态」
  //（详细档默认展开，其余档默认折叠）—— 见 store.isToolCallExpanded。
  // ⚠️ selector 必须返回 boolean 原始值 —— zustand 用 Object.is 比较，
  // 若返回数组/对象，每次渲染都是新引用，会导致无限重渲染。
  const open = useStore((s) => s.isToolCallExpanded(item.toolCallId))
  const toggleToolCall = useStore((s) => s.toggleToolCall)
  const density = useStore((s) => s.toolCallDensity)
  const t = useT()

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

  /**
   * ⚠️ 性能关键（实测过，别改回无条件计算）：
   * `stringifyPretty` 内部是**完整**的 `JSON.stringify(value, null, 2)`（再截断到 6000 字符），
   * 输入/输出里常常是几十 KB 的工具原始载荷。折叠态这两个串**根本用不到**，
   * 但此前每次渲染都会算 —— 用真实会话测：215 张工具卡跑一轮 **40~135ms**（中位 61ms）。
   * 切换会话时重放会分多批到达，每批都让整张列表重渲染一次，
   * 于是每批都白烧 60ms+，叠加 React 提交/布局后单次长任务达 150~230ms、
   * 累计 1s 左右 —— 表现就是「切换会话后输入框一段时间打不动字」。
   * 现在：输入只在展开时算；输出只在展开、或折叠态就要显示失败原因时算。
   */
  const inputText = useMemo(() => (open ? stringifyPretty(item.input) : ''), [open, item.input])
  // 中断卡片也要在折叠态给出说明：只显示「已中断」两个字，用户不知道发生了什么
  const showReason = item.status === 'failed' || item.status === 'interrupted'
  const outputText = useMemo(
    () => (open || showReason ? stringifyPretty(item.output) : ''),
    [open, showReason, item.output]
  )

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
          {t(STATUS_KEY[item.status])}
        </span>
      </button>

      {/* 返回内容/中断说明不藏在展开区：折叠态直接给出（弱化色，不当告警条）。
          完整内容仍在展开区的「输出」里。 */}
      {showReason && outputText && (
        <div
          className={`tool-fail-reason${item.status === 'interrupted' ? ' is-interrupted' : ''}`}
          title={outputText}
        >
          {outputText}
        </div>
      )}

      {open && (
        <div className="tool-body">
          {/* toolName 从折叠行移到这里：信息不丢失，只是不再占折叠行的视觉预算 */}
          {item.toolName && (
            <div className="tool-meta">
              {t('tool.meta.toolLabel')} <span className="tool-name">{item.toolName}</span>
            </div>
          )}
          {item.locations && item.locations.length > 0 && (
            <div className="tool-section">
              <div className="tool-section-label">{t('tool.meta.involvedFiles')}</div>
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
              <div className="tool-section-label">{t('tool.meta.input')}</div>
              <pre className="tool-pre">{inputText}</pre>
            </div>
          )}
          {outputText && (
            <div className="tool-section">
              <div className="tool-section-label">{t('tool.meta.output')}</div>
              <pre className="tool-pre">{outputText}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * memo 化的理由：切换会话重放历史时，每批 update 都会让 ChatView 重渲染整张列表。
 * store 侧 `upsertTool` 对**未变化**的条目保持同一对象引用（只替换被更新的那一条），
 * 所以 memo 能真正跳过那 200 多张没变的卡片的 render —— 这正是每批 60ms+ 白算的来源。
 */
export default memo(ToolCallCardImpl)
