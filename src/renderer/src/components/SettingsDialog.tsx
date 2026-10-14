import { useEffect, useState } from 'react'

import {
  getCloseAction,
  getDeletePurgeDefault,
  loginGrok,
  logoutAccount,
  refreshAccount,
  refreshMcp,
  setCloseAction,
  setDeletePurgeDefault,
  setToolCallDensity
} from '../actions'
import { useStore } from '../store'
import type { SettingsSection } from '../store'
import type { CloseAction, ToolCallDensity } from '@shared/types'
import { DENSITY_OPTIONS } from '@shared/types'
import AboutPanel from './AboutPanel'
import DiagnosticsPanel from './DiagnosticsPanel'
import McpPanel from './McpPanel'
import PluginPanel from './PluginPanel'
import DiskPanel from './DiskPanel'
import UsagePanel from './UsagePanel'
import VersionPanel from './VersionPanel'
import WorktreePanel from './WorktreePanel'
import {
  IconBox,
  IconClose,
  IconDownload,
  IconFolder,
  IconGauge,
  IconGear,
  IconInfo,
  IconPlug,
  IconPulse,
  IconUser
} from './Icons'

/* ------------------------------------------------------------------ *
 *  设置中心 —— 统一收纳原本散落各处的配置入口：
 *  通用（关闭行为）/ MCP 服务 / 环境自检（含代理与日志）/ 关于。
 *
 *  左侧导航 + 右侧内容，参考主流桌面应用的设置弹窗布局。
 *  各分区组件（McpPanel 等）只渲染内容，标题与外壳由这里提供。
 * ------------------------------------------------------------------ */

const SECTIONS: Array<{
  id: SettingsSection
  label: string
  icon: (props: { size?: number }) => JSX.Element
}> = [
  { id: 'general', label: '通用', icon: IconGear },
  { id: 'account', label: '账号', icon: IconUser },
  { id: 'usage', label: '用量', icon: IconGauge },
  { id: 'mcp', label: 'MCP 服务', icon: IconPlug },
  { id: 'plugins', label: '插件', icon: IconPlug },
  { id: 'disk', label: '存储占用', icon: IconBox },
  { id: 'worktree', label: 'Worktree', icon: IconFolder },
  { id: 'version', label: '版本与更新', icon: IconDownload },
  { id: 'diagnostics', label: '环境自检', icon: IconPulse },
  { id: 'about', label: '关于', icon: IconInfo }
]

export default function SettingsDialog(): JSX.Element | null {
  const section = useStore((s) => s.settingsSection)
  const setSection = useStore((s) => s.setSettingsSection)

  useEffect(() => {
    if (!section) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setSection(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [section, setSection])

  // 无论从哪个入口进入 MCP 分区，都先刷新一次列表，保证看到的是最新配置
  useEffect(() => {
    if (section === 'mcp') void refreshMcp()
    // 进入账号分区时刷新当前登录信息
    if (section === 'account') void refreshAccount()
  }, [section])

  if (!section) return null

  return (
    <div className="modal-backdrop" onClick={() => setSection(null)}>
      <div
        className="modal settings-modal"
        role="dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <aside className="settings-nav">
          <div className="settings-nav-title">设置</div>
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`settings-nav-item${section === id ? ' is-active' : ''}`}
              onClick={() => setSection(id)}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </aside>

        <div className="settings-content">
          <div className="settings-content-header">
            <button
              className="icon-btn settings-close"
              onClick={() => setSection(null)}
              title="关闭 (Esc)"
            >
              <IconClose size={16} />
            </button>
          </div>
          <div className="settings-content-body">
            {section === 'general' && <GeneralSettings />}
            {section === 'account' && <AccountSettings />}
            {section === 'usage' && <UsagePanel />}
            {section === 'mcp' && <McpPanel />}
            {section === 'plugins' && <PluginPanel />}
            {section === 'disk' && <DiskPanel />}
            {section === 'worktree' && <WorktreePanel />}
            {section === 'version' && <VersionPanel />}
            {section === 'diagnostics' && <DiagnosticsPanel />}
            {section === 'about' && <AboutPanel />}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 *  通用分区：关闭行为（原先放在「关于」面板里，收敛到统一的「通用」）
 * ------------------------------------------------------------------ */
function GeneralSettings(): JSX.Element {
  const [closeAction, setCloseActionState] = useState<CloseAction | null>(null)
  /** 删除弹窗里「同时删除磁盘文件」是否默认勾选（默认 true，与历史行为一致） */
  const [purgeDefault, setPurgeDefaultState] = useState(true)

  useEffect(() => {
    void getCloseAction().then(setCloseActionState)
    void getDeletePurgeDefault().then(setPurgeDefaultState)
  }, [])

  const choose = async (action: CloseAction | null): Promise<void> => {
    await setCloseAction(action)
    setCloseActionState(action)
  }

  const choosePurge = async (value: boolean): Promise<void> => {
    await setDeletePurgeDefault(value)
    setPurgeDefaultState(value)
  }

  return (
    <div className="settings-page">
      <div className="settings-page-title">通用</div>
      <div className="settings-page-sub">应用的基础行为</div>

      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-label">
            <span className="settings-row-title">关闭时</span>
            <span className="settings-row-desc">点击窗口右上角关闭按钮时的行为</span>
          </div>
          <div className="close-action-setting is-seg">
            <button
              className={`seg ${closeAction === 'tray' ? 'is-active' : ''}`}
              onClick={() => void choose('tray')}
            >
              隐藏到托盘
            </button>
            <button
              className={`seg ${closeAction === 'quit' ? 'is-active' : ''}`}
              onClick={() => void choose('quit')}
            >
              直接退出
            </button>
            <button
              className={`seg ${closeAction === null ? 'is-active' : ''}`}
              onClick={() => void choose(null)}
            >
              每次询问
            </button>
          </div>
        </div>
        <div className="mcp-hint">
          选「每次询问」后，下次点击关闭会再次弹出询问窗口；其余选项会记住你的选择。
        </div>
      </div>

      {/* 删除会话：确认弹窗里「同时删除磁盘文件」的默认勾选状态 */}
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-label">
            <span className="settings-row-title">删除会话时</span>
            <span className="settings-row-desc">确认弹窗里「同时删除磁盘文件」的默认状态</span>
          </div>
          <div className="close-action-setting is-seg">
            <button
              className={`seg ${purgeDefault ? 'is-active' : ''}`}
              onClick={() => void choosePurge(true)}
            >
              默认勾选
            </button>
            <button
              className={`seg ${!purgeDefault ? 'is-active' : ''}`}
              onClick={() => void choosePurge(false)}
            >
              默认不勾
            </button>
          </div>
        </div>
        <div className="mcp-hint">
          勾选「同时删除磁盘文件」会一并删掉该会话的磁盘数据（先送系统回收站，不可用时移入应用内
          回收站，仍可找回）。改成「默认不勾」后，弹窗默认只把会话从列表移除，要连磁盘一起删需自己勾。
        </div>
      </div>

      {/* 工具调用展示密度：与终端 /density 共用 config.toml 的 ui.tool_call_density */}
      <DensitySetting />
    </div>
  )
}

/* ------------------------------------------------------------------ *
 *  账号分区：展示当前登录的终端版 grok 账户，并提供退出登录。
 *  桌面端复用终端版登录态（同一份 ~/.grok/auth.json），
 *  此处退出登录会一并清掉终端版的凭据。
 * ------------------------------------------------------------------ */
function AccountSettings(): JSX.Element {
  const account = useStore((s) => s.account)
  const [busy, setBusy] = useState(false)
  const [loginNote, setLoginNote] = useState<string | null>(null)

  const displayName =
    [account?.firstName, account?.lastName].filter(Boolean).join(' ') || account?.email || '未登录'

  const onLogin = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setLoginNote(null)
    try {
      const text = await loginGrok()
      setLoginNote(text)
      await refreshAccount()
    } catch (err) {
      setLoginNote(`登录失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const onLogout = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      await logoutAccount()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-page-title">账号</div>
      <div className="settings-page-sub">
        桌面端与终端版 Grok 共用同一份登录态（~/.grok/auth.json），退出将同时清掉终端版凭据。
      </div>

      {account ? (
        <div className="settings-group">
          <div className="settings-row">
            <div className="settings-row-label">
              <span className="settings-row-title">当前账号</span>
              <span className="settings-row-desc">登录邮箱与姓名</span>
            </div>
            <div className="account-identity">
              <span className="account-name">{displayName}</span>
              {account.email && <span className="account-email">{account.email}</span>}
            </div>
          </div>
          {account.teamId && (
            <div className="settings-row">
              <div className="settings-row-label">
                <span className="settings-row-title">团队</span>
                <span className="settings-row-desc">当前账号所属的团队标识</span>
              </div>
              <code className="account-mono">{account.teamId}</code>
            </div>
          )}
          <div className="settings-row">
            <div className="settings-row-label">
              <span className="settings-row-title">鉴权方式</span>
              <span className="settings-row-desc">登录时使用的认证类型</span>
            </div>
            <code className="account-mono">{account.authMode ?? '—'}</code>
          </div>
        </div>
      ) : (
        <div className="settings-group">
          <div className="settings-row">
            <div className="settings-row-label">
              <span className="settings-row-title">当前账号</span>
              <span className="settings-row-desc">尚未登录或登录态已失效</span>
            </div>
            <span className="account-empty">未登录</span>
          </div>
        </div>
      )}

      <div className="modal-actions" style={{ padding: 0 }}>
        <span className="modal-actions-spacer" />
        <button className="btn btn-danger" disabled={busy || !account} onClick={() => void onLogout()}>
          {busy ? '退出中…' : '退出登录'}
        </button>
      </div>

      <div className="about-hint">
        退出后将清除本地缓存的凭据并重启 agent；如需再次使用，请重新登录（终端执行 <code>grok login</code>）。
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 *  工具调用展示密度（grok 1.0.52 新增，终端 /density）
 *  写的是 ~/.grok/config.toml 的 ui.tool_call_density —— 与终端共用同一份配置，
 *  这里改完终端下次启动即生效；反过来在终端 /density 改了，客户端重启后也跟随。
 * ------------------------------------------------------------------ */
function DensitySetting(): JSX.Element {
  const density = useStore((s) => s.toolCallDensity)
  const [note, setNote] = useState<string | null>(null)

  const choose = async (v: ToolCallDensity): Promise<void> => {
    setNote(null)
    const ok = await setToolCallDensity(v)
    if (!ok) setNote('写入 ~/.grok/config.toml 失败，本次仅对当前窗口生效。')
  }

  return (
    <div className="settings-group">
      <div className="settings-row settings-row-head">
        <div className="settings-row-label">
          <span className="settings-row-title">工具调用展示密度</span>
          <span className="settings-row-desc">
            控制对话里工具调用卡片的默认展开程度。与终端{' '}
            <code>/density</code> 共用同一份配置（~/.grok/config.toml 的
            <code> ui.tool_call_density</code>），这里改完终端下次启动即生效。
          </span>
        </div>
      </div>

      {/* 竖排选项：五档的名称与效果描述同时可见，选择前就能比较。
          早先用横向分段控件，描述被挤成一条窄柱、还要靠 tooltip 才知道每档是什么。 */}
      <div className="density-options" role="radiogroup" aria-label="工具调用展示密度">
        {DENSITY_OPTIONS.map((d) => {
          const active = density === d.value
          return (
            <button
              key={d.value}
              type="button"
              role="radio"
              aria-checked={active}
              className={`density-option${active ? ' is-active' : ''}`}
              onClick={() => void choose(d.value)}
            >
              <span className="density-radio" aria-hidden="true" />
              <span className="density-text">
                <span className="density-label">
                  {d.label}
                  <code className="density-code">{d.value}</code>
                </span>
                <span className="density-desc">{d.desc}</span>
              </span>
            </button>
          )
        })}
      </div>

      {note && <div className="mcp-hint mcp-hint-warn">{note}</div>}
      <div className="mcp-hint">
        切换后立即在当前会话生效；已经手动展开/收起过的工具卡片会保留你的选择。
      </div>
    </div>
  )
}
