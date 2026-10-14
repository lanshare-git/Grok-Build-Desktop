import { useEffect, useState } from 'react'

import {
  cleanError,
  connectAgent,
  newChatSession,
  refreshAccount,
  refreshDiagnostics,
  refreshEnvInfo,
  refreshToolCallDensity
} from './actions'
import ChatView from './components/ChatView'
import CloseActionDialog from './components/CloseActionDialog'
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

/** 非当前任务的授权/提问 → 弹右下角全局提示，点击即可跳到那个任务去处理 */
function notifyBackgroundPrompt(
  sessionId: string,
  info: { requestId: number; kind: 'perm' | 'question'; label?: string }
): void {
  const st = useStore.getState()
  const session = st.sessions.find((x) => x.id === sessionId)
  const name = session ? sessionDisplayTitle(session) : '后台任务'
  st.pushToast({
    id: `prompt-${info.kind}-${info.requestId}`,
    level: 'warn',
    title: info.kind === 'perm' ? '任务需要授权' : '任务正在提问',
    text:
      info.kind === 'perm'
        ? `「${name}」请求执行：${info.label}`
        : `「${name}」需要你的选择才能继续`,
    sessionId,
    requestId: info.requestId,
    ttl: 0
  })
}

export default function App(): JSX.Element {
  const activeId = useStore((s) => s.activeId)
  const showCloseActionPrompt = useStore((s) => s.showCloseActionPrompt)
  const [bridgeMissing, setBridgeMissing] = useState(false)

  useEffect(() => {
    // preload 未注入时（脚本加载失败等）给出明确提示，而不是抛一堆 undefined 错误
    if (typeof window === 'undefined' || !window.grok) {
      setBridgeMissing(true)
      return
    }

    const store = useStore.getState()

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
        }
        // 连接异常改走右下角提示，不再占用任务界面
        if (e.state === 'error') {
          st.pushToast({
            id: 'conn-error',
            level: 'error',
            title: 'Agent 连接异常',
            text: e.message ?? '与 Grok Build 进程的连接已中断',
            action: 'reconnect',
            ttl: 0
          })
        } else if (e.state === 'stopped' && prev === 'ready') {
          st.pushToast({
            id: 'conn-stopped',
            level: 'warn',
            title: 'Agent 已停止',
            text: e.message ?? '后台进程已退出，需要重新连接才能继续',
            action: 'reconnect',
            ttl: 0
          })
        } else if (e.state === 'ready') {
          st.dismissToast('conn-error')
          st.dismissToast('conn-stopped')
        }
      }),
      window.grok.onStream((e) => enqueueStreamEvent(e)),
      window.grok.onPermission((e) => {
        const st = useStore.getState()
        st.setPermission(e)
        // 请求归属的任务不是当前正在看的那个 → 用右下角提示引导；否则就地内联展示
        if (e.sessionId !== st.activeId) {
          notifyBackgroundPrompt(e.sessionId, {
            requestId: e.requestId,
            kind: 'perm',
            label: e.toolCall?.title ?? e.toolCall?.toolName ?? '一个工具'
          })
        }
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
      )
    ]

    void (async () => {
      try {
        const info = await window.grok.appInfo()
        // homeDir 始终指向主目录（homedir）：「纯聊天」会话以此为根，不受默认 cwd 影响。
        // 不进 persist（每次启动重取），避免换机器 / 改用户后残留旧路径。
        store.setHomeDir(info.defaultCwd)
        if (!store.cwd) store.setCwd(info.defaultCwd)
      } catch {
        /* 忽略：后续 connect 会给出更具体的错误 */
      }
      try {
        useStore.getState().setAppVersion(await window.grok.appVersion())
      } catch (err) {
        useStore.getState().pushLog(`[app-version] 读取失败：${cleanError(err)}`)
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

    return () => unsubscribers.forEach((off) => off())
  }, [])

  if (bridgeMissing) {
    return (
      <div className="welcome">
        <div className="welcome-card">
          <h1>无法加载应用桥接层</h1>
          <p className="welcome-lead">
            preload 脚本未能注入，渲染进程拿不到主进程能力。请重启应用；若持续出现，请检查构建产物是否完整。
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
