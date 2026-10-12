import { useEffect, useState } from 'react'

import { connectAgent, newSession, refreshDiagnostics } from './actions'
import ChatView from './components/ChatView'
import Composer from './components/Composer'
import DiagnosticsPanel from './components/DiagnosticsPanel'
import Header from './components/Header'
import PermissionDialog from './components/PermissionDialog'
import Sidebar from './components/Sidebar'
import Welcome from './components/Welcome'
import { useStore } from './store'

export default function App(): JSX.Element {
  const activeId = useStore((s) => s.activeId)
  const showDiagnostics = useStore((s) => s.showDiagnostics)
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
        useStore.getState().setConnection(e.state, e.message)
        // agent 进程重启/退出后，原会话都不在进程里了，发送前需要重新 session/load
        if (e.state === 'starting' || e.state === 'stopped' || e.state === 'error') {
          useStore.getState().clearLoadedSessions()
        }
      }),
      window.grok.onStream((e) => useStore.getState().applyStream(e)),
      window.grok.onPermission((e) => useStore.getState().setPermission(e)),
      window.grok.onLog((line) => useStore.getState().pushLog(line))
    ]

    void (async () => {
      try {
        const info = await window.grok.appInfo()
        if (!store.cwd) store.setCwd(info.defaultCwd)
      } catch {
        /* 忽略：后续 connect 会给出更具体的错误 */
      }
      await refreshDiagnostics()
      await connectAgent()
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
        {activeId ? <ChatView key={activeId} /> : <Welcome onCreate={() => void newSession()} />}
        {activeId && <Composer />}
      </main>
      <PermissionDialog />
      {showDiagnostics && <DiagnosticsPanel />}
    </div>
  )
}
