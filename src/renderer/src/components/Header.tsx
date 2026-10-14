import { useRef, useState } from 'react'

import { applyPermissionModeToSession, changeConfigOption, chooseWorkspace } from '../actions'
import { useStore } from '../store'
import { formatNumber, isLockedChat, sessionDisplayTitle } from '../utils'
import type { PermissionMode } from '@shared/types'
import { PERMISSION_MODE_OPTIONS } from '@shared/types'
import DirPickerMenu from './DirPickerMenu'
import { IconFolder, IconGauge, IconPlus } from './Icons'

export default function Header(): JSX.Element {
  const session = useStore((s) => s.sessions.find((x) => x.id === s.activeId))
  const homeDir = useStore((s) => s.homeDir)
  const permissionMode = useStore((s) => s.permissionMode)
  const setPermissionMode = useStore((s) => s.setPermissionMode)
  const renameSession = useStore((s) => s.renameSession)
  const openUsage = useStore((s) => s.openUsage)

  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState('')
  /** 「+」新建任务的目录选择弹层 */
  const [dirMenuOpen, setDirMenuOpen] = useState(false)
  const newTaskRef = useRef<HTMLButtonElement | null>(null)

  if (!session) return <div className="header" />

  const title = sessionDisplayTitle(session)
  const isChat = session.kind === 'chat'
  // 只读锁定只对「还在主目录下的纯聊天会话」生效：搬到项目目录后就已经绑定项目，
  // 该和普通任务一样可以自选权限模式（见 utils.isLockedChat 的说明）
  const locked = isLockedChat(session, homeDir)
  const effectiveMode: PermissionMode = locked ? 'plan' : permissionMode

  const startRename = (): void => {
    // 预填「当前显示名」，不必重打一遍
    setDraft(title)
    setRenaming(true)
  }

  const commitRename = (): void => {
    renameSession(session.id, draft)
    setRenaming(false)
  }

  const modelOption = session.configOptions.find((o) => (o.configId ?? o.id) === 'model')
  const effortOption = session.configOptions.find(
    (o) => (o.configId ?? o.id) === 'reasoning_effort'
  )
  const usage = session.usage

  return (
    <header className="header">
      <div className="header-left">
        {renaming ? (
          <input
            className="header-title-input"
            autoFocus
            value={draft}
            placeholder={session.title}
            title="直接编辑；留空或改回原标题，则恢复跟随 grok 的自动标题"
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') setRenaming(false)
            }}
          />
        ) : (
          <div
            className="header-title"
            title={
              (session.customTitle
                ? `${title}\n（双击改名；原名：${session.title}）`
                : `${title}\n（双击改名）`) +
              (isChat && locked
                ? '\n聊天会话：固定以主目录为根、不绑定项目，已锁定为只读（不写文件）'
                : isChat
                  ? '\n由聊天会话搬来的任务：已绑定项目，可按普通任务自选权限模式'
                  : '')
            }
            onDoubleClick={startRename}
          >
            {title}
          </div>
        )}
        <button
          ref={newTaskRef}
          className="icon-btn"
          title="新建任务（选择工作目录）"
          onClick={() => setDirMenuOpen((v) => !v)}
        >
          <IconPlus size={13} />
        </button>
        <button
          className="chip chip-path"
          disabled={locked}
          title={
            locked
              ? '聊天会话固定以主目录为根，不可切换目录；要切换工作目录请新建普通任务'
              : isChat
                ? `当前会话工作目录：${session.cwd}\n点击选择目录后，会以该目录「新建」一个任务，当前会话保持不变`
                : `当前会话工作目录：${session.cwd}\n点击选择目录后，会以该目录「新建」一个任务，当前会话保持不变\n要改当前会话自己的目录：在左侧会话行「☰」菜单里选「移动到工作目录」（生成中的会话不能移动）`
          }
          onClick={() => void chooseWorkspace()}
        >
          <IconFolder size={13} />
          {session.cwd}
        </button>
      </div>

      <div className="header-right">
        {modelOption && (
          <select
            className="chip chip-select"
            value={modelOption.currentValue ?? ''}
            onChange={(e) => void changeConfigOption('model', e.target.value)}
            title="模型"
          >
            {(modelOption.options ?? []).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.name ?? opt.value}
              </option>
            ))}
          </select>
        )}

        {effortOption && (
          <select
            className="chip chip-select"
            value={effortOption.currentValue ?? ''}
            onChange={(e) => void changeConfigOption('reasoning_effort', e.target.value)}
            title="推理强度"
          >
            {(effortOption.options ?? []).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.name ?? opt.value}
              </option>
            ))}
          </select>
        )}

        <select
          className="chip chip-select"
          value={effectiveMode}
          disabled={locked}
          onChange={(e) => {
            const mode = e.target.value as PermissionMode
            setPermissionMode(mode)
            // 只对当前会话立即同步；新建会话默认沿用该设置
            void applyPermissionModeToSession(session.id)
          }}
          title={
            locked
              ? '聊天会话已锁定为只读（计划模式），不可更改'
              : isChat
                ? '该会话由聊天搬来，已可按普通任务切换权限模式'
                : `权限模式 · ${
                    PERMISSION_MODE_OPTIONS.find((m) => m.value === permissionMode)?.desc ?? ''
                  }`
          }
        >
          {PERMISSION_MODE_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>

        {/* chip 显示的是**上一轮**的实时用量（来自 ACP usage 通知）；点击查看本会话逐轮明细 + 全局累计。无数据时为纯图标按钮 */}
        <button
          className={`chip chip-usage chip-button${usage ? '' : ' chip-usage-icon'}`}
          title={
            usage
              ? `上一轮：输入 ${usage.inputTokens ?? 0} · 输出 ${usage.outputTokens ?? 0} · 缓存读 ${
                  usage.cacheReadInputTokens ?? 0
                }\n点击查看本会话逐轮明细与全部会话累计`
              : '用量：点击查看本会话逐轮明细与全部会话累计'
          }
          onClick={() => openUsage(session.id)}
        >
          {usage ? (
            <>
              ↑{formatNumber(usage.inputTokens)} ↓{formatNumber(usage.outputTokens)}
              {usage.costUsd !== undefined && ` · $${usage.costUsd.toFixed(4)}`}
            </>
          ) : (
            <IconGauge size={14} />
          )}
        </button>
      </div>

      {dirMenuOpen && (
        <DirPickerMenu anchor={newTaskRef.current} onClose={() => setDirMenuOpen(false)} />
      )}
    </header>
  )
}
