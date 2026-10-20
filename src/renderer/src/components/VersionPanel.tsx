import { useEffect, useState } from 'react'

import { cleanError, refreshDiagnostics } from '../actions'
import { useStore } from '../store'
import { useT } from '../i18n'
import type { GrokUpdateInfo, GrokVersionInfo } from '@shared/types'
import ConfirmDialog from './ConfirmDialog'
import type { ConfirmSpec } from './ConfirmDialog'
import { IconDownload, IconRefresh } from './Icons'

/* ------------------------------------------------------------------ *
 *  版本与更新 —— 设置中心「版本与更新」分区
 *
 *  客户端与终端版共用同一份 agent（~/.grok/bin/grok.exe），所以升级 grok 会同时
 *  影响两端。这里把 `grok version` 与 `grok update` 摆到明面上：
 *  先看有没有新版本，再决定是否安装（安装会自动重启 agent）。
 *
 *  账号菜单 / 关于面板读的是 store.diagnostics.version（启动时跑一次的自检缓存）。
 *  本面板自己的 `version` state 和那份缓存是两路：只刷新本地 state 的话，
 *  设置页已显示 1.0.62、左下角账号菜单仍卡在旧号 —— 所以 check/install 后
 *  必须顺带 refreshDiagnostics。
 * ------------------------------------------------------------------ */

export default function VersionPanel(): JSX.Element {
  const t = useT()
  const cwd = useStore((s) => s.cwd)

  const [version, setVersion] = useState<GrokVersionInfo | null>(null)
  const [update, setUpdate] = useState<GrokUpdateInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [output, setOutput] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null)
  const [alpha, setAlpha] = useState(false)

  const check = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const [ver, upd] = await Promise.all([
        window.grok.versionInfo(cwd),
        window.grok.updateCheck(cwd)
      ])
      setVersion(ver)
      setUpdate(upd)
      // 同步账号菜单 / 关于面板上的 grok 版本号（与本面板是两套数据源）
      void refreshDiagnostics()
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void check()
    // 进入面板检查一次即可
  }, [])

  const install = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    // 实测走代理要下载 ~170MB、耗时 3 分半且全程无输出 —— 必须立刻告知，否则一定被当成卡死
    setOutput(t('panels.version.installingOutput'))
    try {
      const text = await window.grok.updateInstall({ alpha })
      setOutput((text ? `${text}\n\n` : '') + t('panels.version.installDoneSuffix'))
    } catch (err) {
      setError(cleanError(err))
      setOutput(null)
    } finally {
      setBusy(false)
      await check()
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-page-title">{t('panels.version.title')}</div>
      <div className="settings-page-sub">{t('panels.version.subtitle')}</div>

      {error && <div className="mcp-form-error">{error}</div>}
      {output && <pre className="mcp-doctor">{output}</pre>}

      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-label">
            <span className="settings-row-title">{t('panels.version.currentTitle')}</span>
            <span className="settings-row-desc">{version?.raw || t('panels.version.currentReading')}</span>
          </div>
          <div className="version-cell">
            <code className="account-mono">{version?.version || '—'}</code>
            {update && (
              <span className={update.updateAvailable ? 'version-tag is-new' : 'version-tag'}>
                {update.updateAvailable
                  ? t('panels.version.updateAvailableTag', { version: update.latestVersion })
                  : t('panels.version.upToDateTag', { channel: update.channel || 'stable' })}
              </span>
            )}
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-label">
            <span className="settings-row-title">{t('panels.version.updateRowTitle')}</span>
            <span className="settings-row-desc">{t('panels.version.updateRowDesc')}</span>
          </div>
          <div className="close-action-setting">
            <label className="mcp-toggle" title={t('panels.version.alphaChannelTitle')}>
              <input
                type="checkbox"
                checked={alpha}
                disabled={busy}
                onChange={(e) => setAlpha(e.target.checked)}
              />
              {t('panels.version.alphaChannel')}
            </label>
            <button className="btn btn-ghost" disabled={busy} onClick={() => void check()}>
              <IconRefresh size={13} />
              {t('panels.version.checkUpdate')}
            </button>
            <button
              className="btn btn-primary"
              disabled={busy || !update?.updateAvailable}
              onClick={() =>
                setConfirm({
                  title: t('panels.version.confirmTitle'),
                  message: t('panels.version.confirmMessage', {
                    from: update?.currentVersion ?? '',
                    to: update?.latestVersion ?? '',
                    alpha: alpha ? t('panels.version.confirmAlphaSuffix') : ''
                  }),
                  detail: t('panels.version.confirmDetail'),
                  confirmText: t('panels.version.confirmOk'),
                  cancelText: t('common.cancel'),
                  onConfirm: () => void install()
                })
              }
            >
              <IconDownload size={13} />
              {busy ? t('panels.version.busy') : t('panels.version.installUpdate')}
            </button>
          </div>
        </div>

        {update?.autoUpdate && (
          <div className="mcp-hint">{t('panels.version.autoUpdateHint')}</div>
        )}
      </div>

      {/* ⚠️ 这段以前漏了：onClick 只 setConfirm 而没渲染弹窗 → 点「安装更新」毫无反应 */}
      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  )
}