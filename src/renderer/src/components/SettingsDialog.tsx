import { useEffect, useState } from 'react'

import {
  getCloseAction,
  getDeletePurgeDefault,
  getDesktopPermToast,
  loginGrok,
  logoutAccount,
  refreshAccount,
  refreshMcp,
  setCloseAction,
  setDeletePurgeDefault,
  setDesktopPermToast,
  setToolCallDensity
} from '../actions'
import { useStore } from '../store'
import { LOCALE_OPTIONS, useT, type Locale, type MessageKey } from '../i18n'
import type { SettingsSection } from '../store'
import type { CloseAction, DesktopPermToastMode, ToolCallDensity } from '@shared/types'
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
  labelKey: MessageKey
  icon: (props: { size?: number }) => JSX.Element
}> = [
  { id: 'general', labelKey: 'settings.nav.general', icon: IconGear },
  { id: 'account', labelKey: 'settings.nav.account', icon: IconUser },
  { id: 'usage', labelKey: 'settings.nav.usage', icon: IconGauge },
  { id: 'mcp', labelKey: 'settings.nav.mcp', icon: IconPlug },
  { id: 'plugins', labelKey: 'settings.nav.plugins', icon: IconPlug },
  { id: 'disk', labelKey: 'settings.nav.disk', icon: IconBox },
  { id: 'worktree', labelKey: 'settings.nav.worktree', icon: IconFolder },
  { id: 'version', labelKey: 'settings.nav.version', icon: IconDownload },
  { id: 'diagnostics', labelKey: 'settings.nav.diagnostics', icon: IconPulse },
  { id: 'about', labelKey: 'settings.nav.about', icon: IconInfo }
]

export default function SettingsDialog(): JSX.Element | null {
  const t = useT()
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
          <div className="settings-nav-title">{t('settings.title')}</div>
          {SECTIONS.map(({ id, labelKey, icon: Icon }) => (
            <button
              key={id}
              className={`settings-nav-item${section === id ? ' is-active' : ''}`}
              onClick={() => setSection(id)}
            >
              <Icon size={15} />
              {t(labelKey)}
            </button>
          ))}
        </aside>

        <div className="settings-content">
          <div className="settings-content-header">
            <button
              className="icon-btn settings-close"
              onClick={() => setSection(null)}
              title={t('settings.close')}
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
  const t = useT()
  const [closeAction, setCloseActionState] = useState<CloseAction | null>(null)
  /** 删除弹窗里「同时删除磁盘文件」是否默认勾选（默认 true，与历史行为一致） */
  const [purgeDefault, setPurgeDefaultState] = useState(true)
  const [permToast, setPermToastState] = useState<DesktopPermToastMode>('on')

  useEffect(() => {
    void getCloseAction().then(setCloseActionState)
    void getDeletePurgeDefault().then(setPurgeDefaultState)
    void getDesktopPermToast().then(setPermToastState)
  }, [])

  const choose = async (action: CloseAction | null): Promise<void> => {
    await setCloseAction(action)
    setCloseActionState(action)
  }

  const choosePurge = async (value: boolean): Promise<void> => {
    await setDeletePurgeDefault(value)
    setPurgeDefaultState(value)
  }

  const choosePermToast = async (mode: DesktopPermToastMode): Promise<void> => {
    await setDesktopPermToast(mode)
    setPermToastState(mode)
  }

  return (
    <div className="settings-page">
      <div className="settings-page-title">{t('settings.general.title')}</div>
      <div className="settings-page-sub">{t('settings.general.subtitle')}</div>

      {/* 界面语言：三语切换，默认跟随系统 */}
      <LanguageSetting />

      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-label">
            <span className="settings-row-title">{t('settings.general.closeAction.title')}</span>
            <span className="settings-row-desc">{t('settings.general.closeAction.desc')}</span>
          </div>
          <div className="close-action-setting is-seg">
            <button
              className={`seg ${closeAction === 'tray' ? 'is-active' : ''}`}
              onClick={() => void choose('tray')}
            >
              {t('settings.general.closeAction.tray')}
            </button>
            <button
              className={`seg ${closeAction === 'quit' ? 'is-active' : ''}`}
              onClick={() => void choose('quit')}
            >
              {t('settings.general.closeAction.quit')}
            </button>
            <button
              className={`seg ${closeAction === null ? 'is-active' : ''}`}
              onClick={() => void choose(null)}
            >
              {t('settings.general.closeAction.ask')}
            </button>
          </div>
        </div>
        <div className="mcp-hint">{t('settings.general.closeAction.hint')}</div>
      </div>

      {/* 删除会话：删除确认弹窗里「同时删除磁盘上的会话文件」的默认勾选状态 */}
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-label">
            <span className="settings-row-title">{t('settings.general.purge.title')}</span>
            <span className="settings-row-desc">{t('settings.general.purge.desc')}</span>
          </div>
          <div className="close-action-setting is-seg">
            <button
              className={`seg ${purgeDefault ? 'is-active' : ''}`}
              onClick={() => void choosePurge(true)}
            >
              {t('settings.general.purge.on')}
            </button>
            <button
              className={`seg ${!purgeDefault ? 'is-active' : ''}`}
              onClick={() => void choosePurge(false)}
            >
              {t('settings.general.purge.off')}
            </button>
          </div>
        </div>
        <div className="mcp-hint">{t('settings.general.purge.hint')}</div>
      </div>

      {/* 右下角桌面授权浮窗 */}
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-label">
            <span className="settings-row-title">{t('settings.general.desktopPermToast.title')}</span>
            <span className="settings-row-desc">{t('settings.general.desktopPermToast.desc')}</span>
          </div>
          <div className="close-action-setting is-seg">
            <button
              className={`seg ${permToast === 'on' ? 'is-active' : ''}`}
              onClick={() => void choosePermToast('on')}
            >
              {t('settings.general.desktopPermToast.on')}
            </button>
            <button
              className={`seg ${permToast === 'off' ? 'is-active' : ''}`}
              onClick={() => void choosePermToast('off')}
            >
              {t('settings.general.desktopPermToast.off')}
            </button>
          </div>
        </div>
        <div className="mcp-hint">{t('settings.general.desktopPermToast.hint')}</div>
      </div>

      {/* 工具调用展示密度：与终端 /density 共用 config.toml 的 ui.tool_call_density */}
      <DensitySetting />
    </div>
  )
}

/* ------------------------------------------------------------------ *
 *  界面语言：raw（null = 跟随系统）决定选中态；切换后主进程广播给所有窗口
 * ------------------------------------------------------------------ */
function LanguageSetting(): JSX.Element {
  const t = useT()
  /** undefined = 尚未从主进程取回（此时不高亮任何选项） */
  const [raw, setRaw] = useState<Locale | null | undefined>(undefined)

  useEffect(() => {
    let alive = true
    void window.grok.getLocale().then((res) => {
      if (alive) setRaw(res.raw)
    })
    return () => {
      alive = false
    }
  }, [])

  const choose = async (value: Locale | null): Promise<void> => {
    const picked = await window.grok.setLocale(value)
    useStore.getState().setLocale(picked.resolved)
    setRaw(picked.raw)
  }

  return (
    <div className="settings-group">
      <div className="settings-row">
        <div className="settings-row-label">
          <span className="settings-row-title">{t('settings.general.language.title')}</span>
          <span className="settings-row-desc">{t('settings.general.language.desc')}</span>
        </div>
        <div className="close-action-setting is-seg">
          <button
            className={`seg ${raw === null ? 'is-active' : ''}`}
            onClick={() => void choose(null)}
          >
            {t('common.followSystem')}
          </button>
          {LOCALE_OPTIONS.map((o) => (
            <button
              key={o.value}
              className={`seg ${raw === o.value ? 'is-active' : ''}`}
              onClick={() => void choose(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 *  账号分区：展示当前登录的终端版 grok 账户，并提供退出登录。
 *  桌面端复用终端版登录态（同一份 ~/.grok/auth.json），
 *  此处退出登录会一并清掉终端版的凭据。
 * ------------------------------------------------------------------ */
function AccountSettings(): JSX.Element {
  const t = useT()
  const account = useStore((s) => s.account)
  const [busy, setBusy] = useState(false)
  const [loginNote, setLoginNote] = useState<string | null>(null)

  const displayName =
    [account?.firstName, account?.lastName].filter(Boolean).join(' ') || account?.email || t('settings.account.notLoggedIn')

  // 登录过程中实时追加设备码 / URL，方便用户在窗口内对照
  useEffect(() => {
    if (!busy) return
    return window.grok.onLoginProgress((line) => {
      setLoginNote((prev) => (prev ? `${prev}\n${line}` : line))
    })
  }, [busy])

  const onLogin = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setLoginNote(t('settings.account.loggingIn'))
    try {
      const text = await loginGrok()
      setLoginNote(text)
      await refreshAccount()
    } catch (err) {
      setLoginNote(t('settings.account.loginFailed', { message: err instanceof Error ? err.message : String(err) }))
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
      <div className="settings-page-title">{t('settings.account.title')}</div>
      <div className="settings-page-sub">{t('settings.account.subtitle')}</div>

      {account ? (
        <div className="settings-group">
          <div className="settings-row">
            <div className="settings-row-label">
              <span className="settings-row-title">{t('settings.account.current')}</span>
              <span className="settings-row-desc">{t('settings.account.currentDesc')}</span>
            </div>
            <div className="account-identity">
              <span className="account-name">{displayName}</span>
              {account.email && <span className="account-email">{account.email}</span>}
            </div>
          </div>
          {account.teamId && (
            <div className="settings-row">
              <div className="settings-row-label">
                <span className="settings-row-title">{t('settings.account.team')}</span>
                <span className="settings-row-desc">{t('settings.account.teamDesc')}</span>
              </div>
              <code className="account-mono">{account.teamId}</code>
            </div>
          )}
          <div className="settings-row">
            <div className="settings-row-label">
              <span className="settings-row-title">{t('settings.account.authMode')}</span>
              <span className="settings-row-desc">{t('settings.account.authModeDesc')}</span>
            </div>
            <code className="account-mono">{account.authMode ?? '—'}</code>
          </div>
        </div>
      ) : (
        <div className="settings-group">
          <div className="settings-row">
            <div className="settings-row-label">
              <span className="settings-row-title">{t('settings.account.current')}</span>
              <span className="settings-row-desc">{t('settings.account.currentEmptyDesc')}</span>
            </div>
            <span className="account-empty">{t('settings.account.notLoggedIn')}</span>
          </div>
        </div>
      )}

      <div className="modal-actions" style={{ padding: 0 }}>
        <span className="modal-actions-spacer" />
        {account ? (
          <button className="btn btn-danger" disabled={busy} onClick={() => void onLogout()}>
            {busy ? t('settings.account.loggingOut') : t('settings.account.logout')}
          </button>
        ) : (
          <button className="btn btn-primary" disabled={busy} onClick={() => void onLogin()}>
            {busy ? t('settings.account.loggingIn') : t('settings.account.login')}
          </button>
        )}
      </div>

      {loginNote && <pre className="account-login-note">{loginNote}</pre>}
      <div className="about-hint">
        {account ? t('settings.account.logoutHint') : t('settings.account.loginHint')}
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
  const t = useT()
  const density = useStore((s) => s.toolCallDensity)
  const [note, setNote] = useState<string | null>(null)

  const choose = async (v: ToolCallDensity): Promise<void> => {
    setNote(null)
    const ok = await setToolCallDensity(v)
    if (!ok) setNote(t('settings.general.density.writeFail'))
  }

  return (
    <div className="settings-group">
      <div className="settings-row settings-row-head">
        <div className="settings-row-label">
          <span className="settings-row-title">{t('settings.general.density.title')}</span>
          <span className="settings-row-desc">{t('settings.general.density.desc')}</span>
        </div>
      </div>

      {/* 竖排选项：五档的名称与效果描述同时可见，选择前就能比较。
          早先用横向分段控件，描述被挤成一条窄柱、还要靠 tooltip 才知道每档是什么。 */}
      <div className="density-options" role="radiogroup" aria-label={t('settings.general.density.aria')}>
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
                  {t(d.labelKey)}
                  <code className="density-code">{d.value}</code>
                </span>
                <span className="density-desc">{t(d.descKey)}</span>
              </span>
            </button>
          )
        })}
      </div>

      {note && <div className="mcp-hint mcp-hint-warn">{note}</div>}
      <div className="mcp-hint">{t('settings.general.density.hint')}</div>
    </div>
  )
}
