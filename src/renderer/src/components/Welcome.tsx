import { useRef, useState } from 'react'

import { useStore } from '../store'
import DirPickerMenu from './DirPickerMenu'
import { IconGrok, IconChat, IconPlus, IconSpark } from './Icons'

export default function Welcome({ onChat }: { onChat?: () => void }): JSX.Element {
  const connection = useStore((s) => s.connection)
  const diagnostics = useStore((s) => s.diagnostics)
  const toggleDiagnostics = useStore((s) => s.toggleDiagnostics)

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

        <div className="welcome-actions">
          <button
            ref={createRef}
            className="btn btn-primary btn-lg"
            onClick={() => setDirMenuOpen((v) => !v)}
          >
            <IconPlus />
            新建任务
          </button>
          {onChat && (
            <button className="btn btn-ghost btn-lg" onClick={onChat} title="以主目录为根、不绑定任何项目，且锁定为只读（不写文件）开始一段随聊随用的会话">
              <IconChat />
              新建聊天
            </button>
          )}
        </div>
        <p className="welcome-foot muted">
          不想绑定项目？点「新建聊天」即可直接开聊：会话以你的主目录为根、锁定为只读（不写文件）。
          绑定项目的任务以所选工作目录为根，创建后不可更改。
        </p>
      </div>

      {dirMenuOpen && (
        <DirPickerMenu anchor={createRef.current} onClose={() => setDirMenuOpen(false)} />
      )}
    </div>
  )
}
