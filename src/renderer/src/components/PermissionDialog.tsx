import { useStore } from '../store'
import { stringifyPretty } from '../utils'

export default function PermissionDialog(): JSX.Element | null {
  const permission = useStore((s) => s.permission)
  const clearPermission = useStore((s) => s.clearPermission)

  if (!permission) return null
  const { request } = permission
  const input = stringifyPretty(request.toolCall?.rawInput, 1200)

  const decide = (optionId: string | null): void => {
    void window.grok.respondPermission(request.requestId, optionId)
    clearPermission()
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-title">工具执行请求</div>
        <div className="modal-sub">
          Agent 想要执行 <strong>{request.toolCall?.title ?? '一个工具'}</strong>
          {request.toolCall?.toolName && <code className="inline-code">{request.toolCall.toolName}</code>}
        </div>

        {input && <pre className="modal-pre">{input}</pre>}

        <div className="modal-actions">
          {request.options.map((opt) => {
            const isDeny = /deny|reject|no/i.test(opt.kind ?? opt.name ?? '')
            return (
              <button
                key={opt.optionId}
                className={`btn ${isDeny ? 'btn-ghost' : 'btn-primary'}`}
                onClick={() => decide(opt.optionId)}
              >
                {opt.name ?? opt.optionId}
              </button>
            )
          })}
          <button className="btn btn-ghost" onClick={() => decide(null)}>
            拒绝
          </button>
        </div>
      </div>
    </div>
  )
}
