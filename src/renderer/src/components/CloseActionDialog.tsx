import { useEffect } from 'react'

import {
  chooseQuitOnClose,
  chooseTrayOnClose,
  dismissCloseActionPrompt
} from '../actions'
import { useT } from '../i18n'
import { useStore } from '../store'

/**
 * 首次点击关闭、但「关闭时」行为尚未配置时弹出。
 * 用户选择后即写入配置并生效；「稍后再说」仅隐藏到托盘、不记住，下次仍询问。
 */
export default function CloseActionDialog(): JSX.Element | null {
  const t = useT()
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
        <div className="modal-title">{t('dialogs.closeAction.title')}</div>
        <div className="confirm-message">{t('dialogs.closeAction.message')}</div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => void dismissCloseActionPrompt()}>
            {t('dialogs.closeAction.later')}
          </button>
          <span className="modal-actions-spacer" />
          <button className="btn" onClick={() => void chooseQuitOnClose()}>
            {t('dialogs.closeAction.quit')}
          </button>
          <button className="btn btn-primary" onClick={() => void chooseTrayOnClose()}>
            {t('dialogs.closeAction.tray')}
          </button>
        </div>
      </div>
    </div>
  )
}
