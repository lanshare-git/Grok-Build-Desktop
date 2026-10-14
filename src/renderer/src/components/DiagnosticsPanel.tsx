import { useEffect, useRef, useState } from 'react'

import { applyProxy, autoDetectProxy, connectAgent, refreshDiagnostics } from '../actions'
import { useStore } from '../store'

const LEVEL_LABEL = { ok: '正常', warn: '注意', error: '异常' } as const

/**
 * 环境自检 —— 设置中心「环境自检」分区的内容。
 * 只渲染内容本身（标题/外壳由 SettingsDialog 提供），不再自带 drawer。
 */
export default function DiagnosticsPanel(): JSX.Element {
  const diagnostics = useStore((s) => s.diagnostics)
  const logs = useStore((s) => s.logs)
  const clearLogs = useStore((s) => s.clearLogs)
  const [tab, setTab] = useState<'checks' | 'logs'>('checks')
  const [proxyInput, setProxyInput] = useState('')
  const [proxyBusy, setProxyBusy] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (tab === 'logs' && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs, tab])

  // 诊断结果刷新后同步输入框，让用户看到当前生效值
  useEffect(() => {
    setProxyInput(diagnostics?.proxy ?? '')
  }, [diagnostics?.proxy])

  const runProxyAction = async (action: () => Promise<void>): Promise<void> => {
    setProxyBusy(true)
    try {
      await action()
    } finally {
      setProxyBusy(false)
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-page-title">环境自检</div>
      <div className="settings-page-sub">检查运行依赖、登录态与网络连通性</div>

      <div className="drawer-tabs drawer-tabs-embedded">
        <button className={tab === 'checks' ? 'is-active' : ''} onClick={() => setTab('checks')}>
          检查项
        </button>
        <button className={tab === 'logs' ? 'is-active' : ''} onClick={() => setTab('logs')}>
          运行日志{logs.length > 0 && ` (${logs.length})`}
        </button>
      </div>

      <div className="drawer-body drawer-body-embedded">
          {tab === 'checks' && (
            <>
              <div className="drawer-actions">
                <button className="btn btn-ghost" onClick={() => void refreshDiagnostics()}>
                  重新检查
                </button>
                <button className="btn btn-primary" onClick={() => void connectAgent()}>
                  重新连接
                </button>
              </div>

              {!diagnostics && <div className="muted pad">正在检查…</div>}

              {diagnostics?.checks.map((check) => (
                <div key={check.id} className={`check check-${check.level}`}>
                  <div className="check-head">
                    <span className={`badge badge-${check.level}`}>{LEVEL_LABEL[check.level]}</span>
                    <span className="check-label">{check.label}</span>
                  </div>
                  <div className="check-detail">{check.detail}</div>
                  {check.hint && <div className="check-hint">{check.hint}</div>}
                </div>
              ))}

              {/* 网络代理：grok 不读系统代理设置，必须由本应用显式配置并注入 */}
              <div className="proxy-box">
                <div className="proxy-title">
                  <span>网络代理</span>
                  <span className={`badge badge-${diagnostics?.proxy ? 'ok' : 'warn'}`}>
                    {diagnostics?.proxy ? '已启用' : '直连'}
                  </span>
                </div>

                <div className="proxy-row">
                  <input
                    className="proxy-input"
                    placeholder="socks5h://127.0.0.1:10808"
                    value={proxyInput}
                    spellCheck={false}
                    disabled={proxyBusy}
                    onChange={(e) => setProxyInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !proxyBusy) {
                        void runProxyAction(() => applyProxy(proxyInput.trim() || null))
                      }
                    }}
                  />
                  <button
                    className="btn btn-primary"
                    disabled={proxyBusy}
                    onClick={() => void runProxyAction(() => applyProxy(proxyInput.trim() || null))}
                  >
                    保存
                  </button>
                </div>

                <div className="proxy-row">
                  <button
                    className="btn btn-ghost"
                    disabled={proxyBusy}
                    onClick={() => void runProxyAction(autoDetectProxy)}
                  >
                    自动探测
                  </button>
                  <button
                    className="btn btn-ghost"
                    disabled={proxyBusy || !diagnostics?.proxy}
                    onClick={() => void runProxyAction(() => applyProxy(null))}
                  >
                    改为直连
                  </button>
                  {proxyBusy && <span className="proxy-busy">处理中…</span>}
                </div>

                <div className="check-hint">
                  模型服务在境外。grok 只读 HTTP_PROXY / HTTPS_PROXY 环境变量，不读 Windows
                  系统代理设置，因此需在此显式指定本机代理地址。修改后会自动重启 agent。
                </div>
              </div>

              {diagnostics && (
                <div className="drawer-meta">
                  <div>
                    <span className="muted">配置目录</span>
                    <code>{diagnostics.grokHome}</code>
                  </div>
                  <div>
                    <span className="muted">可执行文件</span>
                    <code>{diagnostics.grokBinary ?? '未找到'}</code>
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'logs' && (
            <>
              <div className="drawer-actions">
                <button className="btn btn-ghost" onClick={clearLogs}>
                  清空
                </button>
              </div>
              <div className="log-view" ref={logRef}>
                {logs.length === 0 ? <div className="muted">暂无日志</div> : logs.join('')}
              </div>
            </>
          )}
      </div>
    </div>
  )
}
