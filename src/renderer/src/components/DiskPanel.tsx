import { useEffect, useState } from 'react'

import { cleanError } from '../actions'
import { useStore } from '../store'
import { useT } from '../i18n'
import type { DiskUsageReport, MemoryClearScope } from '@shared/types'
import ConfirmDialog from './ConfirmDialog'
import type { ConfirmSpec } from './ConfirmDialog'
import { IconRefresh } from './Icons'

/* ------------------------------------------------------------------ *
 *  存储占用 —— 设置中心「存储占用」分区
 *
 *  数据来自 `grok du --json`（等价终端 du / disk-usage）：列出 ~/.grok 下每个
 *  顶层目录的占用，最大的排在前面；另含跨会话记忆的清理入口。
 *  worktree 与版本更新已各自独立成分区，不在这里混排。
 * ------------------------------------------------------------------ */

function fmtBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
}

export default function DiskPanel(): JSX.Element {
  const t = useT()
  const cwd = useStore((s) => s.cwd)

  const [du, setDu] = useState<DiskUsageReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null)

  const reload = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      setDu(await window.grok.diskUsage(cwd))
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // 进入面板刷新一次即可
  }, [])

  const clearMemory = async (scope: MemoryClearScope, doneText: string): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await window.grok.memoryClear(scope, cwd)
      setNotice(doneText)
      await reload()
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setBusy(false)
    }
  }

  const maxDir = du?.dirs[0]?.bytes ?? 1

  return (
    <div className="settings-page">
      <div className="settings-page-title">{t('panels.disk.title')}</div>
      <div className="settings-page-sub">{t('panels.disk.subtitle')}</div>

      {error && <div className="mcp-form-error">{error}</div>}
      {notice && <div className="mcp-hint">{notice}</div>}

      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-label">
            <span className="settings-row-title">{t('panels.disk.sectionTitle')}</span>
            <span className="settings-row-desc">
              {du?.grokHome
                ? t('panels.disk.sectionDesc', { home: du.grokHome, total: fmtBytes(du.totalBytes) })
                : t('panels.disk.sectionLoading')}
            </span>
          </div>
          <button className="btn btn-ghost" disabled={loading} onClick={() => void reload()}>
            <IconRefresh size={13} />
            {t('panels.disk.refresh')}
          </button>
        </div>
        <div className="du-list">
          {(du?.dirs ?? []).map((d) => (
            <div key={d.name} className="du-row" title={`${d.name} · ${fmtBytes(d.bytes)}`}>
              <span className="du-name">{d.name}</span>
              <span className="du-bar">
                <span
                  className="du-bar-fill"
                  style={{ width: `${Math.max(2, Math.round((d.bytes / maxDir) * 100))}%` }}
                />
              </span>
              <span className="du-bytes">{fmtBytes(d.bytes)}</span>
            </div>
          ))}
          {(du?.dirs.length ?? 0) === 0 && !loading && <div className="mcp-hint">{t('panels.disk.empty')}</div>}
        </div>
        {du && du.dirs.length > 0 && (
          <div className="mcp-hint">{t('panels.disk.hint')}</div>
        )}
      </div>

      {/* 跨会话记忆：本质也是「存储」，故与磁盘占用放一起 */}
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-label">
            <span className="settings-row-title">{t('panels.disk.memoryTitle')}</span>
            <span className="settings-row-desc">{t('panels.disk.memoryDesc')}</span>
          </div>
          <div className="close-action-setting">
            <button
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => void clearMemory('workspace', t('panels.disk.clearWorkspaceDone'))}
            >
              {t('panels.disk.clearWorkspace')}
            </button>
            <button
              className="btn btn-danger"
              disabled={busy}
              onClick={() =>
                setConfirm({
                  title: t('panels.disk.clearAllConfirmTitle'),
                  message: t('panels.disk.clearAllConfirmMessage'),
                  detail: t('panels.disk.clearAllConfirmDetail'),
                  confirmText: t('panels.disk.clearAllConfirmOk'),
                  cancelText: t('common.cancel'),
                  danger: true,
                  onConfirm: () => void clearMemory('all', t('panels.disk.clearAllDone'))
                })
              }
            >
              {t('panels.disk.clearAll')}
            </button>
          </div>
        </div>
      </div>

      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  )
}