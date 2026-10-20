import { useEffect, useState } from 'react'

import {
  bootstrapBlankSession,
  cleanError,
  connectAgent,
  newChatSession,
  onAgentTurnCompleted,
  refreshAccount,
  refreshDiagnostics,
  refreshEnvInfo,
  refreshToolCallDensity,
  resumeSession
} from './actions'
import { mostRecentWorkspaceCwd } from './utils'
import ChatView from './components/ChatView'
import CloseActionDialog from './components/CloseActionDialog'
import BackgroundTasksBar from './components/BackgroundTasksBar'
import Composer from './components/Composer'
import Header from './components/Header'
import SettingsDialog from './components/SettingsDialog'
import TaskPrompts from './components/TaskPrompts'
import ToastStack from './components/ToastStack'
import UsageDialog from './components/UsageDialog'
import Sidebar from './components/Sidebar'
import Welcome from './components/Welcome'
import { enqueueStreamEvent } from './stream-queue'
import { useStore } from './store'
import { sessionDisplayTitle } from './utils'
import { t as tShared } from '@shared/i18n'

/** 非当前任务的授权/提问 → 弹右下角全局提示，点击即可跳到那个任务去处理 */
function notifyBackgroundPrompt(
  sessionId: string,
  info: { requestId: number; kind: 'perm' | 'question'; label?: string }
): void {
  const st = useStore.getState()
  const session = st.sessions.find((x) => x.id === sessionId)
  const name = session ? sessionDisplayTitle(session, st.locale) : tShared(st.locale, 'common.backgroundTask')
  st.pushToast({
    id: `prompt-${info.kind}-${info.requestId}`,
    level: 'warn',
    title: info.kind === 'perm' ? tShared(st.locale, 'common.promptPermTitle') : tShared(st.locale, 'common.promptQuestionTitle'),
    text:
      info.kind === 'perm'
        ? tShared(st.locale, 'common.promptPermText', { name, label: info.label ?? '' })
        : tShared(st.locale, 'common.promptQuestionText', { name }),
    sessionId,
    requestId: info.requestId,
    ttl: 0
  })
}

export default function App(): JSX.Element {
  const activeId = useStore((s) => s.activeId)
  const unreadSessionIds = useStore((s) => s.unreadSessionIds)
  const permissions = useStore((s) => s.permissions)
  const questions = useStore((s) => s.questions)
  const showCloseActionPrompt = useStore((s) => s.showCloseActionPrompt)
  const [bridgeMissing, setBridgeMissing] = useState(false)

  // 告诉主进程当前在看哪个会话：已打开该会话的内联授权时，自动收起桌面浮窗
  useEffect(() => {
    if (!window.grok?.reportActiveSession) return
    void window.grok.reportActiveSession(activeId)
  }, [activeId])

  // 任务栏角标（对齐 Cursor）：橙=要你处理，蓝=做完未读
  useEffect(() => {
    if (!window.grok?.reportTaskbarBadge) return
    const kind =
      permissions.length > 0 || questions.length > 0
        ? 'pending'
        : unreadSessionIds.length > 0
          ? 'unread'
          : 'none'
    void window.grok.reportTaskbarBadge(kind)
  }, [permissions.length, questions.length, unreadSessionIds])

  useEffect(() => {
    // preload 未注入时（脚本加载失败等）给出明确提示，而不是抛一堆 undefined 错误
    if (typeof window === 'undefined' || !window.grok) {
      setBridgeMissing(true)
      return
    }

    const store = useStore.getState()
    // 冷启动进空白草稿：persist 水合可能晚于本 effect，两边都调一次（幂等）
    const bootBlank = (): void => bootstrapBlankSession()
    bootBlank()
    const unsubHydration =
      typeof useStore.persist?.onFinishHydration === 'function'
        ? useStore.persist.onFinishHydration(bootBlank)
        : undefined

    const unsubscribers = [
      window.grok.onState((e) => {
        const st = useStore.getState()
        const prev = st.connection.state
        st.setConnection(e.state, e.message)
        // agent 进程重启/退出后，原会话都不在进程里了，发送前需要重新 session/load
        if (e.state === 'starting' || e.state === 'stopped' || e.state === 'error') {
          st.clearLoadedSessions()
        }
        // 进程没了，挂起的授权/提问随之失效，一并清掉，别让界面留一张永远答不完的卡
        if (e.state === 'starting' || e.state === 'stopped' || e.state === 'error') {
          st.clearAllPrompts()
          st.clearBackgroundTasks()
        }
        // 连接异常改走右下角提示，不再占用任务界面
        if (e.state === 'error') {
          const loc = st.locale
          st.pushToast({
            id: 'conn-error',
            level: 'error',
            title: tShared(loc, 'common.connErrorTitle'),
            text: e.message ?? tShared(loc, 'common.connErrorText'),
            action: 'reconnect',
            ttl: 0
          })
        } else if (e.state === 'stopped' && prev === 'ready') {
          const loc = st.locale
          st.pushToast({
            id: 'conn-stopped',
            level: 'warn',
            title: tShared(loc, 'common.connStoppedTitle'),
            text: e.message ?? tShared(loc, 'common.connStoppedText'),
            action: 'reconnect',
            ttl: 0
          })
        } else if (e.state === 'ready') {
          st.dismissToast('conn-error')
          st.dismissToast('conn-stopped')
          // 缓存里能看到历史，但会话尚未 session/load。不在这里补加载的话，
          // 用户一发消息就会触发清空+重放，刚发出的内容看起来像消失了。
          const active = st.activeSession()
          if (active && !active.isDraft && !st.loadedSessions.includes(active.id)) {
            void resumeSession(active.id, active.cwd)
          }
        }
      }),
      window.grok.onStream((e) => enqueueStreamEvent(e)),
      // agent 回合终态：不等 session/prompt RPC，立刻收尾「正在工作」
      window.grok.onTurnComplete((e) => onAgentTurnCompleted(e.sessionId)),
      window.grok.onBackgroundTasks((e) => {
        useStore.getState().setBackgroundTasks(e.sessionId, e.tasks)
      }),
      window.grok.onPermission((e) => {
        // 授权提醒改走主进程桌面浮窗（可直接点按钮）；当前会话前台只靠内联面板
        useStore.getState().setPermission(e)
      }),
      window.grok.onQuestion((e) => {
        const st = useStore.getState()
        st.setQuestion(e)
        if (e.sessionId !== st.activeId) {
          notifyBackgroundPrompt(e.sessionId, { requestId: e.requestId, kind: 'question' })
        }
      }),
      window.grok.onLog((line) => useStore.getState().pushLog(line)),
      // agent 握手时上报的内置命令 + 运行期公告：不接住就只剩客户端硬编码的两条命令
      window.grok.onMeta((meta) => useStore.getState().applyAgentMeta(meta)),
      // 主进程在「关闭行为未配置、用户首次点关闭」时请求弹窗询问
      window.grok.onCloseActionRequest(() =>
        useStore.getState().setShowCloseActionPrompt(true)
      ),
      // 系统通知被点击：切到对应会话（与右下角 toast「前往处理」同语义）
      window.grok.onFocusSession(({ sessionId }) => {
        const session = useStore.getState().sessions.find((x) => x.id === sessionId)
        if (session) void resumeSession(session.id, session.cwd)
      }),
      // 桌面授权浮窗（或其它窗口）已点选：清掉本窗口里残留的授权卡与 toast
      window.grok.onPermissionSettled(({ requestId }) => {
        useStore.getState().clearPermission(requestId)
      }),
      // 语言广播：任一窗口/入口切换后同步本窗口缓存；
      // 诊断报告由主进程按当前语言生成（快照），切语言后必须重拉，否则面板残留旧语言文案
      window.grok.onLocaleChanged((l) => {
        useStore.getState().setLocale(l)
        void refreshDiagnostics()
      })
    ]

    void (async () => {
      try {
        const info = await window.grok.appInfo()
        // homeDir 始终指向主目录（homedir）：「纯聊天」会话以此为根，不受默认 cwd 影响。
        // 不进 persist（每次启动重取），避免换机器 / 改用户后残留旧路径。
        const st = useStore.getState()
        st.setHomeDir(info.defaultCwd)
        const startupCwd =
          mostRecentWorkspaceCwd(st.sessions) || st.cwd || info.defaultCwd
        st.setCwd(startupCwd)
        // 冷启动播种模型目录：从来没有过会话时 configOptionCatalog 是空的，
        // 草稿 Header 画不出模型/推理强度下拉（真实选项要等第一次 session/new）。
        // 用 grok 磁盘缓存合成一份顶上；真实选项到达后按 id 覆盖，不会被种子锁死。
        try {
          if (!st.configOptionCatalog.some((o) => (o.configId ?? o.id) === 'model')) {
            const seed = await window.grok.modelConfigSeed()
            if (seed.length > 0) useStore.getState().seedConfigCatalog(seed)
          }
        } catch {
          /* 种子只是兜底，失败维持原行为（发首条消息后下拉出现） */
        }
        bootstrapBlankSession(startupCwd)
      } catch {
        /* 忽略：后续 connect 会给出更具体的错误 */
      }
      try {
        useStore.getState().setAppVersion(await window.grok.appVersion())
      } catch (err) {
        useStore.getState().pushLog(`[app-version] 读取失败：${cleanError(err)}`)
      }
      // 语言回源校正：store 初始值只是 navigator.language 的同步归一，以主进程 config.json 为准
      try {
        useStore.getState().setLocale((await window.grok.getLocale()).resolved)
      } catch {
        /* 忽略：保留首帧的归一值 */
      }
      await refreshDiagnostics()
      // 工具卡展示密度与终端共用 config.toml，启动时读一次
      await refreshToolCallDensity()
      // 预取登录账户，供左下角账号入口展示（进入账号分区时还会再刷一次）
      await refreshAccount()
      await connectAgent()
      // grok inspect：内置技能 / 子代理清单（命令面板的补全来源），失败不影响主流程
      await refreshEnvInfo()
      // 用磁盘真值校正侧栏时间：grok 在启动/加载会话时会全量重放历史，
      // 重放会把 updatedAt 刷成「现在」（表现为「没动过的会话也显示刚刚」）。
      // activityAt 取自磁盘 events.jsonl 的末条 ts，不受重放影响，是排序的权威来源。
      await useStore.getState().refreshActivity()
    })()

    return () => {
      unsubHydration?.()
      unsubscribers.forEach((off) => off())
    }
  }, [])

  if (bridgeMissing) {
    const loc = useStore.getState().locale
    return (
      <div className="welcome">
        <div className="welcome-card">
          <h1>{tShared(loc, 'common.bridgeMissingTitle')}</h1>
          <p className="welcome-lead">
            {tShared(loc, 'common.bridgeMissingBody')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <Header />
        {/* 聊天区：右下角全局提示以此为锚点，保证浮在输入框/待响应面板之上 */}
        <div className="main-body">
          {activeId ? (
            <ChatView key={activeId} />
          ) : (
            <Welcome onChat={() => void newChatSession()} />
          )}
          {/* 右下角全局提示：其它任务的授权/提问、agent 连接异常 */}
          <ToastStack />
        </div>
        {/* 任务内嵌「待响应」区：只显示当前任务的授权/提问，固定在输入框上方 */}
        {activeId && <TaskPrompts />}
        {/* 后台任务（长命令 / 子代理）：回合结束后仍在跑时要看得见 */}
        {activeId && <BackgroundTasksBar />}
        {activeId && <Composer />}
      </main>
      {/* 设置中心：统一收纳 通用 / MCP 服务 / 插件 / 存储 / 环境自检 / 关于 */}
      <SettingsDialog />
      {/* 用量：等价终端 grok usage，附跨会话累计 */}
      <UsageDialog />
      {showCloseActionPrompt && <CloseActionDialog />}
    </div>
  )
}
