import { useEffect, useMemo, useState } from 'react'

import type { BackgroundTask } from '@shared/types'
import { useT } from '../i18n'
import { useStore } from '../store'
import { sendPrompt } from '../actions'
import { IconChevron, IconStop, IconTerminal } from './Icons'

/** 仍算「活着」的状态：会占住输入框上方的状态条 */
function isActiveStatus(status: string): boolean {
  const s = status.toLowerCase()
  return s === 'running' || s === 'pending' || s === 'in_progress' || s === 'starting'
}

function kindLabel(kind: string | undefined, t: ReturnType<typeof useT>): string {
  switch ((kind || '').toLowerCase()) {
    case 'bash':
    case 'shell':
    case 'command':
      return t('bgTasks.kind.command')
    case 'subagent':
      return t('bgTasks.kind.subagent')
    case 'monitor':
      return t('bgTasks.kind.monitor')
    case 'loop':
    case 'scheduler':
      return t('bgTasks.kind.loop')
    default:
      return kind || t('bgTasks.kind.other')
  }
}

function statusLabel(status: string, t: ReturnType<typeof useT>): string {
  const s = status.toLowerCase()
  if (isActiveStatus(s)) return t('bgTasks.status.running')
  if (s === 'completed') return t('bgTasks.status.completed')
  if (s === 'failed') return t('bgTasks.status.failed')
  if (s === 'cancelled' || s === 'canceled' || s === 'killed') return t('bgTasks.status.cancelled')
  return status
}

/**
 * 后台任务条 —— 对齐终端输入框上方的「仍在运行」提示（`Ctrl+G` 任务面板的桌面精简版）。
 *
 * ACP 没有客户端直杀接口（kill_task 是模型工具），点「停止」会发一条短 prompt，
 * 让 agent 用 kill_task 收掉对应 task_id。
 */
export default function BackgroundTasksBar(): JSX.Element | null {
  const t = useT()
  const activeId = useStore((s) => s.activeId)
  const tasks = useStore((s) => (activeId ? s.backgroundTasks[activeId] : undefined))
  const [open, setOpen] = useState(true)
  const [stoppingId, setStoppingId] = useState<string | null>(null)

  const list = tasks ?? EMPTY
  const active = useMemo(() => list.filter((x) => isActiveStatus(x.status)), [list])

  // 新出现进行中任务时自动展开，避免用户错过
  useEffect(() => {
    if (active.length > 0) setOpen(true)
  }, [active.length])

  if (!activeId || active.length === 0) return null

  const summary = t('bgTasks.summaryRunning', { n: active.length })

  const stopTask = async (task: BackgroundTask): Promise<void> => {
    if (!activeId || stoppingId) return
    setStoppingId(task.taskId)
    try {
      await sendPrompt(
        t('bgTasks.killPrompt', {
          taskId: task.taskId,
          description: task.description || task.command || task.taskId
        })
      )
    } finally {
      setStoppingId(null)
    }
  }

  return (
    <div className={`bg-tasks${open ? ' is-open' : ''} has-active`}>
      <button
        type="button"
        className="bg-tasks-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="bg-tasks-dot is-live" />
        <span className="bg-tasks-summary">{summary}</span>
        <IconChevron size={13} className={`bg-tasks-chevron${open ? ' is-open' : ''}`} />
      </button>

      {open && (
        <ul className="bg-tasks-list">
          {list.map((task) => {
            const live = isActiveStatus(task.status)
            const title = task.description || task.command || task.taskId
            return (
              <li key={task.taskId} className={`bg-tasks-row status-${live ? 'running' : task.status}`}>
                <IconTerminal size={13} className="bg-tasks-icon" />
                <div className="bg-tasks-main">
                  <div className="bg-tasks-title" title={task.command || title}>
                    {title}
                  </div>
                  <div className="bg-tasks-meta">
                    <span>{kindLabel(task.kind, t)}</span>
                    <span>·</span>
                    <span>{statusLabel(task.status, t)}</span>
                    {typeof task.exitCode === 'number' && (
                      <>
                        <span>·</span>
                        <span>exit {task.exitCode}</span>
                      </>
                    )}
                  </div>
                </div>
                {live && (
                  <button
                    type="button"
                    className="btn btn-ghost bg-tasks-stop"
                    disabled={stoppingId === task.taskId}
                    title={t('bgTasks.stopTitle')}
                    onClick={(e) => {
                      e.stopPropagation()
                      void stopTask(task)
                    }}
                  >
                    <IconStop size={13} />
                    {stoppingId === task.taskId ? t('bgTasks.stopping') : t('bgTasks.stop')}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

const EMPTY: BackgroundTask[] = []
