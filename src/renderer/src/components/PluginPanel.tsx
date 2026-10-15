import { useEffect, useState } from 'react'

import { cleanError, refreshEnvInfo } from '../actions'
import { useStore } from '../store'
import { useT } from '../i18n'
import type { PluginInfo } from '@shared/types'
import ConfirmDialog from './ConfirmDialog'
import type { ConfirmSpec } from './ConfirmDialog'
import { IconPlug, IconPlus, IconRefresh, IconTrash } from './Icons'

/* ------------------------------------------------------------------ *
 *  插件与插件市场 —— 设置中心「插件」分区
 *
 *  对齐终端的 `grok plugin *` / `grok plugin marketplace *`。
 *  插件可携带 hook / MCP 服务器 / 技能，装卸与启停都会改动 agent 的行为，
 *  因此主进程在写操作后会自动重启 agent（与 MCP 面板同一语义）。
 *  配置与终端共用 ~/.grok，两边看到的是同一份状态。
 * ------------------------------------------------------------------ */

interface Marketplace {
  name: string
  git: string
}

export default function PluginPanel(): JSX.Element {
  const t = useT()
  const cwd = useStore((s) => s.cwd)
  const envInfo = useStore((s) => s.envInfo)

  const [plugins, setPlugins] = useState<PluginInfo[]>([])
  const [markets, setMarkets] = useState<Marketplace[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [source, setSource] = useState('')
  const [marketSource, setMarketSource] = useState('')
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null)
  const [details, setDetails] = useState<{ name: string; text: string } | null>(null)

  const reload = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const [p, m] = await Promise.all([
        window.grok.pluginList(cwd),
        window.grok.marketplaceList(cwd)
      ])
      setPlugins(p)
      setMarkets(m)
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // 技能/子代理清单来自 grok inspect，和插件一样属于「可安装的能力」，一并在这里展示
    void refreshEnvInfo(cwd)
    // 仅在进入面板时刷新一次；cwd 变化由设置中心重挂载触发
  }, [])

  const run = async (fn: () => Promise<unknown>, okText?: string): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await fn()
      if (okText) setNotice(okText)
      await reload()
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setBusy(false)
    }
  }

  const install = (): void => {
    const value = source.trim()
    if (!value) {
      setError(t('panels.plugins.errSourceRequired'))
      return
    }
    void run(async () => {
      setPlugins(await window.grok.pluginInstall(value, cwd))
    }, t('panels.plugins.installed', { source: value }))
    setSource('')
  }

  const askUninstall = (plugin: PluginInfo): void => {
    setConfirm({
      title: t('panels.plugins.uninstallConfirmTitle'),
      message: t('panels.plugins.uninstallConfirmMessage', { name: plugin.name }),
      detail: t('panels.plugins.uninstallConfirmDetail'),
      confirmText: t('panels.plugins.uninstallConfirmOk'),
      cancelText: t('common.cancel'),
      danger: true,
      onConfirm: () =>
        void run(async () => {
          setPlugins(await window.grok.pluginUninstall(plugin.name, cwd))
        }, t('panels.plugins.uninstalled', { name: plugin.name }))
    })
  }

  const askRemoveMarket = (market: Marketplace): void => {
    setConfirm({
      title: t('panels.plugins.marketRemoveConfirmTitle'),
      message: t('panels.plugins.marketRemoveConfirmMessage', { name: market.name }),
      detail: t('panels.plugins.marketRemoveConfirmDetail'),
      confirmText: t('panels.plugins.marketRemoveConfirmOk'),
      cancelText: t('common.cancel'),
      danger: true,
      onConfirm: () =>
        void run(async () => {
          const text = await window.grok.marketplaceRemove(market.name, cwd)
          setNotice(text)
        })
    })
  }

  const addMarket = (): void => {
    const value = marketSource.trim()
    if (!value) {
      setError(t('panels.plugins.errMarketSourceRequired'))
      return
    }
    void run(async () => {
      setNotice(await window.grok.marketplaceAdd(value, cwd))
      setMarketSource('')
    }, t('panels.plugins.marketAdded', { source: value }))
  }

  return (
    <div className="settings-page">
      <div className="settings-page-title">{t('panels.plugins.title')}</div>
      <div className="settings-page-sub">{t('panels.plugins.subtitle')}</div>

      <div className="drawer-actions">
        <button className="btn btn-ghost" onClick={() => void reload()} disabled={loading}>
          <IconRefresh size={13} />
          {t('panels.plugins.refresh')}
        </button>
        <button
          className="btn btn-ghost"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              setNotice(await window.grok.marketplaceUpdate(cwd))
            }, t('panels.plugins.marketCacheUpdated'))
          }
        >
          {t('panels.plugins.updateMarketCache')}
        </button>
      </div>

      {error && <div className="mcp-form-error">{error}</div>}
      {notice && <div className="mcp-hint">{notice}</div>}

      {/* 安装 */}
      <div className="mcp-form">
        <div className="mcp-form-head">{t('panels.plugins.installTitle')}</div>
        <label className="mcp-field">
          <span>{t('panels.plugins.fieldSource')}</span>
          <input
            className="mcp-input"
            value={source}
            spellCheck={false}
            placeholder={t('panels.plugins.sourcePlaceholder')}
            onChange={(e) => setSource(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') install()
            }}
          />
          <span className="mcp-hint">{t('panels.plugins.sourceHint')}</span>
        </label>
        <div className="mcp-form-actions">
          <button className="btn btn-primary" disabled={busy} onClick={install}>
            <IconPlus size={13} />
            {busy ? t('panels.plugins.installing') : t('panels.plugins.install')}
          </button>
        </div>
      </div>

      {/* 已安装 */}
      <div className="mcp-list">
        {loading && <div className="mcp-empty">{t('panels.plugins.loadingList')}</div>}
        {!loading && plugins.length === 0 && (
          <div className="mcp-empty">
            <IconPlug size={26} />
            <p>{t('panels.plugins.emptyTitle')}</p>
            <span>{t('panels.plugins.emptyHint')}</span>
          </div>
        )}

        {plugins.map((plugin) => (
          <div key={plugin.name} className={`mcp-card${plugin.enabled ? '' : ' is-disabled'}`}>
            <div className="mcp-card-head">
              <div className="mcp-card-title">
                <span className={`mcp-dot ${plugin.enabled ? 'on' : 'off'}`} />
                {plugin.name}
                {plugin.version && <span className="mcp-scope">v{plugin.version}</span>}
              </div>
            </div>
            {plugin.description && <div className="mcp-card-cmd">{plugin.description}</div>}
            {plugin.source && <div className="mcp-card-cmd">{plugin.source}</div>}
            <div className="mcp-card-actions">
              <label className="mcp-toggle" title={plugin.enabled ? t('panels.plugins.toggleDisableTitle') : t('panels.plugins.toggleEnableTitle')}>
                <input
                  type="checkbox"
                  checked={plugin.enabled}
                  disabled={busy}
                  onChange={(e) =>
                    void run(async () => {
                      setPlugins(
                        await window.grok.pluginSetEnabled(plugin.name, e.target.checked, cwd)
                      )
                    })
                  }
                />
                {plugin.enabled ? t('panels.plugins.enabled') : t('panels.plugins.disabled')}
              </label>
              <button
                className="btn btn-ghost"
                onClick={() =>
                  void run(async () => {
                    setDetails({ name: plugin.name, text: await window.grok.pluginDetails(plugin.name, cwd) })
                  })
                }
                disabled={busy}
              >
                {t('panels.plugins.details')}
              </button>
              <button className="icon-btn danger" title={t('panels.plugins.uninstallTitle')} onClick={() => askUninstall(plugin)}>
                <IconTrash size={14} />
              </button>
            </div>
            {details?.name === plugin.name && (
              <pre className="mcp-doctor">{details.text}</pre>
            )}
          </div>
        ))}
      </div>

      {/* 市场源 */}
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-label">
            <span className="settings-row-title">{t('panels.plugins.marketSectionTitle')}</span>
            <span className="settings-row-desc">{t('panels.plugins.marketSectionDesc')}</span>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-label">
            <span className="settings-row-title">{t('panels.plugins.marketAddTitle')}</span>
            <span className="settings-row-desc">{t('panels.plugins.marketAddDesc')}</span>
          </div>
          <div className="close-action-setting">
            <input
              className="mcp-input"
              value={marketSource}
              spellCheck={false}
              placeholder={t('panels.plugins.marketAddPlaceholder')}
              onChange={(e) => setMarketSource(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addMarket()
              }}
            />
            <button className="btn btn-primary" disabled={busy || !marketSource.trim()} onClick={addMarket}>
              <IconPlus size={13} />
              {t('panels.plugins.marketAdd')}
            </button>
          </div>
        </div>

        <div className="market-list">
          {markets.length === 0 && <div className="mcp-hint">{t('panels.plugins.marketEmpty')}</div>}
          {markets.map((m) => (
            <div key={m.name} className="market-item">
              <div className="market-name">{m.name}</div>
              <code className="market-git">{m.git || t('panels.plugins.marketLocalPath')}</code>
              <button
                className="icon-btn danger"
                title={t('panels.plugins.marketRemoveTitle')}
                onClick={() => askRemoveMarket(m)}
              >
                <IconTrash size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 技能与子代理：终端里它们也是命令面板的一部分（/learn、/review…） */}
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-label">
            <span className="settings-row-title">{t('panels.plugins.skillsTitle')}</span>
            <span className="settings-row-desc">
              {t('panels.plugins.skillsDesc', { cwd: envInfo?.cwd ?? cwd })}
            </span>
          </div>
          <button className="btn btn-ghost" disabled={busy} onClick={() => void refreshEnvInfo(cwd)}>
            <IconRefresh size={13} />
            {t('panels.plugins.skillsRefresh')}
          </button>
        </div>
        <div className="skill-grid">
          {(envInfo?.skills ?? []).map((sk) => (
            <div key={sk.name} className="skill-chip" title={sk.description}>
              <span className="skill-name">/{sk.name}</span>
            </div>
          ))}
          {(envInfo?.agents ?? []).map((a) => (
            <div key={`agent-${a.name}`} className="skill-chip is-agent" title={a.description}>
              <span className="skill-name">@{a.name}</span>
            </div>
          ))}
          {!envInfo && <div className="mcp-hint">{t('panels.plugins.skillsLoading')}</div>}
        </div>
      </div>

      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  )
}