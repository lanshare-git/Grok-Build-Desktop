import { useEffect } from 'react'
import type { ReactNode } from 'react'

export interface ConfirmSpec {
  title: string
  /** 正文，可含 <strong> 高亮关键对象 */
  message: ReactNode
  /** 灰底补充说明（后果、影响范围等） */
  detail?: ReactNode
  confirmText: string
  /** 省略则只有确认按钮，退化为「纯提示」弹窗 */
  cancelText?: string
  danger?: boolean
  onConfirm?: () => void
  /**
   * 可勾选的附加行为，用于「轻/重两种删除」这类二选一。
   * 勾选状态由调用方持有（改动后请同步更新 confirmText 等派生字段）。
   */
  option?: {
    label: ReactNode
    /** 勾选项下方的补充说明 */
    hint?: ReactNode
    checked: boolean
    onChange: (checked: boolean) => void
  }
}

export default function ConfirmDialog({
  spec,
  onClose
}: {
  spec: ConfirmSpec
  onClose: () => void
}): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const accept = (): void => {
    spec.onConfirm?.()
    onClose()
  }

  const hasCancel = !!spec.cancelText

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal modal-confirm${spec.danger ? ' is-danger' : ''}`}
        role="dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-title">{spec.title}</div>
        <div className="confirm-message">{spec.message}</div>
        {spec.detail && <div className="confirm-detail">{spec.detail}</div>}

        {spec.option && (
          <label className={`confirm-option${spec.option.checked ? ' is-on' : ''}`}>
            <input
              type="checkbox"
              checked={spec.option.checked}
              onChange={(e) => spec.option?.onChange(e.target.checked)}
            />
            <span className="confirm-option-text">
              <span className="confirm-option-label">{spec.option.label}</span>
              {spec.option.hint && <span className="confirm-option-hint">{spec.option.hint}</span>}
            </span>
          </label>
        )}

        <div className="modal-actions">
          {hasCancel && (
            <button
              className="btn btn-ghost"
              autoFocus={!!spec.danger}
              onClick={onClose}
            >
              {spec.cancelText}
            </button>
          )}
          <button
            className={`btn ${spec.danger ? 'btn-danger' : 'btn-primary'}`}
            autoFocus={!spec.danger || !hasCancel}
            onClick={accept}
          >
            {spec.confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
