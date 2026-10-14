import { useEffect, useState } from 'react'

import { cleanError, refreshEnvInfo } from '../actions'
import { useStore } from '../store'
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
      setError('请填写插件来源：git 地址、user/repo 或本地路径。')
      return
    }
    void run(async () => {
      setPlugins(await window.grok.pluginInstall(value, cwd))
    }, `已安装 ${value}`)
    setSource('')
  }

  const askUninstall = (plugin: PluginInfo): void => {
    setConfirm({
      title: '卸载插件？',
      message: (
        <>
          将卸载 <strong>{plugin.name}</strong>，其提供的 hook / MCP / 技能一并失效。
        </>
      ),
      detail: '卸载后会自动重启 agent。若只是临时停用，建议改用「禁用」。',
      confirmText: '卸载',
      cancelText: '取消',
      danger: true,
      onConfirm: () =>
        void run(async () => {
          setPlugins(await window.grok.pluginUninstall(plugin.name, cwd))
        }, `已卸载 ${plugin.name}`)
    })
  }

  const askRemoveMarket = (market: Marketplace): void => {
    setConfirm({
      title: '移除插件市场？',
      message: (
        <>
          将移除市场源 <strong>{market.name}</strong>。
        </>
      ),
      detail: '该来源下已安装的插件会一并被卸载。',
      confirmText: '移除',
      cancelText: '取消',
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
      setError('请填写市场源来源。')
      return
    }
    void run(async () => {
      setNotice(await window.grok.marketplaceAdd(value, cwd))
      setMarketSource('')
    }, `已添加市场源 ${value}`)
  }

  return (
    <div className="settings-page">
      <div className="settings-page-title">插件</div>
      <div className="settings-page-sub">
        扩展 grok 的能力（hook / MCP / 技能）。与终端版共用 ~/.grok，改动即时同步。
      </div>

      <div className="drawer-actions">
        <button className="btn btn-ghost" onClick={() => void reload()} disabled={loading}>
          <IconRefresh size={13} />
          刷新
        </button>
        <button
          className="btn btn-ghost"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              setNotice(await window.grok.marketplaceUpdate(cwd))
            }, '市场源已刷新')
          }
        >
          更新市场缓存
        </button>
      </div>

      {error && <div className="mcp-form-error">{error}</div>}
      {notice && <div className="mcp-hint">{notice}</div>}

      {/* 安装 */}
      <div className="mcp-form">
        <div className="mcp-form-head">从来源安装插件</div>
        <label className="mcp-field">
          <span>来源</span>
          <input
            className="mcp-input"
            value={source}
            spellCheck={false}
            placeholder="https://github.com/user/plugin.git ｜ user/repo ｜ D:\local\plugin"
            onChange={(e) => setSource(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') install()
            }}
          />
          <span className="mcp-hint">
            安装时自动视为已信任（桌面端没有可交互的确认提示）；来源可信度请自行确认。
          </span>
        </label>
        <div className="mcp-form-actions">
          <button className="btn btn-primary" disabled={busy} onClick={install}>
            <IconPlus size={13} />
            {busy ? '处理中…' : '安装'}
          </button>
        </div>
      </div>

      {/* 已安装 */}
      <div className="mcp-list">
        {loading && <div className="mcp-empty">正在读取插件列表…</div>}
        {!loading && plugins.length === 0 && (
          <div className="mcp-empty">
            <IconPlug size={26} />
            <p>还没有安装插件</p>
            <span>可从上方市场源或任意 git 地址安装；终端等价命令：grok plugin install</span>
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
              <label className="mcp-toggle" title={plugin.enabled ? '点击禁用' : '点击启用'}>
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
                {plugin.enabled ? '已启用' : '已禁用'}
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
                组件清单
              </button>
              <button className="icon-btn danger" title="卸载" onClick={() => askUninstall(plugin)}>
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
            <span className="settings-row-title">插件市场</span>
            <span className="settings-row-desc">已配置的插件来源（grok plugin marketplace list）</span>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-label">
            <span className="settings-row-title">添加市场源</span>
            <span className="settings-row-desc">git 地址、GitHub 简写或本地路径</span>
          </div>
          <div className="close-action-setting">
            <input
              className="mcp-input"
              value={marketSource}
              spellCheck={false}
              placeholder="user/repo 或 https://github.com/user/marketplace.git"
              onChange={(e) => setMarketSource(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addMarket()
              }}
            />
            <button className="btn btn-primary" disabled={busy || !marketSource.trim()} onClick={addMarket}>
              <IconPlus size={13} />
              添加
            </button>
          </div>
        </div>

        <div className="market-list">
          {markets.length === 0 && <div className="mcp-hint">尚未配置市场源。</div>}
          {markets.map((m) => (
            <div key={m.name} className="market-item">
              <div className="market-name">{m.name}</div>
              <code className="market-git">{m.git || '(本地路径)'}</code>
              <button
                className="icon-btn danger"
                title="移除该市场源"
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
            <span className="settings-row-title">内置技能与子代理</span>
            <span className="settings-row-desc">
              输入「/」即可调用技能；@ 前缀为子代理。清单来自 grok inspect（{envInfo?.cwd ?? cwd}）
            </span>
          </div>
          <button className="btn btn-ghost" disabled={busy} onClick={() => void refreshEnvInfo(cwd)}>
            <IconRefresh size={13} />
            刷新
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
          {!envInfo && <div className="mcp-hint">正在读取…</div>}
        </div>
      </div>

      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  )
}