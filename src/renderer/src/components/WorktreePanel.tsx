import { useEffect, useState } from 'react'

import { cleanError } from '../actions'
import { useStore } from '../store'
import { useT } from '../i18n'
import type { WorktreeInfo } from '@shared/types'
import ConfirmDialog from './ConfirmDialog'
import type { ConfirmSpec } from './ConfirmDialog'
import { IconBox, IconFolder, IconRefresh, IconTrash } from './Icons'

/* ------------------------------------------------------------------ *
 *  Git worktree —— 设置中心「Worktree」分区
 *
 *  worktree = 终端 `grok -w` 的机制：每个 worktree 是一份独立代码副本，
 *  在其中开会话与主仓库互不干扰。创建入口在侧栏工作目录行的 ⧉ 按钮，
 *  这里负责查看、删除与批量回收闲置副本。
 * ------------------------------------------------------------------ */

function fmtWhen(ms: number): string {
  if (!ms) return '—'
  const d = new Date(ms)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function WorktreePanel(): JSX.Element {
  const t = useT()
  const cwd = useStore((s) => s.cwd)

  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [output, setOutput] = useState<string | null>(null)
  const [gcAge, setGcAge] = useState('7d')
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null)

  const reload = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      setWorktrees(await window.grok.worktreeList(cwd))
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

  const run = async (fn: () => Promise<string>, label: string): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(null)
    setOutput(null)
    try {
      setOutput(await fn())
      setOutput((prev) => prev || `${label}${t('panels.worktree.gcDoneSuffix')}`)
      await reload()
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setBusy(false)
    }
  }

  const doRemove = async (w: WorktreeInfo, force: boolean): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(null)
    setOutput(null)
    try {
      const text = await window.grok.worktreeRemove({ id: w.id, force })
      setOutput(text || t('panels.worktree.removeDone'))
      await reload()
    } catch (err) {
      if (!force) {
        // 普通删除被 grok 拒绝：询问是否强制删除，不显示错误
        setConfirm({
          title: t('panels.worktree.forceConfirmTitle'),
          message: t('panels.worktree.forceConfirmMessage', { name: w.label || w.id }),
          detail: t('panels.worktree.forceConfirmDetail'),
          confirmText: t('panels.worktree.forceConfirmOk'),
          cancelText: t('common.cancel'),
          danger: true,
          onConfirm: () => void doRemove(w, true)
        })
      } else {
        setError(cleanError(err))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-page-title">{t('panels.worktree.title')}</div>
      <div className="settings-page-sub">{t('panels.worktree.subtitle')}</div>

      {error && <div className="mcp-form-error">{error}</div>}
      {output && <pre className="mcp-doctor">{output}</pre>}

      <div className="mcp-list">
        {loading && <div className="mcp-empty">{t('panels.worktree.loading')}</div>}
        {!loading && worktrees.length === 0 && (
          <div className="mcp-empty">
            <IconBox size={24} />
            <p>{t('panels.worktree.emptyTitle')}</p>
            <span>{t('panels.worktree.emptyHint')}</span>
          </div>
        )}

        {worktrees.map((w) => (
          <div key={w.id} className="mcp-card">
            <div className="mcp-card-head">
              <div className="mcp-card-title">
                <IconFolder size={13} />
                {w.label || w.repoName || w.id}
                <span className="mcp-scope">{w.kind}</span>
              </div>
              <span className="mcp-scope">{w.status}</span>
            </div>
            <div className="mcp-card-cmd" title={w.path}>
              {w.path}
            </div>
            <div className="mcp-card-sub">
              {t('panels.worktree.metaRepo')} {w.repoName || '—'} · {t('panels.worktree.metaBranch')}{' '}
              {w.branch || 'HEAD'} · {t('panels.worktree.metaCreated')} {fmtWhen(w.createdAt)}
              {w.lastAccessedAt
                ? t('panels.worktree.metaAccessed', { time: fmtWhen(w.lastAccessedAt) })
                : ''}
            </div>
            <div className="mcp-card-actions">
              <button className="btn btn-ghost" onClick={() => void window.grok.revealPath(w.path)}>
                {t('panels.worktree.openDir')}
              </button>
              <button
                className="icon-btn danger"
                title={t('panels.worktree.removeTitle')}
                onClick={() =>
                  setConfirm({
                    title: t('panels.worktree.removeConfirmTitle'),
                    message: t('panels.worktree.removeConfirmMessage', { name: w.label || w.id }),
                    detail: t('panels.worktree.removeConfirmDetail', { path: w.path }),
                    confirmText: t('common.delete'),
                    cancelText: t('common.cancel'),
                    danger: true,
                    onConfirm: () => void doRemove(w, false)
                  })
                }
              >
                <IconTrash size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-label">
            <span className="settings-row-title">{t('panels.worktree.gcSectionTitle')}</span>
            <span className="settings-row-desc">{t('panels.worktree.gcSectionDesc')}</span>
          </div>
          <div className="close-action-setting">
            <button className="btn btn-ghost" disabled={loading} onClick={() => void reload()}>
              <IconRefresh size={13} />
              {t('panels.worktree.refresh')}
            </button>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <span className="settings-row-title">{t('panels.worktree.gcAgeTitle')}</span>
            <span className="settings-row-desc">{t('panels.worktree.gcAgeDesc')}</span>
          </div>
          <div className="close-action-setting">
            <input
              className="mcp-input mcp-age-input"
              value={gcAge}
              spellCheck={false}
              placeholder="7d"
              onChange={(e) => setGcAge(e.target.value)}
            />
            <button
              className="btn btn-ghost"
              disabled={busy}
              onClick={() =>
                void run(() => window.grok.worktreeGc({ maxAge: gcAge, dryRun: true, cwd }), t('panels.worktree.gcPreviewLabel'))
              }
            >
              {t('panels.worktree.gcPreview')}
            </button>
            <button
              className="btn btn-danger"
              disabled={busy || !gcAge.trim()}
              onClick={() =>
                setConfirm({
                  title: t('panels.worktree.gcConfirmTitle'),
                  message: t('panels.worktree.gcConfirmMessage', { age: gcAge }),
                  detail: t('panels.worktree.gcConfirmDetail'),
                  confirmText: t('panels.worktree.gcRun'),
                  cancelText: t('common.cancel'),
                  danger: true,
                  onConfirm: () =>
                    void run(() => window.grok.worktreeGc({ maxAge: gcAge, cwd }), t('panels.worktree.gcRunLabel'))
                })
              }
            >
              {t('panels.worktree.gcRun')}
            </button>
          </div>
        </div>
      </div>

      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  )
}