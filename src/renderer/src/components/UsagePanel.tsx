import { useEffect, useState } from 'react'

import { cleanError } from '../actions'
import { useStore } from '../store'
import { useT } from '../i18n'
import { formatNumber, sessionDisplayTitle } from '../utils'
import { quotaLevel } from './AccountMenu'
import type { BillingQuota, GlobalUsageReport, UsageTotals } from '@shared/types'
import { IconGauge, IconRefresh } from './Icons'

/* ------------------------------------------------------------------ *
 *  用量 —— 设置中心「用量」分区：**全局口径**
 *
 *  这里只放「跨会话」的东西：
 *  - 账号额度（每周用量百分比，等同终端 `/usage` 的 Usage limit 页）
 *  - 全部会话累计 token / 花费、按模型拆分、花销最高的会话
 *
 *  单个会话的逐轮明细在**右上角 Header 的用量 chip**里（会话级不放这里，
 *  免得一个面板里混两种口径）。数据都重放免疫：额度走账号服务，
 *  累计走各会话的 usage.json。
 * ------------------------------------------------------------------ */

function fmtCost(usd: number): string {
  if (!usd) return '$0'
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}

/** 一行汇总指标（四格） */
function StatRow({ totals }: { totals: UsageTotals }): JSX.Element {
  const t = useT()
  return (
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
        <span className="usage-stat-sub">{t('panels.usage.statTurns', { n: totals.turnCount })}</span>
      </div>
    </div>
  )
}

/** 账号额度区：本周已用百分比 + 细进度条 + 按产品拆分 */
function QuotaBlock({
  quota,
  error,
  loading
}: {
  quota: BillingQuota | null
  error: string
  loading: boolean
}): JSX.Element {
  const t = useT()
  const level = quota ? quotaLevel(quota.usedPercent) : 'none'
  const periodLabel =
    quota?.periodType === 'USAGE_PERIOD_TYPE_WEEKLY'
      ? t('panels.usage.quotaPeriodWeekly')
      : quota?.periodType
        ? t('panels.usage.quotaPeriodGeneric')
        : t('panels.usage.quotaFallback')
  const resetIn = (): string => {
    if (!quota?.periodEnd) return ''
    const ms = new Date(quota.periodEnd).getTime() - Date.now()
    if (!Number.isFinite(ms) || ms <= 0) return ''
    const days = Math.floor(ms / 86400000)
    const hours = Math.floor((ms % 86400000) / 3600000)
    return days > 0
      ? t('panels.usage.quotaResetDays', { days, hours })
      : t('panels.usage.quotaResetHours', { hours })
  }

  return (
    <div className="settings-group">
      <div className="settings-row">
        <div className="settings-row-label">
          <span className="settings-row-title">
            <IconGauge size={13} /> {t('panels.usage.quotaTitle')}
          </span>
          <span className="settings-row-desc">
            {quota
              ? t('panels.usage.quotaRange', {
                  start: quota.periodStart.slice(0, 10),
                  end: quota.periodEnd.slice(0, 10),
                  reset: resetIn()
                })
              : t('panels.usage.quotaDescFallback')}
          </span>
        </div>
      </div>

      {loading && <div className="usage-loading">{t('panels.usage.quotaLoading')}</div>}
      {!loading && !quota && (
        <div className="usage-empty">
          {t('panels.usage.quotaUnavailable', { error })}
        </div>
      )}

      {quota && (
        <>
          <div className={`quota-hero is-${level}`}>
            <div className="quota-hero-left">
              <div className="quota-hero-value">{quota.usedPercent.toFixed(0)}%</div>
              <div className="quota-hero-label">{t('panels.usage.quotaUsed', { period: periodLabel })}</div>
            </div>
            <div className="quota-hero-right">
              <div className="quota-hero-remaining">
                {t('panels.usage.quotaRemaining', { percent: quota.remainingPercent.toFixed(0) })}
              </div>
              {quota.prepaidBalance > 0 && (
                <div className="quota-hero-sub">
                  {t('panels.usage.quotaPrepaid', { balance: quota.prepaidBalance })}
                </div>
              )}
            </div>
          </div>
          <div className={`quota-bar is-large is-${level}`}>
            <span className="quota-bar-fill" style={{ width: `${Math.min(100, quota.usedPercent)}%` }} />
          </div>

          {quota.products.length > 0 && (
            <div className="quota-products">
              {quota.products.map((p) => (
                <div key={p.product} className="quota-product">
                  <span className="quota-product-name">{p.product}</span>
                  <span className="quota-bar">
                    <span
                      className={`quota-bar-fill is-${quotaLevel(p.usagePercent)}`}
                      style={{ width: `${Math.min(100, Math.max(1, p.usagePercent))}%` }}
                    />
                  </span>
                  <span className="quota-product-value">{p.usagePercent.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ModelTable({ rows }: { rows: Array<{ modelId: string } & UsageTotals> }): JSX.Element | null {
  const t = useT()
  if (rows.length === 0) return null
  return (
    <div className="settings-group">
      <div className="settings-row">
        <div className="settings-row-label">
          <span className="settings-row-title">{t('panels.usage.byModelTitle')}</span>
          <span className="settings-row-desc">{t('panels.usage.byModelDesc')}</span>
        </div>
      </div>
      <div className="usage-table-scroll">
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
    </div>
  )
}

export default function UsagePanel(): JSX.Element {
  const t = useT()
  const sessions = useStore((s) => s.sessions)
  const locale = useStore((s) => s.locale)

  const [quota, setQuota] = useState<BillingQuota | null>(null)
  const [quotaError, setQuotaError] = useState('')
  const [global, setGlobal] = useState<GlobalUsageReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const [all, quotaRes] = await Promise.all([
        window.grok.usageAggregate(
          sessions
            .filter((s) => !s.isDraft)
            .map((s) => ({ sessionId: s.id, cwd: s.cwd, title: sessionDisplayTitle(s, locale) }))
        ),
        window.grok.billingQuota(true).catch(() => ({ quota: null, error: t('panels.usage.quotaErrorFallback') }))
      ])
      setGlobal(all)
      setQuota(quotaRes.quota)
      setQuotaError(quotaRes.error)
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // 进入面板刷新一次即可
  }, [])

  return (
    <div className="settings-page">
      <div className="settings-page-title">{t('panels.usage.title')}</div>
      <div className="settings-page-sub">{t('panels.usage.subtitle')}</div>

      {error && <div className="mcp-form-error">{error}</div>}

      <QuotaBlock quota={quota} error={quotaError} loading={loading} />

      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-label">
            <span className="settings-row-title">{t('panels.usage.totalTitle')}</span>
            <span className="settings-row-desc">
              {global
                ? t('panels.usage.totalDesc', { count: global.sessionCount, missing: global.missingCount })
                : t('panels.usage.totalDescLoading')}
            </span>
          </div>
          <button className="btn btn-ghost" disabled={loading} onClick={() => void load()}>
            <IconRefresh size={13} />
            {t('panels.usage.refresh')}
          </button>
        </div>
        {global ? (
          <StatRow totals={global.totals} />
        ) : (
          !loading && <div className="usage-empty">{t('panels.usage.totalEmpty')}</div>
        )}
      </div>

      {global && <ModelTable rows={global.byModel} />}

      {global && global.topSessions.length > 0 && (
        <div className="settings-group">
          <div className="settings-row">
            <div className="settings-row-label">
              <span className="settings-row-title">{t('panels.usage.topTitle')}</span>
              <span className="settings-row-desc">
                {t('panels.usage.topDesc', { n: global.topSessions.length })}
              </span>
            </div>
          </div>
          <div className="usage-table-scroll">
            <table className="usage-table">
              <thead>
                <tr>
                  <th>{t('panels.usage.colSession')}</th>
                  <th className="num">{t('panels.usage.colTurns')}</th>
                  <th className="num">{t('panels.usage.colTotal')}</th>
                  <th className="num">{t('panels.usage.colCost')}</th>
                </tr>
              </thead>
              <tbody>
                {global.topSessions.map((s) => (
                  <tr key={s.sessionId} title={`${s.title}\n${s.cwd}`}>
                    {/* td 上的 max-width 不生效，截断必须包一层 div */}
                    <td>
                      <div className="usage-cell-name">{s.title}</div>
                    </td>
                    <td className="num">{formatNumber(s.turnCount)}</td>
                    <td className="num">{formatNumber(s.totalTokens)}</td>
                    <td className="num">{fmtCost(s.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mcp-hint">{t('panels.usage.footnote')}</div>
    </div>
  )
}