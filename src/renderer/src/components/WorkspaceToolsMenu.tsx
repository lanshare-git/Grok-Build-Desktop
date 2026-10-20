import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { WorkspaceGroup } from '../utils'
import { useT } from '../i18n'
import { IconEdit, IconTrash } from './Icons'

/**
 * 工作目录行的右键菜单：改别名 / 从列表移除。
 * 新建任务仍用行上的 +；定位用鼠标坐标（position:fixed），避免被侧栏裁剪。
 */
export default function WorkspaceToolsMenu({
  group,
  point,
  onClose,
  onRequestRename,
  onRequestRemove
}: {
  group: WorkspaceGroup
  /** 右键落点（viewport 坐标） */
  point: { x: number; y: number }
  onClose: () => void
  onRequestRename: () => void
  onRequestRemove: () => void
}): JSX.Element | null {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const t = useT()

  useLayoutEffect(() => {
    const place = (): void => {
      const width = 200
      setPos({
        top: Math.min(point.y, Math.max(12, window.innerHeight - 160)),
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
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  if (!pos) return null

  return (
    <div className="account-menu session-tools" ref={menuRef} style={pos} role="menu">
      <div className="account-menu-head">
        <div className="account-menu-name">{group.label}</div>
        <div className="account-menu-status">{group.path}</div>
      </div>

      <button
        className="account-menu-item"
        role="menuitem"
        title={t('sessionTools.workspace.renameTitle')}
        onClick={() => {
          onClose()
          onRequestRename()
        }}
      >
        <IconEdit size={15} />
        {t('sessionTools.workspace.rename')}
      </button>

      <button
        className="account-menu-item is-danger"
        role="menuitem"
        title={t('sessionTools.workspace.removeTitle')}
        onClick={() => {
          onClose()
          onRequestRemove()
        }}
      >
        <IconTrash size={15} />
        {t('sessionTools.workspace.remove')}
      </button>
    </div>
  )
}
