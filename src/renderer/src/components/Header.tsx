import { useRef, useState } from 'react'

import { applyPermissionModeToSession, changeConfigOption, chooseWorkspace } from '../actions'
import { useLocale, useT } from '../i18n'
import { useStore } from '../store'
import { formatNumber, isLockedChat, sessionDisplayTitle } from '../utils'
import type { PermissionMode } from '@shared/types'
import { PERMISSION_MODE_OPTIONS } from '@shared/types'
import DirPickerMenu from './DirPickerMenu'
import { IconFolder, IconGauge, IconPlus } from './Icons'

export default function Header(): JSX.Element {
  const t = useT()
  const locale = useLocale()
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

  const title = sessionDisplayTitle(session, locale)
  const isChat = session.kind === 'chat'
  // 只读锁定只对「还在主目录下的纯聊天会话」生效：搬到项目目录后就已经绑定项目，
  // 该和普通任务一样可以自选权限模式（见 utils.isLockedChat 的说明）
  const locked = isLockedChat(session, homeDir)
  const effectiveMode: PermissionMode = locked ? 'plan' : permissionMode
  const modeDescKey = PERMISSION_MODE_OPTIONS.find((m) => m.value === permissionMode)?.descKey

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
            title={t('header.renameInputTitle')}
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
                ? t('header.titleRenameWithOriginal', { title, original: session.title })
                : t('header.titleRename', { title })) +
              (isChat && locked
                ? t('header.titleLockedChatSuffix')
                : isChat
                  ? t('header.titleMovedChatSuffix')
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
          title={t('header.newTaskTitle')}
          onClick={() => setDirMenuOpen((v) => !v)}
        >
          <IconPlus size={13} />
        </button>
        <button
          className="chip chip-path"
          disabled={locked}
          title={
            locked
              ? t('header.pathTitleLocked')
              : isChat
                ? t('header.pathTitleChat', { cwd: session.cwd })
                : t('header.pathTitleTask', { cwd: session.cwd })
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
            title={t('header.model')}
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
            title={t('header.effort')}
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
              ? t('header.modeTitleLocked')
              : isChat
                ? t('header.modeTitleChat')
                : t('header.modeTitle', { desc: modeDescKey ? t(modeDescKey) : '' })
          }
        >
          {PERMISSION_MODE_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>
              {t(m.labelKey)}
            </option>
          ))}
        </select>

        {/* chip 显示的是**上一轮**的实时用量（来自 ACP usage 通知）；点击查看本会话逐轮明细 + 全局累计。无数据时为纯图标按钮 */}
        <button
          className={`chip chip-usage chip-button${usage ? '' : ' chip-usage-icon'}`}
          title={
            usage
              ? t('header.usageTitle', {
                  input: usage.inputTokens ?? 0,
                  output: usage.outputTokens ?? 0,
                  cacheRead: usage.cacheReadInputTokens ?? 0
                })
              : t('header.usageTitleEmpty')
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
