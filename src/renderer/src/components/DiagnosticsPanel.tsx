import { useEffect, useRef, useState } from 'react'

import { applyProxy, autoDetectProxy, connectAgent, refreshDiagnostics } from '../actions'
import { useStore } from '../store'
import { useT } from '../i18n'

/**
 * 环境自检 —— 设置中心「环境自检」分区的内容。
 * 只渲染内容本身（标题/外壳由 SettingsDialog 提供），不再自带 drawer。
 * 诊断检查项的 label/detail/hint 来自主进程已翻好的数据，直接渲染。
 */
export default function DiagnosticsPanel(): JSX.Element {
  const t = useT()
  const diagnostics = useStore((s) => s.diagnostics)
  const logs = useStore((s) => s.logs)
  const clearLogs = useStore((s) => s.clearLogs)
  const [tab, setTab] = useState<'checks' | 'logs'>('checks')
  const [proxyInput, setProxyInput] = useState('')
  const [proxyBusy, setProxyBusy] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  const levelLabel = (level: 'ok' | 'warn' | 'error'): string =>
    level === 'ok'
      ? t('panels.diagnostics.levelOk')
      : level === 'warn'
        ? t('panels.diagnostics.levelWarn')
        : t('panels.diagnostics.levelError')

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
      <div className="settings-page-title">{t('panels.diagnostics.title')}</div>
      <div className="settings-page-sub">{t('panels.diagnostics.subtitle')}</div>

      <div className="drawer-tabs drawer-tabs-embedded">
        <button className={tab === 'checks' ? 'is-active' : ''} onClick={() => setTab('checks')}>
          {t('panels.diagnostics.tabChecks')}
        </button>
        <button className={tab === 'logs' ? 'is-active' : ''} onClick={() => setTab('logs')}>
          {t('panels.diagnostics.tabLogs')}
          {logs.length > 0 && ` (${logs.length})`}
        </button>
      </div>

      <div className="drawer-body drawer-body-embedded">
          {tab === 'checks' && (
            <>
              <div className="drawer-actions">
                <button className="btn btn-ghost" onClick={() => void refreshDiagnostics()}>
                  {t('panels.diagnostics.recheck')}
                </button>
                <button className="btn btn-primary" onClick={() => void connectAgent()}>
                  {t('panels.diagnostics.reconnect')}
                </button>
              </div>

              {!diagnostics && <div className="muted pad">{t('panels.diagnostics.checking')}</div>}

              {diagnostics?.checks.map((check) => (
                <div key={check.id} className={`check check-${check.level}`}>
                  <div className="check-head">
                    <span className={`badge badge-${check.level}`}>{levelLabel(check.level)}</span>
                    <span className="check-label">{check.label}</span>
                  </div>
                  <div className="check-detail">{check.detail}</div>
                  {check.hint && <div className="check-hint">{check.hint}</div>}
                </div>
              ))}

              {/* 网络代理：grok 不读系统代理设置，必须由本应用显式配置并注入 */}
              <div className="proxy-box">
                <div className="proxy-title">
                  <span>{t('panels.diagnostics.proxyTitle')}</span>
                  <span className={`badge badge-${diagnostics?.proxy ? 'ok' : 'warn'}`}>
                    {diagnostics?.proxy
                      ? t('panels.diagnostics.proxyEnabled')
                      : t('panels.diagnostics.proxyDirect')}
                  </span>
                </div>

                <div className="proxy-row">
                  <input
                    className="proxy-input"
                    placeholder={t('panels.diagnostics.proxyPlaceholder')}
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
                    {t('panels.diagnostics.proxySave')}
                  </button>
                </div>

                <div className="proxy-row">
                  <button
                    className="btn btn-ghost"
                    disabled={proxyBusy}
                    onClick={() => void runProxyAction(autoDetectProxy)}
                  >
                    {t('panels.diagnostics.proxyAutoDetect')}
                  </button>
                  <button
                    className="btn btn-ghost"
                    disabled={proxyBusy || !diagnostics?.proxy}
                    onClick={() => void runProxyAction(() => applyProxy(null))}
                  >
                    {t('panels.diagnostics.proxyDirectBtn')}
                  </button>
                  {proxyBusy && <span className="proxy-busy">{t('panels.diagnostics.proxyBusy')}</span>}
                </div>

                <div className="check-hint">{t('panels.diagnostics.proxyHint')}</div>
              </div>

              {diagnostics && (
                <div className="drawer-meta">
                  <div>
                    <span className="muted">{t('panels.diagnostics.metaConfigDir')}</span>
                    <code>{diagnostics.grokHome}</code>
                  </div>
                  <div>
                    <span className="muted">{t('panels.diagnostics.metaBinary')}</span>
                    <code>{diagnostics.grokBinary ?? t('panels.diagnostics.metaBinaryMissing')}</code>
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'logs' && (
            <>
              <div className="drawer-actions">
                <button className="btn btn-ghost" onClick={clearLogs}>
                  {t('panels.diagnostics.logsClear')}
                </button>
              </div>
              <div className="log-view" ref={logRef}>
                {logs.length === 0 ? (
                  <div className="muted">{t('panels.diagnostics.logsEmpty')}</div>
                ) : (
                  logs.join('')
                )}
              </div>
            </>
          )}
      </div>
    </div>
  )
}
