import { useEffect, useState } from 'react'

import { cleanError } from '../actions'
import { useStore } from '../store'
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
  return (
    <>
      <div className="usage-stats">
        <div className="usage-stat">
          <span className="usage-stat-label">输入 token</span>
          <span className="usage-stat-value">{formatNumber(totals.inputTokens)}</span>
          <span className="usage-stat-sub">其中缓存命中 {formatNumber(totals.cachedReadTokens)}</span>
        </div>
        <div className="usage-stat">
          <span className="usage-stat-label">输出 token</span>
          <span className="usage-stat-value">{formatNumber(totals.outputTokens)}</span>
          <span className="usage-stat-sub">
            含推理 {formatNumber(totals.reasoningTokens)}
          </span>
        </div>
        <div className="usage-stat">
          <span className="usage-stat-label">总 token</span>
          <span className="usage-stat-value">{formatNumber(totals.totalTokens)}</span>
          <span className="usage-stat-sub">模型调用 {formatNumber(totals.modelCalls)} 次</span>
        </div>
        <div className="usage-stat is-cost">
          <span className="usage-stat-label">花费</span>
          <span className="usage-stat-value">{fmtCost(totals.costUsd)}</span>
          <span className="usage-stat-sub">{extra ?? `${totals.turnCount} 轮对话`}</span>
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
  if (rows.length === 0) return null
  return (
    <div className="usage-block">
      <div className="usage-block-title">{title}</div>
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
  )
}

export default function UsageDialog(): JSX.Element | null {
  const open = useStore((s) => s.usageOpen)
  const sessionId = useStore((s) => s.usageSessionId)
  const closeUsage = useStore((s) => s.closeUsage)
  const sessions = useStore((s) => s.sessions)

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
            <div className="usage-title">会话用量</div>
            <div className="usage-sub">
              数据来自 grok 落盘的 usage.json（等价终端 <code>grok usage</code>，不受历史重放影响）
            </div>
          </div>
          <div className="usage-head-actions">
            <button className="icon-btn" title="刷新" onClick={() => void load()} disabled={loading}>
              <IconRefresh size={14} />
            </button>
            <button className="icon-btn" title="关闭 (Esc)" onClick={closeUsage}>
              <IconClose size={15} />
            </button>
          </div>
        </div>

        <div className="usage-body">
          {error && <div className="mcp-form-error">{error}</div>}

          {/* 当前会话 */}
          <div className="usage-block">
            <div className="usage-block-title">
              当前会话
              {session && <span className="usage-block-sub">{sessionDisplayTitle(session)}</span>}
            </div>
            {!session && (
              <div className="usage-empty">
                未选中会话。请在左侧点选一个会话，或打开「设置 → 用量」查看账号额度与全部会话累计。
              </div>
            )}
            {session && !loading && !report && (
              <div className="usage-empty">
                这个会话还没有可结算的用量（尚未产生模型调用，或会话尚未落盘）。
              </div>
            )}
            {report && (
              <>
                <StatRow totals={report.totals} />
                <div className="usage-meta">
                  主模型 {report.totals.primaryModelId ?? '—'} · 统计时间{' '}
                  {fmtWhen(report.updatedAt)} ·{' '}
                  {report.fromDisk ? '来自 usage.json' : '由 grok usage 兜底生成'}
                </div>

                <ModelTable rows={report.byModel} title="按模型" />

                {report.turns.length > 0 && (
                  <div className="usage-block">
                    <div className="usage-block-title">逐轮明细（{report.turns.length} 轮）</div>
                    <div className="usage-table-scroll">
                      <table className="usage-table">
                        <thead>
                          <tr>
                            <th className="num">#</th>
                            <th>时间</th>
                            <th className="num">输入</th>
                            <th className="num">输出</th>
                            <th className="num">推理</th>
                            <th className="num">总 token</th>
                            <th className="num">花费</th>
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