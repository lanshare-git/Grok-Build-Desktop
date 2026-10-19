import { useT, type MessageKey } from '../i18n'
import { useStore } from '../store'
import { stringifyPretty } from '../utils'
import {
  isDenyPermissionOption,
  localizePermissionOption
} from '@shared/permission-labels'
import type { PermissionRequestEvent } from '@shared/types'

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
  const t = useT()
  const input = stringifyPretty(request.toolCall?.rawInput, 1200)

  const decide = (optionId: string | null): void => {
    void window.grok.respondPermission(request.requestId, optionId)
    // 立即从界面撤下：等 agent 回复再撤会让这张卡在屏幕上挂一拍
    useStore.getState().clearPermission(request.requestId)
  }

  return (
    <div className="prompt-card prompt-card-perm">
      <div className="prompt-head">
        <span className="prompt-badge">{t('prompts.perm.badge')}</span>
        <span className="prompt-title">{t('prompts.perm.title')}</span>
      </div>
      <div className="prompt-sub">
        {t('prompts.perm.wantPre')}
        <strong>{request.toolCall?.title ?? t('prompts.perm.fallbackTool')}</strong>
        {t('prompts.perm.wantPost')}
        {request.toolCall?.toolName && <code className="inline-code">{request.toolCall.toolName}</code>}
      </div>

      {input && <pre className="prompt-pre">{input}</pre>}

      <div className="prompt-actions">
        {request.options.map((opt) => {
          const isDeny = isDenyPermissionOption(opt)
          return (
            <button
              key={opt.optionId}
              className={`btn ${isDeny ? 'btn-ghost' : 'btn-primary'}`}
              title={opt.name ?? opt.optionId}
              onClick={() => decide(opt.optionId)}
            >
              {localizePermissionOption(opt, (k) => t(k as MessageKey))}
            </button>
          )
        })}
        {/* agent 已带拒绝选项时不再叠一个裸「拒绝」（否则会变成三个拒绝） */}
        {!request.options.some((o) => isDenyPermissionOption(o)) && (
          <button className="btn btn-ghost" onClick={() => decide(null)}>
            {t('prompts.perm.reject')}
          </button>
        )}
      </div>
    </div>
  )
}
