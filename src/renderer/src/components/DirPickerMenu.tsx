import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { chooseCwd, newSession } from '../actions'
import { useStore } from '../store'
import { groupSessionsByWorkspace } from '../utils'
import { IconFolder } from './Icons'

/**
 * 新建任务的目录选择菜单（参考 Cursor 的 Recents 弹层）：
 * 列出最近用过的目录（会话 cwd ∪ 手动登记的目录，按最近活动排序，别名优先），
 * 点选即以该目录新建任务；底部「添加工作目录…」走系统目录选择框选一个新目录。
 * 主目录（「聊天」组）不出现在列表里 —— 随聊有独立的「新建聊天」入口。
 */
export default function DirPickerMenu({
  anchor,
  onClose
}: {
  anchor: HTMLElement | null
  onClose: () => void
}): JSX.Element | null {
  const sessions = useStore((s) => s.sessions)
  const workspaces = useStore((s) => s.workspaces)
  const homeDir = useStore((s) => s.homeDir)

  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  const groups = groupSessionsByWorkspace(sessions, workspaces, homeDir)
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
    // 同步「当前关注目录」，磁盘/插件等面板跟随新任务
    useStore.getState().setCwd(dir)
    void newSession(dir)
  }

  const browse = async (): Promise<void> => {
    onClose()
    const dir = await chooseCwd()
    if (dir) await newSession(dir)
  }

  return (
    <div className="dir-menu" ref={menuRef} style={{ left: pos.left, top: pos.top }} role="menu">
      <div className="dir-menu-head">选择工作目录</div>
      <div className="dir-menu-list">
        {groups.length === 0 && <div className="dir-menu-empty">暂无最近目录，请添加工作目录</div>}
        {groups.map((g) => (
          <button
            key={g.key}
            className="dir-menu-item"
            role="menuitem"
            title={g.path}
            onClick={() => pick(g.path)}
          >
            <IconFolder size={14} />
            <span className="dir-menu-label">{g.label}</span>
            <span className="dir-menu-path">{g.path}</span>
          </button>
        ))}
      </div>
      <div className="dir-menu-sep" />
      <button className="dir-menu-item" role="menuitem" onClick={() => void browse()}>
        <IconFolder size={14} />
        <span className="dir-menu-label">添加工作目录…</span>
      </button>
    </div>
  )
}
