import { useMemo, useState } from 'react'

import type { ChatItem, PlanEntry } from '@shared/types'
import { useT } from '../i18n'
import { useStore } from '../store'
import { IconChevron, IconList } from './Icons'

type PlanItem = Extract<ChatItem, { kind: 'plan' }>

function pickPlan(items: ChatItem[]): PlanItem | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]
    if (it.kind === 'plan' && it.entries?.length) return it
  }
  return null
}

function currentEntry(entries: PlanEntry[]): PlanEntry | undefined {
  return (
    entries.find((e) => e.status === 'in_progress') ??
    entries.find((e) => !e.status || e.status === 'pending')
  )
}

/**
 * 执行计划状态条（输入框上方）。
 *
 * 计划卡片在时间线里**就地更新**（首次出现的位置），后续工具调用往下堆——
 * 用户翻到聊天底部时只看到「已完成」的工具卡，看不到上面还在「进行中」的计划，
 * 又因输入框不禁用，难以判断 Agent 是否还在跑。本条把未完成计划钉在输入框上方。
 */
export default function PlanStatusBar(): JSX.Element | null {
  const t = useT()
  const activeId = useStore((s) => s.activeId)
  const running = useStore((s) => !!activeId && s.running.includes(activeId))
  const plan = useStore((s) => {
    if (!s.activeId) return null
    const session = s.sessions.find((x) => x.id === s.activeId)
    return session ? pickPlan(session.items) : null
  })
  const [open, setOpen] = useState(true)

  const summary = useMemo(() => {
    if (!plan?.entries?.length) return null
    const entries = plan.entries
    const done = entries.filter((e) => e.status === 'completed').length
    const total = entries.length
    // 步骤都完成了就没必要再占输入框上方——回合是否还在跑看底下「Agent 正在工作」即可
    if (done === total) return null
    const cur = currentEntry(entries)
    return {
      done,
      total,
      cur,
      entries
    }
  }, [plan])

  if (!activeId || !summary) return null

  const live = running || !!summary.entries.some((e) => e.status === 'in_progress')
  const headText = running
    ? t('plan.barRunning', {
        done: summary.done,
        total: summary.total,
        step: summary.cur?.content ?? t('plan.title')
      })
    : t('plan.barIdle', {
        done: summary.done,
        total: summary.total,
        step: summary.cur?.content ?? t('plan.title')
      })

  return (
    <div className={`plan-bar${open ? ' is-open' : ''}${live ? ' has-active' : ''}`}>
      <button
        type="button"
        className="plan-bar-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {running ? <span className="spinner plan-bar-spinner" /> : <IconList size={14} />}
        <span className="plan-bar-summary">{headText}</span>
        <IconChevron size={13} className={`plan-bar-chevron${open ? ' is-open' : ''}`} />
      </button>
      {open && (
        <ol className="plan-bar-list">
          {summary.entries.map((entry, i) => {
            const status = entry.status ?? 'pending'
            return (
              <li key={i} className={`plan-item plan-${status}`}>
                <span className="plan-marker" />
                <span className="plan-content">{entry.content}</span>
                <span className="plan-status">
                  {status === 'pending'
                    ? t('plan.status.pending')
                    : status === 'in_progress'
                      ? t('plan.status.in_progress')
                      : status === 'completed'
                        ? t('plan.status.completed')
                        : status === 'cancelled'
                          ? t('plan.status.cancelled')
                          : status}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
