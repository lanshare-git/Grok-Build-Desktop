import { changeConfigOption, chooseCwd, refreshDiagnostics } from '../actions'
import { useStore } from '../store'
import { formatNumber } from '../utils'
import { IconFolder } from './Icons'

export default function Header(): JSX.Element {
  const session = useStore((s) => s.sessions.find((x) => x.id === s.activeId))
  const autoApprove = useStore((s) => s.autoApprove)
  const setAutoApprove = useStore((s) => s.setAutoApprove)
  const toggleDiagnostics = useStore((s) => s.toggleDiagnostics)

  if (!session) return <div className="header" />

  const modelOption = session.configOptions.find((o) => (o.configId ?? o.id) === 'model')
  const effortOption = session.configOptions.find(
    (o) => (o.configId ?? o.id) === 'reasoning_effort'
  )
  const usage = session.usage

  return (
    <header className="header">
      <div className="header-left">
        <div className="header-title" title={session.title}>
          {session.title}
        </div>
        <button
          className="chip chip-path"
          title={`工作目录：${session.cwd}（点击切换）`}
          onClick={async () => {
            const dir = await chooseCwd()
            if (dir) {
              useStore
                .getState()
                .appendNotice(session.id, `工作目录已设为 ${dir}，新建会话后生效。`, 'info')
            }
          }}
        >
          <IconFolder size={13} />
          {session.cwd}
        </button>
      </div>

      <div className="header-right">
        {modelOption && (
          <select
            className="chip chip-select"
            value={modelOption.currentValue ?? ''}
            onChange={(e) => void changeConfigOption('model', e.target.value)}
            title="模型"
          >
            {(modelOption.options ?? []).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.name ?? opt.value}
              </option>
            ))}
          </select>
        )}

        {effortOption && (
          <select
            className="chip chip-select"
            value={effortOption.currentValue ?? ''}
            onChange={(e) => void changeConfigOption('reasoning_effort', e.target.value)}
            title="推理强度"
          >
            {(effortOption.options ?? []).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.name ?? opt.value}
              </option>
            ))}
          </select>
        )}

        <label className="chip chip-toggle" title="自动批准工具执行（关闭后每次操作都会询问）">
          <input
            type="checkbox"
            checked={autoApprove}
            onChange={(e) => setAutoApprove(e.target.checked)}
          />
          自动批准
        </label>

        {usage && (
          <span
            className="chip chip-usage"
            title={`输入 ${usage.inputTokens ?? 0} · 输出 ${usage.outputTokens ?? 0} · 缓存读 ${
              usage.cacheReadInputTokens ?? 0
            }`}
          >
            ↑{formatNumber(usage.inputTokens)} ↓{formatNumber(usage.outputTokens)}
            {usage.costUsd !== undefined && ` · $${usage.costUsd.toFixed(4)}`}
          </span>
        )}

        <button
          className="icon-btn"
          title="环境自检"
          onClick={() => {
            void refreshDiagnostics()
            toggleDiagnostics(true)
          }}
        >
          ⚙
        </button>
      </div>
    </header>
  )
}
