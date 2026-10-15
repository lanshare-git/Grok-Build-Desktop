import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { logoutAccount } from '../actions'
import { useT, useLocale, LOCALE_OPTIONS, type Locale, type MessageKey } from '../i18n'
import { t as tShared } from '@shared/i18n'
import { useStore } from '../store'
import type { BillingQuota, ConnectionState } from '@shared/types'
import { IconGauge, IconGear, IconGlobe, IconPower } from './Icons'

/** 额度档位：≥90% 红色告警，≥75% 橙色提醒 */
export function quotaLevel(percent: number): 'ok' | 'warn' | 'danger' {
  if (percent >= 90) return 'danger'
  if (percent >= 75) return 'warn'
  return 'ok'
}

/** 「本周用量 45% 已用」/ 「额度不可用」 */
export function quotaLabel(quota: BillingQuota | null, error: string, locale: Locale): string {
  if (!quota) return tShared(locale, error ? 'accountMenu.quota.unavailable' : 'accountMenu.quota.unknown')
  return tShared(locale, 'accountMenu.quota.used', {
    percent: quota.usedPercent.toFixed(quota.usedPercent % 1 === 0 ? 0 : 1)
  })
}

const CONNECTION_KEY: Record<ConnectionState, MessageKey> = {
  idle: 'accountMenu.conn.idle',
  starting: 'accountMenu.conn.starting',
  ready: 'accountMenu.conn.ready',
  error: 'accountMenu.conn.error',
  stopped: 'accountMenu.conn.stopped'
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
  const t = useT()
  const locale = useLocale()
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
  /** 语言子菜单展开态（切换语言不关闭菜单） */
  const [langOpen, setLangOpen] = useState(false)
  /** 用户显式选择的语言；null = 跟随系统，undefined = 尚未从主进程取回 */
  const [rawLocale, setRawLocale] = useState<Locale | null | undefined>(undefined)

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
        if (alive) setQuotaError(t('accountMenu.quota.unavailable'))
      })
    return () => {
      alive = false
    }
  }, [])

  // 菜单打开时回源一次语言设置（raw 决定「跟随系统」勾选态）
  useEffect(() => {
    let alive = true
    void window.grok.getLocale().then((res) => {
      if (alive) setRawLocale(res.raw)
    })
    return () => {
      alive = false
    }
  }, [])

  const pickLocale = async (value: Locale | null): Promise<void> => {
    const picked = await window.grok.setLocale(value)
    useStore.getState().setLocale(picked.resolved)
    setRawLocale(picked.raw)
  }

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
    [account?.firstName, account?.lastName].filter(Boolean).join(' ') || account?.email || t('accountMenu.notLoggedIn')
  const versionLabel = appVersion
    ? `v${appVersion.version}${appVersion.packaged ? '' : ' ·dev'}`
    : t('accountMenu.versionUnknown')

  const localeLabel =
    rawLocale === undefined
      ? ''
      : rawLocale === null
        ? t('common.followSystem')
        : (LOCALE_OPTIONS.find((o) => o.value === rawLocale)?.label ?? '')

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
          {t(CONNECTION_KEY[connection.state])}
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
            ? t('accountMenu.quota.tooltip', {
                period: quota.periodType.replace('USAGE_PERIOD_TYPE_', ''),
                start: quota.periodStart.slice(0, 10),
                end: quota.periodEnd.slice(0, 10),
                remaining: quota.remainingPercent
              })
            : t('accountMenu.quota.tooltipUnavailable', {
                error: quotaError || t('accountMenu.quota.tooltipErrorDefault')
              })
        }
        onClick={() => {
          // 额度是账号级口径 → 直接跳到设置里的「用量」分区
          setSection('usage')
          onClose()
        }}
      >
        <IconGauge size={15} />
        <span className="account-menu-quota-label">
          {quota
            ? quota.periodType.replace('USAGE_PERIOD_TYPE_', '').toLowerCase() === 'weekly'
              ? t('accountMenu.quota.weekly')
              : t('accountMenu.quota.period')
            : t('accountMenu.quota.fallback')}
        </span>
        <span className={`account-menu-quota-value is-${quota ? quotaLevel(quota.usedPercent) : 'none'}`}>
          {quotaLabel(quota, quotaError, locale)}
        </span>
        <span className={`quota-bar${quota ? ` is-${quotaLevel(quota.usedPercent)}` : ''}`}>
          <span
            className="quota-bar-fill"
            style={{ width: `${Math.min(100, Math.max(2, quota?.usedPercent ?? 0))}%` }}
          />
        </span>
      </button>

      {/* 语言 */}
      <button
        className="account-menu-item"
        onClick={() => setLangOpen((v) => !v)}
        role="menuitem"
        aria-expanded={langOpen}
      >
        <IconGlobe size={15} />
        {t('accountMenu.language')}
        <span className="account-menu-meta">
          {localeLabel}
          <span className="account-menu-caret">{langOpen ? '▾' : '▸'}</span>
        </span>
      </button>

      {langOpen && (
        <div className="account-menu-sub">
          <button className="account-menu-sub-item" onClick={() => void pickLocale(null)} role="menuitem">
            <span className="account-menu-sub-check">{rawLocale === null ? '✓' : ''}</span>
            {t('common.followSystem')}
          </button>
          {LOCALE_OPTIONS.map((o) => (
            <button
              key={o.value}
              className="account-menu-sub-item"
              onClick={() => void pickLocale(o.value)}
              role="menuitem"
            >
              <span className="account-menu-sub-check">{rawLocale === o.value ? '✓' : ''}</span>
              {o.label}
            </button>
          ))}
        </div>
      )}

      <button
        className="account-menu-item"
        onClick={() => {
          setSection('general')
          onClose()
        }}
        role="menuitem"
      >
        <IconGear size={15} />
        {t('accountMenu.settings')}
      </button>

      <div className="account-menu-sep" />

      <button
        className="account-menu-item is-danger"
        onClick={() => void onLogout()}
        disabled={busy || !account}
        role="menuitem"
      >
        <IconPower size={15} />
        {busy ? t('accountMenu.loggingOut') : t('accountMenu.logout')}
      </button>
    </div>
  )
}