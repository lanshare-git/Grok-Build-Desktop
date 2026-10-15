import { useEffect, useState } from 'react'

import { cleanError } from '../actions'
import { useStore } from '../store'
import { useT } from '../i18n'
import { formatNumber, sessionDisplayTitle } from '../utils'
import type { SessionUsageReport, UsageTotals } from '@shared/types'
import { IconClose, IconRefresh } from './Icons'

/* ------------------------------------------------------------------ *
 *  用量面板 —— 对齐终端 `grok usage <sid>`，并额外给出跨会话累计。
 *
 *  数据全部来自主进程读回的 usage.json（重放免疫），所以打开即成事实，
 *  不依赖会话是否还在 agent 进程里。
 *
 *  口径提醒（展示层必须守住，否则会让人以为算错了）：
 *  - `inputTokens` **包含**缓存命中部分，要写成「输入 X · 其中缓存命中 Y」；
 *  - 花费由 `costUsdTicks / 1e9` 换算而来，四位小数以下不必纠结精度。
 * ------------------------------------------------------------------ */

function fmtCost(usd: number): string {
  if (!usd) return '$0'
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}

function fmtWhen(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes()
  )}`
}

/** 一行汇总指标 */
function StatRow({ totals, extra }: { totals: UsageTotals; extra?: string }): JSX.Element {
  const t = useT()
  return (
    <>
      <div className="usage-stats">
        <div className="usage-stat">
          <span className="usage-stat-label">{t('panels.usage.statInput')}</span>
          <span className="usage-stat-value">{formatNumber(totals.inputTokens)}</span>
          <span className="usage-stat-sub">
            {t('panels.usage.statInputCached', { n: formatNumber(totals.cachedReadTokens) })}
          </span>
        </div>
        <div className="usage-stat">
          <span className="usage-stat-label">{t('panels.usage.statOutput')}</span>
          <span className="usage-stat-value">{formatNumber(totals.outputTokens)}</span>
          <span className="usage-stat-sub">
            {t('panels.usage.statOutputReasoning', { n: formatNumber(totals.reasoningTokens) })}
          </span>
        </div>
        <div className="usage-stat">
          <span className="usage-stat-label">{t('panels.usage.statTotal')}</span>
          <span className="usage-stat-value">{formatNumber(totals.totalTokens)}</span>
          <span className="usage-stat-sub">
            {t('panels.usage.statModelCalls', { n: formatNumber(totals.modelCalls) })}
          </span>
        </div>
        <div className="usage-stat is-cost">
          <span className="usage-stat-label">{t('panels.usage.statCost')}</span>
          <span className="usage-stat-value">{fmtCost(totals.costUsd)}</span>
          <span className="usage-stat-sub">
            {extra ?? t('panels.usage.statTurns', { n: totals.turnCount })}
          </span>
        </div>
      </div>
    </>
  )
}

function ModelTable({
  rows,
  title
}: {
  rows: Array<{ modelId: string } & UsageTotals>
  title: string
}): JSX.Element | null {
  const t = useT()
  if (rows.length === 0) return null
  return (
    <div className="usage-block">
      <div className="usage-block-title">{title}</div>
      <table className="usage-table">
        <thead>
          <tr>
            <th>{t('panels.usage.colModel')}</th>
            <th className="num">{t('panels.usage.colInput')}</th>
            <th className="num">{t('panels.usage.colOutput')}</th>
            <th className="num">{t('panels.usage.colTotal')}</th>
            <th className="num">{t('panels.usage.colCalls')}</th>
            <th className="num">{t('panels.usage.colCost')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.modelId}>
              <td className="mono">{m.modelId}</td>
              <td className="num">{formatNumber(m.inputTokens)}</td>
              <td className="num">{formatNumber(m.outputTokens)}</td>
              <td className="num">{formatNumber(m.totalTokens)}</td>
              <td className="num">{formatNumber(m.modelCalls)}</td>
              <td className="num">{fmtCost(m.costUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function UsageDialog(): JSX.Element | null {
  const t = useT()
  const open = useStore((s) => s.usageOpen)
  const sessionId = useStore((s) => s.usageSessionId)
  const closeUsage = useStore((s) => s.closeUsage)
  const sessions = useStore((s) => s.sessions)
  const locale = useStore((s) => s.locale)

  const session = sessions.find((x) => x.id === sessionId) ?? null
  const [report, setReport] = useState<SessionUsageReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      // 只取当前会话：额度与跨会话累计在「设置 → 用量」里，不混进会话级弹窗
      const one = session
        ? await window.grok.sessionUsage({ sessionId: session.id, cwd: session.cwd })
        : null
      setReport(one)
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    setReport(null)
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeUsage()
    }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, closeUsage])

  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={closeUsage}>
      <div className="modal usage-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="usage-head">
          <div>
            <div className="usage-title">{t('panels.usageDialog.title')}</div>
            <div className="usage-sub">{t('panels.usageDialog.subtitle')}</div>
          </div>
          <div className="usage-head-actions">
            <button className="icon-btn" title={t('panels.usageDialog.refreshTitle')} onClick={() => void load()} disabled={loading}>
              <IconRefresh size={14} />
            </button>
            <button className="icon-btn" title={t('panels.usageDialog.closeTitle')} onClick={closeUsage}>
              <IconClose size={15} />
            </button>
          </div>
        </div>

        <div className="usage-body">
          {error && <div className="mcp-form-error">{error}</div>}

          {/* 当前会话 */}
          <div className="usage-block">
            <div className="usage-block-title">
              {t('panels.usageDialog.currentTitle')}
              {session && <span className="usage-block-sub">{sessionDisplayTitle(session, locale)}</span>}
            </div>
            {!session && (
              <div className="usage-empty">{t('panels.usageDialog.noSession')}</div>
            )}
            {session && !loading && !report && (
              <div className="usage-empty">{t('panels.usageDialog.noData')}</div>
            )}
            {report && (
              <>
                <StatRow totals={report.totals} />
                <div className="usage-meta">
                  {t('panels.usageDialog.meta', {
                    model: report.totals.primaryModelId ?? '—',
                    time: fmtWhen(report.updatedAt),
                    source: report.fromDisk
                      ? t('panels.usageDialog.sourceDisk')
                      : t('panels.usageDialog.sourceCli')
                  })}
                </div>

                <ModelTable rows={report.byModel} title={t('panels.usageDialog.byModelTitle')} />

                {report.turns.length > 0 && (
                  <div className="usage-block">
                    <div className="usage-block-title">
                      {t('panels.usageDialog.turnsTitle', { n: report.turns.length })}
                    </div>
                    <div className="usage-table-scroll">
                      <table className="usage-table">
                        <thead>
                          <tr>
                            <th className="num">{t('panels.usageDialog.colIndex')}</th>
                            <th>{t('panels.usageDialog.colTime')}</th>
                            <th className="num">{t('panels.usageDialog.colInput')}</th>
                            <th className="num">{t('panels.usageDialog.colOutput')}</th>
                            <th className="num">{t('panels.usageDialog.colReasoning')}</th>
                            <th className="num">{t('panels.usageDialog.colTotal')}</th>
                            <th className="num">{t('panels.usageDialog.colCost')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...report.turns].reverse().map((t) => (
                            <tr key={t.turnNumber}>
                              <td className="num">{t.turnNumber}</td>
                              <td>{fmtWhen(t.endedAt)}</td>
                              <td className="num">{formatNumber(t.inputTokens)}</td>
                              <td className="num">{formatNumber(t.outputTokens)}</td>
                              <td className="num">{formatNumber(t.reasoningTokens)}</td>
                              <td className="num">{formatNumber(t.totalTokens)}</td>
                              <td className="num">{fmtCost(t.costUsd)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}