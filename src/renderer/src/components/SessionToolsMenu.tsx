import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import {
  closeAgentSession,
  exportSessionMarkdown,
  exportSessionTrace,
  resumeSession
} from '../actions'
import { useT } from '../i18n'
import { useStore } from '../store'
import { sessionDisplayTitle } from '../utils'
import type { SessionMeta } from '@shared/types'
import { IconDownload, IconFile, IconFolder, IconLongShot, IconPower, IconTrash } from './Icons'

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
 * 排障项（长截屏、导出诊断包）默认隐藏：打开菜单后按 Shift，或 Shift+右键打开才露出。
 *
 * 「移动到工作目录」= 把会话的落盘目录搬到目标 cwd 下（grok 没有改会话目录的接口，
 * 只能搬磁盘；实证见 main/session-move.ts）。侧栏里也可以直接把会话拖到分组上。
 *
 * 由侧栏会话行右键打开；定位用鼠标坐标（position:fixed），避免被侧栏滚动容器裁剪。
 */
export default function SessionToolsMenu({
  session,
  point,
  onClose,
  moveTargets,
  onRequestMove,
  onRequestDelete,
  /** 打开菜单时是否已按着 Shift（Shift+右键可立刻露出排障项） */
  openedWithShift = false
}: {
  session: SessionMeta
  /** 右键落点（viewport 坐标） */
  point: { x: number; y: number }
  onClose: () => void
  /** 可搬运的目标工作目录（已排除它自己所在的那个） */
  moveTargets: MoveTarget[]
  onRequestMove: (toCwd: string, label: string) => void
  /** 交给侧栏既有的删除确认流程（两档勾选 + 回收站），不在这里重写一套 */
  onRequestDelete: () => void
  openedWithShift?: boolean
}): JSX.Element | null {
  const loadedSessions = useStore((s) => s.loadedSessions)
  const running = useStore((s) => s.running)
  const t = useT()
  const locale = useStore((s) => s.locale)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  // 排障项（长截屏 / 诊断包）默认隐藏；按住 Shift 或 Shift+右键打开后露出，本菜单关闭前保持显示
  const [showTroubleshoot, setShowTroubleshoot] = useState(openedWithShift)

  useLayoutEffect(() => {
    const place = (): void => {
      const width = 232
      setPos({
        top: Math.min(point.y, Math.max(12, window.innerHeight - 380)),
        left: Math.min(point.x, window.innerWidth - width - 12)
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [point.x, point.y])

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (menuRef.current?.contains(e.target as Node)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Shift') setShowTroubleshoot(true)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  if (!pos) return null

  const title = sessionDisplayTitle(session, locale)
  const isLoaded = loadedSessions.includes(session.id)
  // 生成中不允许卸载：那一回合还占着 agent 的会话 actor，关掉会打断输出
  const isRunning = running.includes(session.id)

  const doExport = async (): Promise<void> => {
    setBusy('export')
    setNote(null)
    try {
      const res = await exportSessionMarkdown({ id: session.id, cwd: session.cwd, title })
      if (res.ok) {
        setNote(t('sessionTools.exported', { path: String(res.path) }))
        if (res.path) void window.grok.revealPath(res.path)
      } else if (res.message) {
        setNote(t('sessionTools.failed', { message: res.message }))
      }
    } finally {
      setBusy(null)
    }
  }

  const doLongShot = async (): Promise<void> => {
    setBusy('longShot')
    setNote(null)
    try {
      // 必须先打开该会话：长截屏画的是 ChatView 里正在显示的内容
      if (useStore.getState().activeId !== session.id) {
        await resumeSession(session.id, session.cwd)
      }
      useStore.getState().beginLongShotPick(session.id)
      onClose()
    } catch (err) {
      setNote(
        t('sessionTools.failed', {
          message: err instanceof Error ? err.message : String(err)
        })
      )
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
        setNote(t('sessionTools.traceDone', { path: String(res.path) }))
        if (res.path) void window.grok.revealPath(res.path)
      } else {
        setNote(t('sessionTools.failed', { message: res.message ?? res.path ?? t('sessionTools.unknownError') }))
      }
    } finally {
      setBusy(null)
    }
  }

  const doClose = async (): Promise<void> => {
    setBusy('close')
    try {
      await closeAgentSession(session.id)
      setNote(t('sessionTools.unloaded'))
    } catch (err) {
      setNote(t('sessionTools.unloadFailed', { message: err instanceof Error ? err.message : String(err) }))
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
        {busy === 'export' ? t('sessionTools.exporting') : t('sessionTools.exportMarkdown')}
      </button>

      {showTroubleshoot && (
        <>
          <button
            className="account-menu-item"
            role="menuitem"
            disabled={busy !== null || session.isDraft}
            title={
              session.isDraft ? t('sessionTools.traceTitleDraft') : t('sessionTools.longShotTitle')
            }
            onClick={() => void doLongShot()}
          >
            <IconLongShot size={15} />
            {busy === 'longShot' ? t('chat.longShotCapturing') : t('sessionTools.longShot')}
          </button>

          <button
            className="account-menu-item"
            role="menuitem"
            disabled={busy !== null || session.isDraft}
            title={session.isDraft ? t('sessionTools.traceTitleDraft') : t('sessionTools.traceTitle')}
            onClick={() => void doTrace()}
          >
            <IconDownload size={15} />
            {busy === 'trace' ? t('sessionTools.tracing') : t('sessionTools.trace')}
          </button>
        </>
      )}

      <button
        className="account-menu-item"
        role="menuitem"
        disabled={busy !== null || !isLoaded || isRunning}
        title={
          isRunning
            ? t('sessionTools.unloadTitleRunning')
            : isLoaded
              ? t('sessionTools.unloadTitleLoaded')
              : t('sessionTools.unloadTitleUnloaded')
        }
        onClick={() => void doClose()}
      >
        <IconPower size={15} />
        {busy === 'close' ? t('sessionTools.unloading') : t('sessionTools.unload')}
      </button>

      <div className="account-menu-sep" />

      {moveTargets.length > 0 && (
        <>
          <div className="account-menu-label">{t('sessionTools.moveLabel')}</div>
          <div className="session-tools-moves">
            {moveTargets.map((target) => (
              <button
                key={target.key}
                className="account-menu-item"
                role="menuitem"
                disabled={busy !== null || isRunning}
                title={
                  isRunning
                    ? t('sessionTools.moveTitleRunning')
                    : t('sessionTools.moveTitle', { path: target.path })
                }
                onClick={() => onRequestMove(target.path, target.label)}
              >
                <IconFolder size={15} />
                <span className="session-tools-move-label">{target.label}</span>
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
        title={t('sessionTools.deleteTitle')}
        onClick={() => {
          onClose()
          onRequestDelete()
        }}
      >
        <IconTrash size={15} />
        {t('sessionTools.delete')}
      </button>

      {note && <div className="account-menu-note">{note}</div>}
    </div>
  )
}