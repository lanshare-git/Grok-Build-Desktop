import { useStore } from '../store'
import { IconPlus, IconSpark } from './Icons'

export default function Welcome({ onCreate }: { onCreate: () => void }): JSX.Element {
  const connection = useStore((s) => s.connection)
  const diagnostics = useStore((s) => s.diagnostics)
  const toggleDiagnostics = useStore((s) => s.toggleDiagnostics)

  const failing = diagnostics?.checks.filter((c) => c.level === 'error') ?? []

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="welcome-mark">G</div>
        <h1>Grok Build 桌面端</h1>
        <p className="welcome-lead">
          直接复用你终端版 Grok Build 的登录态、模型与工具链，通过 ACP 协议驱动同一个 Agent。
        </p>

        <ul className="welcome-points">
          <li>
            <IconSpark size={15} />
            流式输出、思考过程、工具调用与执行计划全程可见
          </li>
          <li>
            <IconSpark size={15} />
            文件读写、命令执行、代码检索，与终端版能力一致
          </li>
          <li>
            <IconSpark size={15} />
            会话可保存、可恢复，历史记录与终端版互通
          </li>
        </ul>

        {connection.state === 'error' && (
          <div className="welcome-alert">
            <strong>连接失败：</strong>
            {connection.message ?? '未知错误'}
            <button className="link" onClick={() => toggleDiagnostics(true)}>
              查看自检详情
            </button>
          </div>
        )}

        {failing.length > 0 && connection.state !== 'error' && (
          <div className="welcome-alert">
            自检发现 {failing.length} 项异常：
            {failing.map((c) => c.label).join('、')}
            <button className="link" onClick={() => toggleDiagnostics(true)}>
              查看详情
            </button>
          </div>
        )}

        <button className="btn btn-primary btn-lg" onClick={onCreate}>
          <IconPlus />
          新建会话
        </button>
        <p className="welcome-foot muted">
          首次使用会要求选择一个工作目录 —— Agent 将以该目录为根开展工作。
        </p>
      </div>
    </div>
  )
}
