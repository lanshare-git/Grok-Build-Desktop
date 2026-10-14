import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { closeAgentSession, exportSessionMarkdown, exportSessionTrace } from '../actions'
import { useStore } from '../store'
import { sessionDisplayTitle } from '../utils'
import type { SessionMeta } from '@shared/types'
import { IconDownload, IconFile, IconFolder, IconPower, IconTrash } from './Icons'

/** 「移动到工作目录」的候选目标 */
export interface MoveTarget {
  key: string
  label: string
  path: string
}

/**
 * 会话工具菜单 —— 补齐终端 `grok export` / `grok trace` 的桌面入口，
 * 外加一个 ACP `session/close`（卸载）：只释放 agent 进程里该会话的副本，
 * 磁盘数据与会话列表都不动，下次打开会重新加载历史。
 *
 * 「移动到工作目录」= 把会话的落盘目录搬到目标 cwd 下（grok 没有改会话目录的接口，
 * 只能搬磁盘；实证见 main/session-move.ts）。侧栏里也可以直接把会话拖到分组上。
 *
 * 定位与 session-preview 一致：position:fixed + getBoundingClientRect，
 * 避免被侧栏滚动容器裁剪。
 */
export default function SessionToolsMenu({
  session,
  anchor,
  onClose,
  moveTargets,
  onRequestMove,
  onRequestDelete
}: {
  session: SessionMeta
  anchor: HTMLElement | null
  onClose: () => void
  /** 可搬运的目标工作目录（已排除它自己所在的那个） */
  moveTargets: MoveTarget[]
  onRequestMove: (toCwd: string, label: string) => void
  /** 交给侧栏既有的删除确认流程（两档勾选 + 回收站），不在这里重写一套 */
  onRequestDelete: () => void
}): JSX.Element | null {
  const loadedSessions = useStore((s) => s.loadedSessions)
  const running = useStore((s) => s.running)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  useLayoutEffect(() => {
    if (!anchor) return
    const place = (): void => {
      const r = anchor.getBoundingClientRect()
      const width = 232
      setPos({
        top: Math.min(r.bottom + 4, Math.max(12, window.innerHeight - 380)),
        left: Math.min(r.right + 6, window.innerWidth - width - 12)
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor])

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (menuRef.current?.contains(e.target as Node)) return
      if (anchor?.contains(e.target as Node)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [anchor, onClose])

  if (!pos) return null

  const title = sessionDisplayTitle(session)
  const isLoaded = loadedSessions.includes(session.id)
  // 生成中不允许卸载：那一回合还占着 agent 的会话 actor，关掉会打断输出
  const isRunning = running.includes(session.id)

  const doExport = async (): Promise<void> => {
    setBusy('export')
    setNote(null)
    try {
      const res = await exportSessionMarkdown({ id: session.id, cwd: session.cwd, title })
      if (res.ok) {
        setNote(`已导出到 ${res.path}`)
        if (res.path) void window.grok.revealPath(res.path)
      } else if (res.message) {
        setNote(`导出失败：${res.message}`)
      }
    } finally {
      setBusy(null)
    }
  }

  const doTrace = async (): Promise<void> => {
    setBusy('trace')
    setNote(null)
    try {
      const res = await exportSessionTrace({ id: session.id, cwd: session.cwd })
      if (res.ok) {
        setNote(`诊断包已生成：${res.path}`)
        if (res.path) void window.grok.revealPath(res.path)
      } else {
        setNote(`导出失败：${res.message ?? res.path ?? '未知错误'}`)
      }
    } finally {
      setBusy(null)
    }
  }

  const doClose = async (): Promise<void> => {
    setBusy('close')
    try {
      await closeAgentSession(session.id)
      setNote('已从 agent 卸载（磁盘数据保留）')
    } catch (err) {
      setNote(`卸载失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="account-menu session-tools" ref={menuRef} style={pos} role="menu">
      <div className="account-menu-head">
        <div className="account-menu-name">{title}</div>
        <div className="account-menu-status">{session.cwd}</div>
      </div>

      <button
        className="account-menu-item"
        role="menuitem"
        disabled={busy !== null}
        onClick={() => void doExport()}
      >
        <IconFile size={15} />
        {busy === 'export' ? '导出中…' : '导出为 Markdown'}
      </button>

      <button
        className="account-menu-item"
        role="menuitem"
        disabled={busy !== null || session.isDraft}
        title={session.isDraft ? '草稿会话尚未落盘，无法导出诊断包' : '导出诊断数据（只落本地，不上传）'}
        onClick={() => void doTrace()}
      >
        <IconDownload size={15} />
        {busy === 'trace' ? '打包中…' : '导出诊断包'}
      </button>

      <button
        className="account-menu-item"
        role="menuitem"
        disabled={busy !== null || !isLoaded || isRunning}
        title={
          isRunning
            ? '正在生成中，无法卸载'
            : isLoaded
              ? '释放 agent 进程内该会话占用的内存，磁盘数据保留（当前会话会立即重新加载）'
              : '该会话当前不在 agent 进程内，无需卸载'
        }
        onClick={() => void doClose()}
      >
        <IconPower size={15} />
        {busy === 'close' ? '卸载中…' : '卸载会话（保留数据）'}
      </button>

      <div className="account-menu-sep" />

      {moveTargets.length > 0 && (
        <>
          <div className="account-menu-label">移动到工作目录</div>
          <div className="session-tools-moves">
            {moveTargets.map((t) => (
              <button
                key={t.key}
                className="account-menu-item"
                role="menuitem"
                disabled={busy !== null || isRunning}
                title={
                  isRunning
                    ? '正在生成中，等这一轮结束再移动'
                    : `把该会话的磁盘记录搬到 ${t.path}，之后就在这个目录里跑`
                }
                onClick={() => onRequestMove(t.path, t.label)}
              >
                <IconFolder size={15} />
                <span className="session-tools-move-label">{t.label}</span>
              </button>
            ))}
          </div>
          <div className="account-menu-sep" />
        </>
      )}

      <button
        className="account-menu-item is-danger"
        role="menuitem"
        disabled={busy !== null}
        title="删除会话（可选择是否连磁盘一起删除）"
        onClick={() => {
          onClose()
          onRequestDelete()
        }}
      >
        <IconTrash size={15} />
        删除会话
      </button>

      {note && <div className="account-menu-note">{note}</div>}
    </div>
  )
}