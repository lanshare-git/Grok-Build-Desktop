import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { logoutAccount } from '../actions'
import { useStore } from '../store'
import type { BillingQuota } from '@shared/types'
import { IconGauge, IconGear, IconPower } from './Icons'

/** 额度档位：≥90% 红色告警，≥75% 橙色提醒 */
export function quotaLevel(percent: number): 'ok' | 'warn' | 'danger' {
  if (percent >= 90) return 'danger'
  if (percent >= 75) return 'warn'
  return 'ok'
}

/** 「本周用量 45% 已用」/ 「额度不可用」 */
export function quotaLabel(quota: BillingQuota | null, error: string): string {
  if (!quota) return error ? '额度暂不可用' : '额度未知'
  return `已用 ${quota.usedPercent.toFixed(quota.usedPercent % 1 === 0 ? 0 : 1)}%`
}

const CONNECTION_LABEL: Record<string, string> = {
  idle: '未连接',
  starting: '启动中',
  ready: '已就绪',
  error: '连接失败',
  stopped: '已停止'
}

/**
 * 左下角账号菜单 —— 保持精简：只有「设置」（打开设置中心，里面已含通用/账号/
 * MCP/自检/关于所有分区）和「退出登录」两个动作，避免把每个设置页都变成菜单入口。
 * 连接状态与版本压缩成头部一行文字，不单独占入口。fixed 定位向上弹出（与
 * session-preview 同一套定位思路，避免被侧栏滚动区裁剪）。
 */
export default function AccountMenu({
  anchor,
  onClose
}: {
  anchor: HTMLElement | null
  onClose: () => void
}): JSX.Element | null {
  const account = useStore((s) => s.account)
  const connection = useStore((s) => s.connection)
  const setSection = useStore((s) => s.setSettingsSection)
  /** 桌面端版本（壳）与 grok 终端版本（实际干活），排查问题时两者常需一起报 */
  const appVersion = useStore((s) => s.appVersion)
  const grokVersion = useStore((s) => s.diagnostics?.version ?? null)

  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null)
  const [busy, setBusy] = useState(false)
  /** 每周额度：菜单每次打开都取一次（主进程 60s 缓存 + 这里每次强制回源） */
  const [quota, setQuota] = useState<BillingQuota | null>(null)
  const [quotaError, setQuotaError] = useState('')

  useEffect(() => {
    let alive = true
    void window.grok
      .billingQuota(true)
      .then((res) => {
        if (!alive) return
        setQuota(res.quota)
        setQuotaError(res.error)
      })
      .catch(() => {
        if (alive) setQuotaError('额度暂不可用')
      })
    return () => {
      alive = false
    }
  }, [])

  // 贴着左下角头像行、向上弹出
  useLayoutEffect(() => {
    if (!anchor) return
    const place = (): void => {
      const r = anchor.getBoundingClientRect()
      setPos({ left: r.left, bottom: window.innerHeight - r.top + 6 })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor])

  // 点击外部 / Esc 关闭
  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (menuRef.current?.contains(e.target as Node)) return
      if (anchor?.contains(e.target as Node)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [anchor, onClose])

  if (!pos) return null

  const onLogout = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      await logoutAccount()
    } finally {
      setBusy(false)
      onClose()
    }
  }

  const displayName =
    [account?.firstName, account?.lastName].filter(Boolean).join(' ') || account?.email || '未登录'
  const versionLabel = appVersion
    ? `v${appVersion.version}${appVersion.packaged ? '' : ' ·dev'}`
    : '版本未知'

  return (
    <div
      className="account-menu"
      ref={menuRef}
      style={{ left: pos.left, bottom: pos.bottom }}
      role="menu"
    >
      <div className="account-menu-head">
        <div className="account-menu-name">{displayName}</div>
        {account?.email && <div className="account-menu-email">{account.email}</div>}
        {/* 状态与版本压成一行文字，不做成独立入口 */}
        <div className="account-menu-status">
          <span className={`conn-dot conn-${connection.state}`} />
          {CONNECTION_LABEL[connection.state] ?? connection.state}
          <span className="account-menu-status-sep">·</span>
          {versionLabel}
          {grokVersion ? ` · grok ${grokVersion}` : ''}
        </div>
      </div>

      {connection.state === 'error' && connection.message && (
        <div className="account-menu-error" title={connection.message}>
          {connection.message}
        </div>
      )}

      {/* 每周额度（对齐 TUI `/usage` 的 Usage limit 页）：已用百分比 + 细进度条 */}
      <button
        className="account-menu-quota"
        role="menuitem"
        title={
          quota
            ? `${quota.periodType.replace('USAGE_PERIOD_TYPE_', '')}：${quota.periodStart.slice(0, 10)} 至 ${quota.periodEnd.slice(0, 10)}\n剩余 ${quota.remainingPercent}%\n点击打开「设置 → 用量」`
            : `${quotaError || '额度信息不可用'}\n点击打开「设置 → 用量」`
        }
        onClick={() => {
          // 额度是账号级口径 → 直接跳到设置里的「用量」分区
          setSection('usage')
          onClose()
        }}
      >
        <IconGauge size={15} />
        <span className="account-menu-quota-label">
          {quota ? `${quota.periodType.replace('USAGE_PERIOD_TYPE_', '').toLowerCase() === 'weekly' ? '每周' : '本周期'}用量` : '用量额度'}
        </span>
        <span className={`account-menu-quota-value is-${quota ? quotaLevel(quota.usedPercent) : 'none'}`}>
          {quotaLabel(quota, quotaError)}
        </span>
        <span className={`quota-bar${quota ? ` is-${quotaLevel(quota.usedPercent)}` : ''}`}>
          <span
            className="quota-bar-fill"
            style={{ width: `${Math.min(100, Math.max(2, quota?.usedPercent ?? 0))}%` }}
          />
        </span>
      </button>

      <button
        className="account-menu-item"
        onClick={() => {
          setSection('general')
          onClose()
        }}
        role="menuitem"
      >
        <IconGear size={15} />
        设置
      </button>

      <div className="account-menu-sep" />

      <button
        className="account-menu-item is-danger"
        onClick={() => void onLogout()}
        disabled={busy || !account}
        role="menuitem"
      >
        <IconPower size={15} />
        {busy ? '退出中…' : '退出登录'}
      </button>
    </div>
  )
}