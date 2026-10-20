import { useEffect, useMemo, useRef, useState } from 'react'

import {
  cleanError,
  getDeletePurgeDefault,
  moveSessionToWorkspace,
  newChatSession,
  newSession,
  purgeSessionData,
  resumeSession
} from '../actions'
import { useT } from '../i18n'
import { useStore } from '../store'
import {
  basename,
  groupSessionsByWorkspace,
  isUnsentDraft,
  relativeTime,
  sameDir,
  sessionActivityAt,
  sessionDisplayTitle
} from '../utils'
import type { WorkspaceGroup } from '../utils'
import type { SessionMeta, SessionSearchHit } from '@shared/types'
import ConfirmDialog from './ConfirmDialog'
import type { ConfirmSpec } from './ConfirmDialog'
import AccountMenu from './AccountMenu'
import DirPickerMenu from './DirPickerMenu'
import SessionToolsMenu from './SessionToolsMenu'
import WorkspaceToolsMenu from './WorkspaceToolsMenu'
import {
  IconChevron,
  IconChat,
  IconClose,
  IconEdit,
  IconFolder,
  IconPlus,
  IconSearch
} from './Icons'

/** 会话行状态（对齐 Cursor：橙待处理 > 输出中 > 蓝未读 > 灰空闲） */
type SessionStatus = 'pending' | 'running' | 'unread' | 'done'

/** 悬停会话行时浮出的详情卡：完整标题被截断时仍能看清全名，并补上行内放不下的信息 */
interface PreviewSpec {
  sessionId: string
  top: number
  left: number
}

/** 卡片贴在侧栏右侧，与悬停行顶部对齐 */
const PREVIEW_WIDTH = 300
const PREVIEW_DELAY = 380
/** 离开会话行 / 卡片后稍等再收：给鼠标跨过侧栏与卡片之间的空隙，去点「打开」 */
const PREVIEW_HIDE_DELAY = 220

export default function Sidebar(): JSX.Element {
  const sessions = useStore((s) => s.sessions)
  const workspaces = useStore((s) => s.workspaces)
  const collapsedGroups = useStore((s) => s.collapsedGroups)
  const activeId = useStore((s) => s.activeId)
  const running = useStore((s) => s.running)
  const unreadSessionIds = useStore((s) => s.unreadSessionIds)
  // 待用户响应的两种来源（工具待批准 / grok 主动提问），各按 sessionId 归属，
  // 可同时落在不同任务上——侧栏据此给对应任务打「待响应」标记。
  const permissions = useStore((s) => s.permissions)
  const questions = useStore((s) => s.questions)
  const removeSession = useStore((s) => s.deleteSession)
  const renameSession = useStore((s) => s.renameSession)
  const toggleGroup = useStore((s) => s.toggleGroup)
  const renameWorkspace = useStore((s) => s.renameWorkspace)
  const removeWorkspace = useStore((s) => s.removeWorkspace)
  /** 左下角账号入口展示用：优先姓名，其次邮箱；null = 未登录（其余入口都在账号菜单里） */
  const account = useStore((s) => s.account)
  /** 用户主目录：聊天组的归属目录（纯聊天会话永远以它为根） */
  const homeDir = useStore((s) => s.homeDir)
  const t = useT()
  const locale = useStore((s) => s.locale)

  /** 正在改别名的分组（存 group.key），以及输入框里的草稿 */
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  /** 正在改名的会话（存 session.id）与草稿 */
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [sessionDraft, setSessionDraft] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  /** 删除前的二次确认弹窗 */
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null)
  /** 删除会话时是否连磁盘一起删（初值来自设置中心的配置，默认 true；记住本次运行内的改动） */
  const [purgeOnDelete, setPurgeOnDelete] = useState(true)
  /** 悬停详情卡（延迟弹出；离开行/卡后短延迟再收，便于移入卡片点「打开」） */
  const [preview, setPreview] = useState<PreviewSpec | null>(null)
  const previewTimer = useRef<number | null>(null)
  const previewHideTimer = useRef<number | null>(null)
  /** 左下角账号菜单的展开状态与锚点（头像行按钮） */
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const accountRef = useRef<HTMLButtonElement | null>(null)
  /** 「新建任务」的目录选择弹层（锚点为顶部新建按钮） */
  const [dirMenuOpen, setDirMenuOpen] = useState(false)
  const newTaskRef = useRef<HTMLButtonElement | null>(null)
  /** 会话搜索：查询词 + 主进程返回的命中（标题命中优先，其次正文片段） */
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SessionSearchHit[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [toolsFor, setToolsFor] = useState<{
    session: SessionMeta
    point: { x: number; y: number }
    shift: boolean
  } | null>(null)
  /** 工作目录行「更多」（改别名 / 移除） */
  const [wsToolsFor, setWsToolsFor] = useState<{
    group: WorkspaceGroup
    point: { x: number; y: number }
  } | null>(null)
  /**
   * 会话拖拽搬移：正在拖的会话 id + 当前悬停的目标分组 key。
   * 目标目录由 group.path 决定，落盘目录的搬运在主进程做（见 actions.moveSessionToWorkspace）。
   */
  const [dragSessionId, setDragSessionId] = useState<string | null>(null)
  const [dropKey, setDropKey] = useState<string | null>(null)

  // 删除弹窗里「同时删除磁盘文件」的初值来自设置中心（默认 true）。
  // 挂载时读一次即可：用户若在设置里改过，下次打开弹窗就是新默认值。
  useEffect(() => {
    let alive = true
    void getDeletePurgeDefault().then((v) => {
      if (alive) setPurgeOnDelete(v)
    })
    return () => {
      alive = false
    }
  }, [])

  // 搜索：防抖 220ms 触发，且**只搜前 120 个会话**（侧栏本身最多保留 60 个会话元数据，
  // 顺序即活动排序，足够覆盖「最近做过的事」）。正文扫描在主进程侧流式进行。
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setHits(null)
      setSearching(false)
      return
    }
    let alive = true
    setSearching(true)
    const timer = window.setTimeout(() => {
      void window.grok
        .sessionSearch(
          q,
          sessions
            .filter((s) => !s.isDraft)
            .slice(0, 120)
            .map((s) => ({ sessionId: s.id, cwd: s.cwd, title: sessionDisplayTitle(s, locale) }))
        )
        .then((res) => {
          if (alive) setHits(res)
        })
        .catch(() => {
          if (alive) setHits([])
        })
    }, 220)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [query, sessions, locale])

  const hitIds = hits ? new Set(hits.map((h) => h.sessionId)) : null
  const hitSnippet = (id: string): string | null =>
    hits?.find((h) => h.sessionId === id && h.where === 'content')?.snippet ?? null

  // 搜索态下只展示命中的会话；分组结构保留，避免整页塌成一张平铺列表。
  // 未发消息的本地草稿不进侧栏（主区仍是空白聊天；首发 materialize 后才出现）。
  const visibleSessions = (hitIds ? sessions.filter((s) => hitIds.has(s.id)) : sessions).filter(
    (s) => !isUnsentDraft(s)
  )
  const groups = useMemo(
    () => groupSessionsByWorkspace(visibleSessions, workspaces, homeDir, locale),
    [visibleSessions, workspaces, homeDir, locale]
  )

  // 优先级：待你处理 > 输出中 > 做完未读 > 空闲（对齐 Cursor）
  // 等待批准时 running 仍可能为 true，所以 pending 要先判。
  const statusOf = (id: string): SessionStatus =>
    permissions.some((p) => p.sessionId === id) || questions.some((q) => q.sessionId === id)
      ? 'pending'
      : running.includes(id)
        ? 'running'
        : unreadSessionIds.includes(id)
          ? 'unread'
          : 'done'

  const clearPreviewTimers = (): void => {
    if (previewTimer.current !== null) {
      window.clearTimeout(previewTimer.current)
      previewTimer.current = null
    }
    if (previewHideTimer.current !== null) {
      window.clearTimeout(previewHideTimer.current)
      previewHideTimer.current = null
    }
  }

  /** 立刻收起（点击会话 / 拖拽 / 开菜单等） */
  const cancelPreview = (): void => {
    clearPreviewTimers()
    setPreview(null)
  }

  /** 取消「即将收起」——鼠标回到会话行或进入详情卡时用 */
  const keepPreview = (): void => {
    if (previewHideTimer.current !== null) {
      window.clearTimeout(previewHideTimer.current)
      previewHideTimer.current = null
    }
  }

  /** 离开交互区后短延迟再收，避免跨空隙时卡片先没了 */
  const scheduleHidePreview = (): void => {
    if (previewHideTimer.current !== null) window.clearTimeout(previewHideTimer.current)
    previewHideTimer.current = window.setTimeout(() => {
      previewHideTimer.current = null
      if (previewTimer.current !== null) {
        window.clearTimeout(previewTimer.current)
        previewTimer.current = null
      }
      setPreview(null)
    }, PREVIEW_HIDE_DELAY)
  }

  const schedulePreview = (
    id: string,
    el: HTMLElement
  ): void => {
    keepPreview()
    if (previewTimer.current !== null) {
      window.clearTimeout(previewTimer.current)
      previewTimer.current = null
    }
    // 已在显示同一会话时只续命，不重算位置、不重播延迟动画
    if (preview?.sessionId === id) return
    // 换到另一行：先收掉旧卡，再按延迟弹出新卡（与原先 cancel→schedule 一致）
    if (preview) setPreview(null)
    const rect = el.getBoundingClientRect()
    // 左右都向内收，窗口很窄时也保证卡片完整可见
    const left = Math.min(rect.right + 10, window.innerWidth - PREVIEW_WIDTH - 12)
    const top = Math.min(Math.max(rect.top - 4, 12), Math.max(window.innerHeight - 150, 12))
    previewTimer.current = window.setTimeout(() => setPreview({ sessionId: id, top, left }), PREVIEW_DELAY)
  }

  useEffect(() => {
    // 卡片坐标是悬停那一刻算的：窗口一变化就不准了，直接收掉
    const onResize = (): void => cancelPreview()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      clearPreviewTimers()
    }
  }, [])

  const flash = (text: string): void => {
    setHint(text)
    window.setTimeout(() => setHint((current) => (current === text ? null : current)), 3600)
  }

  const startRename = (group: WorkspaceGroup): void => {
    setEditingKey(group.key)
    // 已有别名就从别名开始改，否则留空（placeholder 显示目录名）
    setDraft(group.aliased ? group.label : '')
  }

  const commitRename = (group: WorkspaceGroup): void => {
    renameWorkspace(group.path, draft)
    setEditingKey(null)
  }

  /** 改会话名：预填「当前显示名」（自定义名优先，否则用 grok 的自动标题），不必重打一遍 */
  const startRenameSession = (session: SessionMeta): void => {
    setEditingSessionId(session.id)
    setSessionDraft(sessionDisplayTitle(session, locale))
  }

  const commitRenameSession = (session: SessionMeta): void => {
    renameSession(session.id, sessionDraft)
    setEditingSessionId(null)
  }

  /** 移除工作目录：目录下还有会话时不能移除，改为说明原因 */
  const handleRemoveGroup = (group: WorkspaceGroup): void => {
    if (group.sessions.length > 0) {
      setConfirm({
        title: t('sidebar.confirm.blockedTitle'),
        message: (
          <>
            {t('sidebar.confirm.blockedMsgA')}
            <strong>{group.label}</strong>
            {t('sidebar.confirm.blockedMsgB', { n: group.sessions.length })}
          </>
        ),
        detail: (
          <>
            {t('sidebar.confirm.blockedDetailA')}
            <code className="inline-code">session/new</code>
            {t('sidebar.confirm.blockedDetailB')}
          </>
        ),
        confirmText: t('sidebar.confirm.gotIt')
      })
      return
    }

    setConfirm({
      title: t('sidebar.confirm.removeTitle'),
      message: (
        <>
          {t('sidebar.confirm.removeMsgA')}
          <strong>{group.label}</strong>
          {t('sidebar.confirm.removeMsgB')}
        </>
      ),
      detail: group.aliased
        ? t('sidebar.confirm.removeDetailAliased', { label: group.label, path: group.path })
        : t('sidebar.confirm.removeDetail', { path: group.path }),
      confirmText: t('sidebar.confirm.remove'),
      cancelText: t('common.cancel'),
      danger: true,
      onConfirm: () => {
        removeWorkspace(group.path)
        flash(t('sidebar.flash.workspaceRemoved', { path: group.path }))
      }
    })
  }

  /**
   * 删除会话的确认弹窗。勾选框要**在弹窗内实时生效**（按钮文案随之变化），
   * 所以把「重建 spec」写成函数，勾选变化时用函数式 setConfirm 就地替换 ——
   * 直接闭包捕获 purge 会拿到过期值，按钮文案会跟勾选状态对不上。
   */
  function buildRemoveSpec(session: SessionMeta, purge: boolean): ConfirmSpec {
    const isActive = session.id === activeId
    const isRunning = running.includes(session.id)
    const onDisk = !session.isDraft
    const willPurge = purge && onDisk

    return {
      title: willPurge ? t('sidebar.confirm.deleteTitlePurge') : t('sidebar.confirm.deleteTitle'),
      message: (
        <>
          {t('sidebar.confirm.deleteMsgA')}
          <strong>{sessionDisplayTitle(session, locale)}</strong>
          {t('sidebar.confirm.deleteMsgB', { n: session.items.length })}
        </>
      ),
      // 三个提示都是条件渲染：全不命中时要给 undefined，
      // 否则 ConfirmDialog 会渲染出一个空的灰底 .confirm-detail 框。
      detail:
        isRunning || isActive || !onDisk ? (
          <>
            {isRunning && <div className="confirm-warn">{t('sidebar.confirm.deleteWarnRunning')}</div>}
            {isActive && <div className="confirm-warn">{t('sidebar.confirm.deleteWarnActive')}</div>}
            {!onDisk && <div>{t('sidebar.confirm.deleteDraftNote')}</div>}
          </>
        ) : undefined,
      option: onDisk
        ? {
            label: t('sidebar.confirm.purgeOption'),
            hint: t('sidebar.confirm.purgeHint'),
            checked: purge,
            onChange: (v) => {
              setPurgeOnDelete(v)
              setConfirm((current) => (current ? buildRemoveSpec(session, v) : current))
            }
          }
        : undefined,
      confirmText: willPurge ? t('sidebar.confirm.deleteConfirmPurge') : t('sidebar.confirm.deleteConfirmList'),
      cancelText: t('common.cancel'),
      danger: true,
      onConfirm: () => {
        void runRemoveSession(session, purge)
      }
    }
  }

  async function runRemoveSession(session: SessionMeta, purge: boolean): Promise<void> {
    const title = sessionDisplayTitle(session, locale)
    if (purge && !session.isDraft) {
      // **删除前先卸载会话**：grok agent 还持有它时，落盘目录会被占用 ——
      // 一级回收站/二级搬移都可能被句柄拦下；更糟的是删完 grok 会把目录**重建为空壳**，
      // 留下「看着在、点开报 Path not found」的死条目（2026-10-14 事故）。
      // 与 moveSessionToWorkspace 的先卸载策略保持一致。
      const store = useStore.getState()
      if (store.loadedSessions.includes(session.id)) {
        try {
          await window.grok.closeSession(session.id)
        } catch (err) {
          // 卸载失败不放弃删除：删不掉会走下面的失败分支，如实告知
          store.pushLog(`[session-delete] 卸载会话失败：${cleanError(err)}\n`)
        }
        store.forgetLoadedSession(session.id)
      }

      const res = await purgeSessionData(session)
      if (!res.ok) {
        // 删不掉时**不自动**降级成「只移列表」：那会给人「已经删干净了」的错觉，
        // 而磁盘上那个目录还在（多半是 grok 正占用），下次启动又冒出来。
        // 但也不能把用户堵死 —— 弹第二个对话框，让他自己选要不要退一步。
        setConfirm({
          title: t('sidebar.confirm.deleteFailedTitle'),
          message: (
            <>
              {t('sidebar.confirm.deleteFailedMsgA')}
              <strong>{title}</strong>
              {t('sidebar.confirm.deleteFailedMsgB')}
              <br />
              {res.reason}
            </>
          ),
          detail: t('sidebar.confirm.deleteFailedDetail'),
          confirmText: t('sidebar.confirm.deleteFailedConfirm'),
          cancelText: t('sidebar.confirm.deleteFailedCancel'),
          danger: true,
          onConfirm: () => {
            removeSession(session.id)
            flash(t('sidebar.flash.removedFromList', { title }))
          }
        })
        return
      }
      removeSession(session.id)
      if (res.staleShell) {
        // 数据确实删掉了，只是原目录留了个删不掉的空壳（grok 占用）。如实说明，
        // 别让用户以为「没删干净」——主进程已经尽力清过一次。
        useStore
          .getState()
          .pushLog(`[session-delete] 原目录残留空壳（不含数据）：${res.staleShell}`)
        flash(t('sidebar.flash.deletedWithShellLeft', { title }))
      } else if (res.method === 'quarantine') {
        // 真出现这条说明系统回收站删不掉（且文件确实还在）。落点写进日志，方便找回。
        useStore
          .getState()
          .pushLog(`[session-delete] 已移入应用内回收站：${res.quarantinePath}`)
        flash(t('sidebar.flash.deletedToQuarantine', { title }))
      } else {
        flash(t('sidebar.flash.deletedFully', { title }))
      }
      return
    }
    removeSession(session.id)
    flash(t('sidebar.flash.removedFromList', { title }))
  }

  /**
   * 把会话搬到另一个工作目录（拖拽到分组上，或从「更多」菜单里选）。
   *
   * grok / ACP 没有「改会话工作目录」的接口，实际做法是把会话的落盘目录搬到目标
   * cwd 的编码目录下，再以新 cwd 加载（详见 actions.moveSessionToWorkspace）。
   * 因此这里必须先讲清楚「会影响什么」，再让用户确认 —— 这是一次真实的磁盘搬家。
   */
  const handleMoveSession = (session: SessionMeta, toCwd: string, groupLabel: string): void => {
    if (sameDir(session.cwd, toCwd)) return
    const title = sessionDisplayTitle(session, locale)
    if (running.includes(session.id)) {
      flash(t('sidebar.flash.sessionRunning'))
      return
    }
    setConfirm({
      title: t('sidebar.confirm.moveTitle'),
      message: (
        <>
          {t('sidebar.confirm.moveMsgA')}
          <strong>{title}</strong>
          {t('sidebar.confirm.moveMsgB')}
          <strong>{groupLabel}</strong>
          {t('sidebar.confirm.moveMsgC')}
        </>
      ),
      detail: (
        <>
          <div className="confirm-path">
            {session.cwd} → {toCwd}
          </div>
          {session.isDraft ? (
            <div>{t('sidebar.confirm.moveDraft')}</div>
          ) : (
            <div>{t('sidebar.confirm.moveDetail')}</div>
          )}
          {session.kind === 'chat' && sameDir(session.cwd, homeDir ?? '') && (
            <div className="confirm-warn">{t('sidebar.confirm.moveChatWarn')}</div>
          )}
          {session.id === activeId && <div>{t('sidebar.confirm.moveActiveNote')}</div>}
        </>
      ),
      confirmText: t('sidebar.confirm.move'),
      cancelText: t('common.cancel'),
      onConfirm: () => {
        void (async () => {
          const res = await moveSessionToWorkspace(session, toCwd)
          flash(res.ok ? t('sidebar.flash.moved', { title, label: groupLabel }) : t('sidebar.flash.moveFailed', { message: res.message }))
        })()
      }
    })
  }

  /** 拖拽搬移：目标分组是否可接收（拖自己所在的目录没有意义） */
  const canDropInto = (group: WorkspaceGroup): boolean => {
    if (!dragSessionId) return false
    const dragged = sessions.find((x) => x.id === dragSessionId)
    return !!dragged && !sameDir(dragged.cwd, group.path)
  }

  const endDrag = (): void => {
    setDragSessionId(null)
    setDropKey(null)
  }

  // 卡片内容取 store 里的实时会话（悬停期间状态/标题可能变），而不是进队列那一刻的快照
  const previewSession = preview
    ? (sessions.find((x) => x.id === preview.sessionId) ?? null)
    : null
  const previewStatus: SessionStatus = previewSession ? statusOf(previewSession.id) : 'done'

  // 会话落盘路径：悬停时向主进程按需计算（~/.grok/sessions/<编码cwd>/<sessionId>）；草稿未落盘
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const [pathCopied, setPathCopied] = useState(false)
  useEffect(() => {
    setPreviewPath(null)
    setPathCopied(false)
    if (!previewSession || previewSession.isDraft) return
    let alive = true
    void window.grok.sessionStoragePath(previewSession.cwd, previewSession.id).then((p) => {
      if (alive) setPreviewPath(p)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewSession?.id])

  return (
    <aside className="sidebar">
      <button
        ref={newTaskRef}
        className="btn btn-primary btn-block"
        onClick={() => setDirMenuOpen((v) => !v)}
      >
        <IconPlus />
        {t('sidebar.newTask')}
      </button>

      <button
        className="btn btn-ghost btn-block"
        onClick={() => void newChatSession()}
        title={t('sidebar.newChatLongTitle')}
      >
        <IconChat />
        {t('chat.newChat')}
      </button>

      <div className="sidebar-search">
        <IconSearch size={13} />
        <input
          value={query}
          spellCheck={false}
          placeholder={t('sidebar.searchPlaceholder')}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setQuery('')
          }}
        />
        {searching && <span className="sidebar-search-flag">…</span>}
        {query && !searching && (
          <button
            className="icon-btn"
            title={t('sidebar.clearSearch')}
            onClick={() => setQuery('')}
          >
            <IconClose size={12} />
          </button>
        )}
      </div>
      {hits && (
        <div className="sidebar-search-hint">
          {t('sidebar.searchHits', { n: hits.length })}
        </div>
      )}

      <div className="sidebar-section-label">{t('sidebar.workspacesLabel')}</div>

      {/* 列表滚动时行会移动，卡片的固定坐标就失效了，直接收掉 */}
      <div className="session-list" onScroll={cancelPreview}>
        {groups.length === 0 && <div className="session-empty">{t('sidebar.noSessions')}</div>}

        {groups.map((group) => {
          // 聊天组同样允许折叠/展开（只是永远置顶）
          const isCollapsed = collapsedGroups.includes(group.key)
          const isEditing = editingKey === group.key

          return (
            <div
              className={`ws-group${dropKey === group.key ? ' is-drop-target' : ''}`}
              key={group.key}
              onDragOver={(e) => {
                if (!canDropInto(group)) return
                // 必须 preventDefault，否则浏览器不允许 drop
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (dropKey !== group.key) setDropKey(group.key)
              }}
              onDragLeave={(e) => {
                // 只在真正离开这个分组时才熄灭高亮（子元素之间移动也会触发 dragleave）
                if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
                setDropKey((k) => (k === group.key ? null : k))
              }}
              onDrop={(e) => {
                if (!canDropInto(group)) return
                e.preventDefault()
                const id = dragSessionId ?? e.dataTransfer.getData('text/plain')
                const dragged = sessions.find((x) => x.id === id)
                endDrag()
                if (dragged) handleMoveSession(dragged, group.path, group.label)
              }}
            >
              <div
                className="ws-head"
                onClick={() => {
                  if (!isEditing) toggleGroup(group.key)
                }}
                onContextMenu={(e) => {
                  // 聊天组没有「改别名 / 移除」；改名中也不弹菜单
                  if (group.isHome || isEditing) return
                  e.preventDefault()
                  e.stopPropagation()
                  setWsToolsFor({ group, point: { x: e.clientX, y: e.clientY } })
                }}
                title={
                  group.isHome
                    ? t('sidebar.homeGroupTitle', { path: group.path })
                    : t('sidebar.groupTitle', { path: group.path, alias: group.aliased ? group.label : '' })
                }
              >
                <IconChevron
                  size={12}
                  className={`ws-caret${isCollapsed ? ' is-collapsed' : ''}`}
                />
                <IconFolder size={13} />

                {isEditing ? (
                  <input
                    className="ws-name-input"
                    autoFocus
                    value={draft}
                    placeholder={basename(group.path) || group.path}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => commitRename(group)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(group)
                      if (e.key === 'Escape') setEditingKey(null)
                    }}
                  />
                ) : (
                  <span
                    className="ws-name"
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      if (group.isHome) return
                      startRename(group)
                    }}
                  >
                    {group.label}
                  </span>
                )}

                {/* 操作区先于计数：按钮区宽度固定（见 .ws-actions），计数永远在最右。
                    改别名/移除改右键，行上只留 + */}
                <span className="ws-actions">
                  {group.isHome ? (
                    <button
                      className="icon-btn"
                      title={t('sidebar.newChatReadonly')}
                      onClick={(e) => {
                        e.stopPropagation()
                        void newChatSession()
                      }}
                    >
                      <IconPlus size={12} />
                    </button>
                  ) : (
                    <button
                      className="icon-btn"
                      title={t('sidebar.newTaskInDir', { path: group.path })}
                      onClick={(e) => {
                        e.stopPropagation()
                        void newSession(group.path)
                      }}
                    >
                      <IconPlus size={12} />
                    </button>
                  )}
                </span>

                {group.sessions.length > 0 && <span className="ws-count">{group.sessions.length}</span>}
              </div>

              {!isCollapsed && (
                <div className="ws-sessions">
{group.sessions.length === 0 && (
                  <div className="ws-empty">
                    {group.isHome ? t('sidebar.noChats') : t('sidebar.noSessions')}
                    <button
                      className="link"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (group.isHome) void newChatSession()
                        else void newSession(group.path)
                      }}
                    >
                      {group.isHome ? t('chat.newChat') : t('sidebar.newHere')}
                    </button>
                  </div>
                )}

                  {group.sessions.map((session) => {
                    const title = sessionDisplayTitle(session, locale)
                    const isRenaming = editingSessionId === session.id
                    const status = statusOf(session.id)

                    return (
                      <div
                        key={session.id}
                        className={`session-item${session.id === activeId ? ' is-active' : ''}${
                          status === 'pending' ? ' is-pending' : ''
                        }${dragSessionId === session.id ? ' is-dragging' : ''}`}
                        /* 拖到别的分组 = 换工作目录（改名前不拖，避免和输入框抢事件） */
                        draggable={!isRenaming}
                        onDragStart={(e) => {
                          cancelPreview()
                          setDragSessionId(session.id)
                          e.dataTransfer.effectAllowed = 'move'
                          // 兜底载荷：内部 state 丢失时还能从 dataTransfer 拿回会话 id
                          e.dataTransfer.setData('text/plain', session.id)
                          // 生成中的会话搬不了（grok 正占着会话 actor，搬目录会打断这一轮）。
                          // 拖起的瞬间就说明，别等用户拖到目标分组放下后才被告知白拖了
                          if (running.includes(session.id)) {
                            flash(t('sidebar.flash.sessionRunningDrag'))
                          }
                        }}
                        onDragEnd={endDrag}
                        onMouseEnter={(e) => {
                          // 改名中不弹：输入框正在抢焦点，卡片只会挡视线；拖拽中也不弹
                          if (!isRenaming && !dragSessionId) {
                            schedulePreview(session.id, e.currentTarget)
                          }
                        }}
                        onMouseLeave={scheduleHidePreview}
                        onClick={() => {
                          cancelPreview()
                          if (isRenaming) return
                          if (session.id !== activeId) {
                            // 草稿会话只是本地空壳，直接选中即可；真实会话才去 loadSession
                            if (session.isDraft) useStore.getState().selectSession(session.id)
                            else void resumeSession(session.id, session.cwd)
                          }
                        }}
                        onContextMenu={(e) => {
                          if (isRenaming) return
                          e.preventDefault()
                          e.stopPropagation()
                          cancelPreview()
                          setToolsFor({
                            session,
                            point: { x: e.clientX, y: e.clientY },
                            shift: e.shiftKey
                          })
                        }}
                      >
                        <div className="session-item-main">
                          <span
                            className={`session-dot status-${status}`}
                            title={
                              status === 'pending'
                                ? t('sidebar.statusPending')
                                : status === 'running'
                                  ? t('sidebar.statusRunning')
                                  : status === 'unread'
                                    ? t('sidebar.statusUnread')
                                    : t('sidebar.statusDone')
                            }
                          />
                          <div className="session-item-body">
                            {isRenaming ? (
                              <input
                                className="session-name-input"
                                autoFocus
                                value={sessionDraft}
                                placeholder={session.title}
                                title={t('sidebar.renameInputTitle')}
                                onClick={(e) => e.stopPropagation()}
                                onFocus={(e) => e.currentTarget.select()}
                                onChange={(e) => setSessionDraft(e.target.value)}
                                onBlur={() => commitRenameSession(session)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') commitRenameSession(session)
                                  if (e.key === 'Escape') setEditingSessionId(null)
                                }}
                              />
                            ) : (
                              <div className="session-item-title-row">
                              <div
                                className="session-item-title"
                                /* 不挂原生 title：悬停详情卡已展示全名 + grok 原标题，再挂会叠两层重复 */
                                onDoubleClick={(e) => {
                                  e.stopPropagation()
                                  startRenameSession(session)
                                }}
                              >
                                {title}
                              </div>
                            </div>
                            )}
                            {!isRenaming && (
                              <div className="session-item-sub">
                                {/* 状态只靠左侧色点（+ title 提示），不再塞文字标签抢标题宽度 */}
                                <span>{relativeTime(sessionActivityAt(session), locale)}</span>
                              </div>
                            )}
                            {!isRenaming && hitSnippet(session.id) && (
                              <div className="session-item-hit" title={hitSnippet(session.id) ?? ''}>
                                {hitSnippet(session.id)}
                              </div>
                            )}
                          </div>
                        </div>
                        {/* 改名中不渲染操作按钮：一来用不上，二来它占的宽度会挤窄输入框。更多操作改右键菜单 */}
                        {!isRenaming && (
                          <span className="session-actions">
                            <button
                              className="icon-btn"
                              title={t('sidebar.renameSession')}
                              onClick={(e) => {
                                e.stopPropagation()
                                startRenameSession(session)
                              }}
                            >
                              <IconEdit size={13} />
                            </button>
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {preview && previewSession && (
        <div
          className="session-preview"
          style={{ top: preview.top, left: preview.left }}
          onMouseEnter={keepPreview}
          onMouseLeave={scheduleHidePreview}
        >
          <div className="session-preview-head">
            <span className="session-preview-title">{sessionDisplayTitle(previewSession, locale)}</span>
            {previewStatus !== 'done' && (
              <span className={`session-status-tag status-${previewStatus}`}>
                {previewStatus === 'pending'
                  ? t('sidebar.tagPending')
                  : previewStatus === 'running'
                    ? t('sidebar.tagRunning')
                    : t('sidebar.tagUnread')}
              </span>
            )}
            <span className="session-preview-time">{relativeTime(sessionActivityAt(previewSession), locale)}</span>
          </div>
          <div className="session-preview-cwd">
            <IconFolder size={12} />
            <span>{previewSession.cwd}</span>
          </div>
          {previewSession.isDraft ? (
            <div className="session-preview-file">
              <span className="file-label">{t('sidebar.preview.fileLabel')}</span>
              <span className="file-path muted">{t('sidebar.preview.notPersisted')}</span>
            </div>
          ) : (
            <div className="session-preview-file">
              <span className="file-label">{t('sidebar.preview.fileLabel')}</span>
              <span
                className="file-path"
                title={previewPath ? t('sidebar.preview.copyPathTitle', { path: previewPath }) : undefined}
                onClick={(e) => {
                  e.stopPropagation()
                  if (!previewPath) return
                  void navigator.clipboard.writeText(previewPath).then(() => {
                    setPathCopied(true)
                    window.setTimeout(() => setPathCopied(false), 1500)
                  })
                }}
              >
                {pathCopied ? `${t('common.copied')} ✓` : (previewPath ?? '…')}
              </span>
              <button
                className="file-open"
                title={t('sidebar.preview.openInExplorer')}
                disabled={!previewPath}
                onClick={(e) => {
                  e.stopPropagation()
                  if (previewPath) void window.grok.revealPath(previewPath)
                }}
              >
                {t('sidebar.preview.open')}
              </button>
            </div>
          )}
          {previewSession.customTitle && (
            <div className="session-preview-origin">{t('sidebar.preview.originalTitle', { title: previewSession.title })}</div>
          )}
        </div>
      )}

      {hint && <div className="ws-hint">{hint}</div>}

      <div className="sidebar-footer">
        {/* 左下角只保留账号入口：MCP / 连接状态 / 版本 / 关闭行为等全部收进点击后弹出的账号菜单，
            避免底部堆一排入口。连接状态与版本号在菜单里以「右对齐实时值」呈现。 */}
        <button
          className={`conn-row conn-account${accountMenuOpen ? ' is-active' : ''}`}
          ref={accountRef}
          onClick={() => setAccountMenuOpen((v) => !v)}
          title={account ? t('sidebar.account.menuTitle', { email: account.email ?? '' }) : t('sidebar.account.menuTitleLoggedOut')}
        >
          <span className="account-avatar">
            {account
              ? ([account.firstName, account.lastName].filter(Boolean).join('') ||
                  account.email ||
                  '?')[0].toUpperCase()
              : '?'}
          </span>
          <span className="conn-label">
            {account
              ? [account.firstName, account.lastName].filter(Boolean).join(' ') ||
                account.email ||
                t('sidebar.account.loggedIn')
              : t('sidebar.account.login')}
          </span>
        </button>
      </div>

      {toolsFor && (
        <SessionToolsMenu
          session={toolsFor.session}
          point={toolsFor.point}
          openedWithShift={toolsFor.shift}
          onClose={() => setToolsFor(null)}
          /* 可搬运的目标 = 其它工作目录（排除它自己所在的那个） */
          moveTargets={groups
            .filter((g) => !sameDir(g.path, toolsFor.session.cwd))
            .map((g) => ({ key: g.key, label: g.label, path: g.path }))}
          onRequestMove={(toCwd, label) => {
            const target = toolsFor.session
            setToolsFor(null)
            handleMoveSession(target, toCwd, label)
          }}
          onRequestDelete={() => {
            // 复用侧栏既有的删除确认（两档勾选 + 回收站兜底），不另起一套语义
            const target = toolsFor.session
            setConfirm(buildRemoveSpec(target, purgeOnDelete))
          }}
        />
      )}

      {wsToolsFor && (
        <WorkspaceToolsMenu
          group={wsToolsFor.group}
          point={wsToolsFor.point}
          onClose={() => setWsToolsFor(null)}
          onRequestRename={() => startRename(wsToolsFor.group)}
          onRequestRemove={() => handleRemoveGroup(wsToolsFor.group)}
        />
      )}

      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
      {accountMenuOpen && (
        <AccountMenu anchor={accountRef.current} onClose={() => setAccountMenuOpen(false)} />
      )}
      {dirMenuOpen && (
        <DirPickerMenu anchor={newTaskRef.current} onClose={() => setDirMenuOpen(false)} />
      )}
    </aside>
  )
}
