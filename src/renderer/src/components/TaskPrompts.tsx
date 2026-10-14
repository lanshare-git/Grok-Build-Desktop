import { useStore } from '../store'
import PermissionPanel from './PermissionPanel'
import QuestionPanel from './QuestionPanel'

/**
 * 任务内嵌的「待响应」区。
 *
 * 只展示**当前任务**的授权请求与 Agent 提问，固定在输入框上方（不随聊天内容滚动）。
 * 归属其它任务的请求不在这里出现：由侧栏的「待响应」琥珀标记 + 右下角全局提示引导用户过去。
 *
 * 这样做的原因：旧实现把这两类请求渲染成全局模态框，任何一个任务（哪怕是后台的）
 * 触发都会盖住当前界面，用户被迫中断手头的事去处理别的任务。
 */
export default function TaskPrompts(): JSX.Element | null {
  const activeId = useStore((s) => s.activeId)
  // 返回的是数组里已有的对象引用（不是每次新建），不会触发无限重渲染
  const permission = useStore((s) =>
    activeId ? (s.permissions.find((p) => p.sessionId === activeId) ?? null) : null
  )
  const question = useStore((s) =>
    activeId ? (s.questions.find((q) => q.sessionId === activeId) ?? null) : null
  )

  if (!permission && !question) return null

  return (
    <div className="task-prompt">
      <div className="task-prompt-inner">
        {permission && <PermissionPanel key={permission.requestId} request={permission} />}
        {question && <QuestionPanel key={question.requestId} event={question} />}
      </div>
    </div>
  )
}
