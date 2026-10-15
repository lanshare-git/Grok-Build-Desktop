import { useEffect, useState } from 'react'

import { cleanError } from '../actions'
import { useStore } from '../store'
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
      setOutput((prev) => prev || `${label}完成。`)
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
      setOutput(text || '已删除 worktree。')
      await reload()
    } catch (err) {
      if (!force) {
        // 普通删除被 grok 拒绝：询问是否强制删除，不显示错误
        setConfirm({
          title: '强制删除？',
          message: (
            <>
              grok 拒绝删除 <strong>{w.label || w.id}</strong>，可能有未保存改动或进程占用。
            </>
          ),
          detail: '强制删除会丢弃 worktree 内未保存的工作，且不可撤销。',
          confirmText: '强制删除',
          cancelText: '取消',
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
      <div className="settings-page-title">Worktree</div>
      <div className="settings-page-sub">
        终端 <code>grok -w</code> 的同一套机制：每个 worktree 是一份独立代码副本，会话互不干扰
      </div>

      {error && <div className="mcp-form-error">{error}</div>}
      {output && <pre className="mcp-doctor">{output}</pre>}

      <div className="mcp-list">
        {loading && <div className="mcp-empty">正在读取 worktree…</div>}
        {!loading && worktrees.length === 0 && (
          <div className="mcp-empty">
            <IconBox size={24} />
            <p>当前没有 worktree</p>
            <span>在输入框旁的 + 菜单选「在 worktree 中新建任务」，或输入 /worktree。</span>
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
              仓库 {w.repoName || '—'} · 基线 {w.branch || 'HEAD'} · 创建 {fmtWhen(w.createdAt)}
              {w.lastAccessedAt ? ` · 最近访问 ${fmtWhen(w.lastAccessedAt)}` : ''}
            </div>
            <div className="mcp-card-actions">
              <button className="btn btn-ghost" onClick={() => void window.grok.revealPath(w.path)}>
                打开目录
              </button>
              <button
                className="icon-btn danger"
                title="删除 worktree"
                onClick={() =>
                  setConfirm({
                    title: '删除 worktree？',
                    message: (
                      <>
                        将删除 <strong>{w.label || w.id}</strong> 及其代码副本。
                      </>
                    ),
                    detail: `目录：${w.path}\n有未保存改动或进程占用时 grok 会拒绝删除；确认后可再强制删除。`,
                    confirmText: '删除',
                    cancelText: '取消',
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
            <span className="settings-row-title">清理闲置 worktree</span>
            <span className="settings-row-desc">
              gc 只回收超过指定闲置时长、且没有「找不到工作成果」的 worktree
            </span>
          </div>
          <div className="close-action-setting">
            <button className="btn btn-ghost" disabled={loading} onClick={() => void reload()}>
              <IconRefresh size={13} />
              刷新
            </button>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <span className="settings-row-title">闲置时长</span>
            <span className="settings-row-desc">建议先「预览」确认清单，再执行清理</span>
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
                void run(() => window.grok.worktreeGc({ maxAge: gcAge, dryRun: true, cwd }), '预览')
              }
            >
              预览
            </button>
            <button
              className="btn btn-danger"
              disabled={busy || !gcAge.trim()}
              onClick={() =>
                setConfirm({
                  title: '执行 worktree gc？',
                  message: (
                    <>
                      将回收闲置超过 <strong>{gcAge}</strong> 的 worktree 及其代码副本。
                    </>
                  ),
                  detail: '删除的是代码副本，相关改动将无法找回。',
                  confirmText: '执行清理',
                  cancelText: '取消',
                  danger: true,
                  onConfirm: () => void run(() => window.grok.worktreeGc({ maxAge: gcAge, cwd }), '清理')
                })
              }
            >
              执行清理
            </button>
          </div>
        </div>
      </div>

      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  )
}