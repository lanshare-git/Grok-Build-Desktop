import { useStore } from '../store'
import { stringifyPretty } from '../utils'
import type { PermissionRequestEvent } from '@shared/types'

interface PermissionOptionLike {
  name?: string
  kind?: string
}

/** 把 agent 返回的英文选项名映射为中文；未匹配到时原样返回 */
export function zhOptionName(opt: PermissionOptionLike): string {
  const name = opt.name ?? ''
  const kind = (opt.kind ?? '').toLowerCase()
  // 标准 ACP kind 优先
  if (kind === 'allow_once') return '允许（仅本次）'
  if (kind === 'allow_always') return '允许（不再询问）'
  if (kind === 'reject_once') return '拒绝（仅本次）'
  if (kind === 'reject_always') return '拒绝（不再询问）'
  // grok agent 固定的英文选项名
  const n = name.toLowerCase()
  if (/don'?t ask again for bash/.test(n)) return '允许，且同类命令不再询问'
  if (/tell grok|do differently/.test(n)) return '拒绝，并告诉 Grok 改用别的做法'
  if (/don'?t ask again/.test(n)) return '拒绝，且此命令不再询问'
  if (/^(yes|allow|proceed|approve)/.test(n)) return '允许本次执行'
  if (/^(no|deny|reject)/.test(n)) return '拒绝'
  return name
}

/**
 * 工具执行授权面板。
 *
 * **内联**渲染在「请求归属的那个任务」的输入框上方，而不是全局模态框——
 * 后台任务请求授权时不会再盖住用户当前正在看的任务。调用方（TaskPrompts）
 * 负责只把当前任务的请求传进来。
 */
export default function PermissionPanel({
  request
}: {
  request: PermissionRequestEvent
}): JSX.Element {
  const input = stringifyPretty(request.toolCall?.rawInput, 1200)

  const decide = (optionId: string | null): void => {
    void window.grok.respondPermission(request.requestId, optionId)
    // 立即从界面撤下：等 agent 回复再撤会让这张卡在屏幕上挂一拍
    useStore.getState().clearPermission(request.requestId)
  }

  return (
    <div className="prompt-card prompt-card-perm">
      <div className="prompt-head">
        <span className="prompt-badge">待授权</span>
        <span className="prompt-title">工具执行请求</span>
      </div>
      <div className="prompt-sub">
        Agent 想要执行 <strong>{request.toolCall?.title ?? '一个工具'}</strong>
        {request.toolCall?.toolName && <code className="inline-code">{request.toolCall.toolName}</code>}
      </div>

      {input && <pre className="prompt-pre">{input}</pre>}

      <div className="prompt-actions">
        {request.options.map((opt) => {
          const isDeny = /deny|reject|no/i.test(opt.kind ?? opt.name ?? '')
          return (
            <button
              key={opt.optionId}
              className={`btn ${isDeny ? 'btn-ghost' : 'btn-primary'}`}
              title={opt.name ?? opt.optionId}
              onClick={() => decide(opt.optionId)}
            >
              {zhOptionName(opt)}
            </button>
          )
        })}
        <button className="btn btn-ghost" onClick={() => decide(null)}>
          拒绝
        </button>
      </div>
    </div>
  )
}
