import { useRef, useState } from 'react'

import { useT } from '../i18n'
import { useStore } from '../store'
import DirPickerMenu from './DirPickerMenu'
import { IconGrok, IconChat, IconPlus, IconSpark } from './Icons'

export default function Welcome({ onChat }: { onChat?: () => void }): JSX.Element {
  const connection = useStore((s) => s.connection)
  const diagnostics = useStore((s) => s.diagnostics)
  const toggleDiagnostics = useStore((s) => s.toggleDiagnostics)
  const t = useT()

  /** 「新建任务」的目录选择弹层 */
  const [dirMenuOpen, setDirMenuOpen] = useState(false)
  const createRef = useRef<HTMLButtonElement | null>(null)

  const failing = diagnostics?.checks.filter((c) => c.level === 'error') ?? []

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="welcome-mark">
          <IconGrok size={30} />
        </div>
        <h1>{t('welcome.title')}</h1>
        <p className="welcome-lead">
          {t('welcome.lead')}
        </p>

        <ul className="welcome-points">
          <li>
            <IconSpark size={15} />
            {t('welcome.point1')}
          </li>
          <li>
            <IconSpark size={15} />
            {t('welcome.point2')}
          </li>
          <li>
            <IconSpark size={15} />
            {t('welcome.point3')}
          </li>
        </ul>

        {connection.state === 'error' && (
          <div className="welcome-alert">
            <strong>{t('welcome.connFailed')}</strong>
            {connection.message ?? t('welcome.unknownError')}
            <button className="link" onClick={() => toggleDiagnostics(true)}>
              {t('welcome.viewDiagnostics')}
            </button>
          </div>
        )}

        {failing.length > 0 && connection.state !== 'error' && (
          <div className="welcome-alert">
            {t('welcome.diagIssues', { n: failing.length })}
            {failing.map((c) => c.label).join(t('welcome.listSeparator'))}
            <button className="link" onClick={() => toggleDiagnostics(true)}>
              {t('welcome.viewDetails')}
            </button>
          </div>
        )}

        <div className="welcome-actions">
          <button
            ref={createRef}
            className="btn btn-primary btn-lg"
            onClick={() => setDirMenuOpen((v) => !v)}
          >
            <IconPlus />
            {t('welcome.newTask')}
          </button>
          {onChat && (
            <button className="btn btn-ghost btn-lg" onClick={onChat} title={t('welcome.chatTitle')}>
              <IconChat />
              {t('chat.newChat')}
            </button>
          )}
        </div>
        <p className="welcome-foot muted">
          {t('welcome.foot')}
        </p>
      </div>

      {dirMenuOpen && (
        <DirPickerMenu anchor={createRef.current} onClose={() => setDirMenuOpen(false)} />
      )}
    </div>
  )
}
