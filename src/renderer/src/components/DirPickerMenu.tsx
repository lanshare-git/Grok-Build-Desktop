import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { chooseCwd, newSession, switchWorkspace } from '../actions'
import { useT } from '../i18n'
import { useStore } from '../store'
import { groupSessionsByWorkspace, sameDir } from '../utils'
import { IconFolder } from './Icons'

/**
 * 目录选择菜单（参考 Cursor 的 Recents 弹层）：
 * 列出最近用过的目录（会话 cwd ∪ 手动登记的目录，按最近活动排序，别名优先），
 * 底部「打开其他目录…」才走系统目录选择框。
 *
 * - purpose=`new`（默认）：点选即以该目录新建任务（顶栏 ＋、侧栏、欢迎页）
 * - purpose=`switch`：点选即切换工作目录（顶栏路径 chip；空草稿会顺手清掉）
 *
 * 主目录（「聊天」组）不出现在列表里 —— 随聊有独立的「新建聊天」入口。
 */
export default function DirPickerMenu({
  anchor,
  onClose,
  purpose = 'new'
}: {
  anchor: HTMLElement | null
  onClose: () => void
  purpose?: 'new' | 'switch'
}): JSX.Element | null {
  const sessions = useStore((s) => s.sessions)
  const workspaces = useStore((s) => s.workspaces)
  const homeDir = useStore((s) => s.homeDir)
  const activeCwd = useStore((s) => s.activeSession()?.cwd ?? s.cwd)
  const t = useT()
  const locale = useStore((s) => s.locale)

  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  const groups = groupSessionsByWorkspace(sessions, workspaces, homeDir, locale)
    .filter((g) => !g.isHome)
    .sort((a, b) => b.latest - a.latest)

  // 锚点下方弹出；右侧贴边时往回收，避免超出窗口
  useLayoutEffect(() => {
    if (!anchor) return
    const place = (): void => {
      const r = anchor.getBoundingClientRect()
      setPos({ left: Math.min(r.left, window.innerWidth - 300), top: r.bottom + 6 })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor])

  // 点击外部 / Esc 关闭
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

  const pick = (dir: string): void => {
    onClose()
    if (purpose === 'switch') {
      void switchWorkspace(dir)
      return
    }
    // 同步「当前关注目录」，磁盘/插件等面板跟随新任务
    useStore.getState().setCwd(dir)
    void newSession(dir)
  }

  const browse = async (): Promise<void> => {
    onClose()
    if (purpose === 'switch') {
      await switchWorkspace()
      return
    }
    const dir = await chooseCwd()
    if (dir) await newSession(dir)
  }

  return (
    <div className="dir-menu" ref={menuRef} style={{ left: pos.left, top: pos.top }} role="menu">
      <div className="dir-menu-head">
        {purpose === 'switch' ? t('sessionTools.dir.switchTitle') : t('sessionTools.dir.title')}
      </div>
      <div className="dir-menu-list">
        {groups.length === 0 && <div className="dir-menu-empty">{t('sessionTools.dir.empty')}</div>}
        {groups.map((g) => {
          const current = sameDir(g.path, activeCwd)
          return (
            <button
              key={g.key}
              className={`dir-menu-item${current ? ' is-current' : ''}`}
              role="menuitem"
              title={g.path}
              onClick={() => pick(g.path)}
            >
              <IconFolder size={14} />
              <span className="dir-menu-label">{g.label}</span>
              <span className="dir-menu-path">{g.path}</span>
              {current && <span className="dir-menu-current">{t('sessionTools.dir.current')}</span>}
            </button>
          )
        })}
      </div>
      <div className="dir-menu-sep" />
      <button className="dir-menu-item" role="menuitem" onClick={() => void browse()}>
        <IconFolder size={14} />
        <span className="dir-menu-label">
          {purpose === 'switch' ? t('sessionTools.dir.browseOther') : t('sessionTools.dir.browse')}
        </span>
      </button>
    </div>
  )
}
