import { useEffect, useState } from 'react'

import { cleanError } from '../actions'
import { useStore } from '../store'
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
  return (
    <div className="usage-stats">
      <div className="usage-stat">
        <span className="usage-stat-label">输入 token</span>
        <span className="usage-stat-value">{formatNumber(totals.inputTokens)}</span>
        <span className="usage-stat-sub">其中缓存命中 {formatNumber(totals.cachedReadTokens)}</span>
      </div>
      <div className="usage-stat">
        <span className="usage-stat-label">输出 token</span>
        <span className="usage-stat-value">{formatNumber(totals.outputTokens)}</span>
        <span className="usage-stat-sub">含推理 {formatNumber(totals.reasoningTokens)}</span>
      </div>
      <div className="usage-stat">
        <span className="usage-stat-label">总 token</span>
        <span className="usage-stat-value">{formatNumber(totals.totalTokens)}</span>
        <span className="usage-stat-sub">模型调用 {formatNumber(totals.modelCalls)} 次</span>
      </div>
      <div className="usage-stat is-cost">
        <span className="usage-stat-label">花费</span>
        <span className="usage-stat-value">{fmtCost(totals.costUsd)}</span>
        <span className="usage-stat-sub">{totals.turnCount} 轮对话</span>
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
  const level = quota ? quotaLevel(quota.usedPercent) : 'none'
  const periodLabel =
    quota?.periodType === 'USAGE_PERIOD_TYPE_WEEKLY' ? '每周用量' : quota?.periodType ? '本周期用量' : '用量额度'
  const resetIn = (): string => {
    if (!quota?.periodEnd) return ''
    const ms = new Date(quota.periodEnd).getTime() - Date.now()
    if (!Number.isFinite(ms) || ms <= 0) return ''
    const days = Math.floor(ms / 86400000)
    const hours = Math.floor((ms % 86400000) / 3600000)
    return days > 0 ? `${days} 天 ${hours} 小时后重置` : `${hours} 小时后重置`
  }

  return (
    <div className="settings-group">
      <div className="settings-row">
        <div className="settings-row-label">
          <span className="settings-row-title">
            <IconGauge size={13} /> 账号额度
          </span>
          <span className="settings-row-desc">
            {quota
              ? `${quota.periodStart.slice(0, 10)} 至 ${quota.periodEnd.slice(0, 10)}${
                  resetIn() ? ` · ${resetIn()}` : ''
                }`
              : '数据来自 grok 账号服务（等同终端 /usage 的 Usage limit 页）'}
          </span>
        </div>
      </div>

      {loading && <div className="usage-loading">正在读取额度…</div>}
      {!loading && !quota && (
        <div className="usage-empty">
          额度信息暂不可用{error ? `（${error}）` : ''}。未登录或网络不通时读不到；代理需在「环境自检」里可用。
        </div>
      )}

      {quota && (
        <>
          <div className={`quota-hero is-${level}`}>
            <div className="quota-hero-left">
              <div className="quota-hero-value">{quota.usedPercent.toFixed(0)}%</div>
              <div className="quota-hero-label">{periodLabel}已用</div>
            </div>
            <div className="quota-hero-right">
              <div className="quota-hero-remaining">剩余 {quota.remainingPercent.toFixed(0)}%</div>
              {quota.prepaidBalance > 0 && (
                <div className="quota-hero-sub">预付余额 {quota.prepaidBalance}</div>
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
  if (rows.length === 0) return null
  return (
    <div className="settings-group">
      <div className="settings-row">
        <div className="settings-row-label">
          <span className="settings-row-title">按模型</span>
          <span className="settings-row-desc">跨全部会话累计</span>
        </div>
      </div>
      <div className="usage-table-scroll">
        <table className="usage-table">
          <thead>
            <tr>
              <th>模型</th>
              <th className="num">输入</th>
              <th className="num">输出</th>
              <th className="num">总 token</th>
              <th className="num">调用</th>
              <th className="num">花费</th>
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
  const sessions = useStore((s) => s.sessions)

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
            .map((s) => ({ sessionId: s.id, cwd: s.cwd, title: sessionDisplayTitle(s) }))
        ),
        window.grok.billingQuota(true).catch(() => ({ quota: null, error: '额度暂不可用' }))
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
      <div className="settings-page-title">用量</div>
      <div className="settings-page-sub">
        全局口径：账号额度 + 全部会话累计。单个会话的逐轮明细见右上角「用量」入口。
      </div>

      {error && <div className="mcp-form-error">{error}</div>}

      <QuotaBlock quota={quota} error={quotaError} loading={loading} />

      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-label">
            <span className="settings-row-title">全部会话累计</span>
            <span className="settings-row-desc">
              {global
                ? `覆盖 ${global.sessionCount} 个会话${
                    global.missingCount > 0 ? `，${global.missingCount} 个无用量记录` : ''
                  }`
                : '正在统计…'}
            </span>
          </div>
          <button className="btn btn-ghost" disabled={loading} onClick={() => void load()}>
            <IconRefresh size={13} />
            刷新
          </button>
        </div>
        {global ? (
          <StatRow totals={global.totals} />
        ) : (
          !loading && <div className="usage-empty">暂无可统计的用量记录。</div>
        )}
      </div>

      {global && <ModelTable rows={global.byModel} />}

      {global && global.topSessions.length > 0 && (
        <div className="settings-group">
          <div className="settings-row">
            <div className="settings-row-label">
              <span className="settings-row-title">花销最高的会话</span>
              <span className="settings-row-desc">前 {global.topSessions.length} 名</span>
            </div>
          </div>
          <div className="usage-table-scroll">
            <table className="usage-table">
              <thead>
                <tr>
                  <th>会话</th>
                  <th className="num">轮数</th>
                  <th className="num">总 token</th>
                  <th className="num">花费</th>
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

      <div className="mcp-hint">
        额度由 xAI 账号侧统计，与 token 计费口径相互独立：额度决定「还能用多少」，计费明细是「已经用了多少」。
      </div>
    </div>
  )
}