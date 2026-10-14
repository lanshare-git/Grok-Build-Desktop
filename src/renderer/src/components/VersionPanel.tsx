import { useEffect, useState } from 'react'

import { cleanError } from '../actions'
import { useStore } from '../store'
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
 * ------------------------------------------------------------------ */

export default function VersionPanel(): JSX.Element {
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
    setOutput('正在下载并替换 grok agent（约 170MB，走代理通常需要 3-4 分钟，请勿关闭）…')
    try {
      const text = await window.grok.updateInstall({ alpha })
      setOutput(
        (text ? `${text}\n\n` : '') +
          '更新命令已结束。若上方没有出现「installed successfully」，多半是下载未完成或替换失败；' +
          '可关闭客户端后在终端执行 `grok update` 重试。'
      )
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
      <div className="settings-page-title">版本与更新</div>
      <div className="settings-page-sub">
        桌面端与终端版共用同一个 grok agent，升级会同时更新两端
      </div>

      {error && <div className="mcp-form-error">{error}</div>}
      {output && <pre className="mcp-doctor">{output}</pre>}

      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-label">
            <span className="settings-row-title">当前版本</span>
            <span className="settings-row-desc">{version?.raw || '正在读取…'}</span>
          </div>
          <div className="version-cell">
            <code className="account-mono">{version?.version || '—'}</code>
            {update && (
              <span className={update.updateAvailable ? 'version-tag is-new' : 'version-tag'}>
                {update.updateAvailable
                  ? `可更新至 ${update.latestVersion}`
                  : `已是最新（${update.channel || 'stable'} 通道）`}
              </span>
            )}
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-label">
            <span className="settings-row-title">更新</span>
            <span className="settings-row-desc">
              等价终端 <code>grok update</code>：需下载并替换整个 agent（约 170MB，走代理实测约 3-4 分钟）。
              完成后会自动重启 agent 让新版本生效，正在进行的回合会中断
            </span>
          </div>
          <div className="close-action-setting">
            <label className="mcp-toggle" title="安装时走 alpha 通道">
              <input
                type="checkbox"
                checked={alpha}
                disabled={busy}
                onChange={(e) => setAlpha(e.target.checked)}
              />
              Alpha 通道
            </label>
            <button className="btn btn-ghost" disabled={busy} onClick={() => void check()}>
              <IconRefresh size={13} />
              检查更新
            </button>
            <button
              className="btn btn-primary"
              disabled={busy || !update?.updateAvailable}
              onClick={() =>
                setConfirm({
                  title: '现在更新 Grok Build？',
                  message: (
                    <>
                      将从 <strong>{update?.currentVersion}</strong> 更新到{' '}
                      <strong>{update?.latestVersion}</strong>
                      {alpha && '（alpha 通道）'}。
                    </>
                  ),
                  detail:
                    '更新会替换 ~/.grok/bin/grok.exe 并重启 agent。若当前有回合正在生成，请先等它结束。',
                  confirmText: '更新',
                  cancelText: '取消',
                  onConfirm: () => void install()
                })
              }
            >
              <IconDownload size={13} />
              {busy ? '处理中…' : '安装更新'}
            </button>
          </div>
        </div>

        {update?.autoUpdate && (
          <div className="mcp-hint">
            grok 配置里开启了自动更新（auto_update = true），多数情况下它会自己升级；这里的按钮用于立即更新或切换通道。
          </div>
        )}
      </div>

      {/* ⚠️ 这段以前漏了：onClick 只 setConfirm 而没渲染弹窗 → 点「安装更新」毫无反应 */}
      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  )
}