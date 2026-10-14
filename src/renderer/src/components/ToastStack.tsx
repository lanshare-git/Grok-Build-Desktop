import { useEffect } from 'react'

import { connectAgent, resumeSession } from '../actions'
import { useStore, type Toast } from '../store'
import { IconClose } from './Icons'

/**
 * 右下角全局提示栈。
 *
 * 只承载「不该打断当前任务、但又必须让用户知道」的事：
 *  - 其它任务正在请求授权 / 提问（点击可跳到那个任务）
 *  - agent 连接异常 / 进程退出（可一键重连）
 * 任务**内部**的授权与提问不走这里，而是内联到该任务的输入框上方（见 TaskPrompts）。
 */
export default function ToastStack(): JSX.Element | null {
  const toasts = useStore((s) => s.toasts)

  if (!toasts.length) return null

  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  )
}

function ToastItem({ toast }: { toast: Toast }): JSX.Element {
  const dismiss = useStore((s) => s.dismissToast)
  const actionable = Boolean(toast.sessionId || toast.action)

  // ttl 到点自动消失；ttl 为 0/缺省则常驻，等用户手动关或响应后由 store 收回
  useEffect(() => {
    if (!toast.ttl) return
    const timer = window.setTimeout(() => dismiss(toast.id), toast.ttl)
    return () => window.clearTimeout(timer)
  }, [toast.ttl, toast.id, dismiss])

  const activate = (): void => {
    dismiss(toast.id)
    if (toast.action === 'reconnect') {
      void connectAgent()
      return
    }
    if (toast.sessionId) {
      const session = useStore.getState().sessions.find((x) => x.id === toast.sessionId)
      if (session) void resumeSession(session.id, session.cwd)
    }
  }

  return (
    <div className={`toast toast-${toast.level}`} role="status">
      <div
        className={`toast-body${actionable ? ' is-actionable' : ''}`}
        onClick={actionable ? activate : undefined}
      >
        <div className="toast-title">{toast.title}</div>
        {toast.text && <div className="toast-text">{toast.text}</div>}
        {actionable && (
          <div className="toast-action">
            {toast.action === 'reconnect' ? '重新连接' : '前往处理'}
            <span className="toast-action-arrow">→</span>
          </div>
        )}
      </div>
      <button className="toast-close" title="关闭" onClick={() => dismiss(toast.id)}>
        <IconClose size={13} />
      </button>
    </div>
  )
}
