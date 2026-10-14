import { useEffect } from 'react'

import {
  chooseQuitOnClose,
  chooseTrayOnClose,
  dismissCloseActionPrompt
} from '../actions'
import { useStore } from '../store'

/**
 * 首次点击关闭、但「关闭时」行为尚未配置时弹出。
 * 用户选择后即写入配置并生效；「稍后再说」仅隐藏到托盘、不记住，下次仍询问。
 */
export default function CloseActionDialog(): JSX.Element | null {
  const show = useStore((s) => s.showCloseActionPrompt)
  const setShow = useStore((s) => s.setShowCloseActionPrompt)

  useEffect(() => {
    if (!show) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') void dismissCloseActionPrompt()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [show])

  if (!show) return null

  return (
    <div className="modal-backdrop" onClick={() => void dismissCloseActionPrompt()}>
      <div
        className="modal modal-confirm close-action-modal"
        role="dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-title">关闭时如何？</div>
        <div className="confirm-message">
          选择点击窗口关闭按钮时的行为。你随时可以在设置中心「通用」里更改。
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => void dismissCloseActionPrompt()}>
            稍后再说
          </button>
          <span className="modal-actions-spacer" />
          <button className="btn" onClick={() => void chooseQuitOnClose()}>
            直接退出
          </button>
          <button className="btn btn-primary" onClick={() => void chooseTrayOnClose()}>
            隐藏到托盘
          </button>
        </div>
      </div>
    </div>
  )
}
