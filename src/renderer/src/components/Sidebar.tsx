import { newSession, resumeSession } from '../actions'
import { useStore } from '../store'
import { basename, relativeTime } from '../utils'
import { IconFolder, IconGrok, IconPlus, IconPulse, IconTrash } from './Icons'

const CONNECTION_LABEL: Record<string, string> = {
  idle: '未连接',
  starting: '启动中',
  ready: '已就绪',
  error: '连接失败',
  stopped: '已停止'
}

export default function Sidebar(): JSX.Element {
  const sessions = useStore((s) => s.sessions)
  const activeId = useStore((s) => s.activeId)
  const connection = useStore((s) => s.connection)
  const toggleDiagnostics = useStore((s) => s.toggleDiagnostics)
  const selectSession = useStore((s) => s.selectSession)
  const removeSession = useStore((s) => s.deleteSession)

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-mark">
          <IconGrok size={17} />
        </span>
        <div className="brand-text">
          <strong>Grok Build</strong>
          <span>Desktop Agent</span>
        </div>
      </div>

      <button className="btn btn-primary btn-block" onClick={() => void newSession()}>
        <IconPlus />
        新建会话
      </button>

      <div className="sidebar-section-label">会话</div>

      <div className="session-list">
        {sessions.length === 0 && <div className="session-empty">还没有会话</div>}
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`session-item${session.id === activeId ? ' is-active' : ''}`}
            onClick={() => {
              if (session.id !== activeId) void resumeSession(session.id, session.cwd)
            }}
          >
            <div className="session-item-main">
              <div className="session-item-title" title={session.title}>
                {session.title}
              </div>
              <div className="session-item-sub">
                <IconFolder size={12} />
                <span title={session.cwd}>{basename(session.cwd) || session.cwd}</span>
                <span className="dot-sep">·</span>
                <span>{relativeTime(session.updatedAt)}</span>
              </div>
            </div>
            <button
              className="icon-btn danger"
              title="删除会话"
              onClick={(e) => {
                e.stopPropagation()
                removeSession(session.id)
              }}
            >
              <IconTrash size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <button className="conn-row" onClick={() => toggleDiagnostics()}>
          <span className={`conn-dot conn-${connection.state}`} />
          <span className="conn-label">{CONNECTION_LABEL[connection.state] ?? connection.state}</span>
          <IconPulse size={14} />
        </button>
        {connection.state === 'error' && connection.message && (
          <div className="conn-error" title={connection.message}>
            {connection.message}
          </div>
        )}
      </div>
    </aside>
  )
}
