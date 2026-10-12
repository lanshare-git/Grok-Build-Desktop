import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

import { editAndResend } from '../actions'
import { useStore } from '../store'
import type { ImageAttachment } from '@shared/types'
import Markdown from './Markdown'
import PlanPanel from './PlanPanel'
import ThinkingBlock from './ThinkingBlock'
import ToolCallCard from './ToolCallCard'
import { IconCopy, IconEdit } from './Icons'

/** 09:20 样式的短时间戳 */
const formatTime = (at: number): string =>
  new Date(at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })

function copyText(text: string): void {
  void navigator.clipboard?.writeText(text)
}

/* ------------------------------------------------------------------ *
 *  用户消息编辑框：编辑后从此处重新开始对话
 * ------------------------------------------------------------------ */

function UserEditBox(props: {
  initial: string
  images?: ImageAttachment[]
  onCancel: () => void
  onSubmit: (text: string, images?: ImageAttachment[]) => void
}): JSX.Element {
  const [draft, setDraft] = useState(props.initial)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 自动增高 + 进入即聚焦并全选，方便直接改
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.focus()
    el.select()
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [])

  const onChange = (value: string): void => {
    setDraft(value)
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 220)}px`
    }
  }

  const submit = (): void => {
    const value = draft.trim()
    if (!value) return
    props.onSubmit(value, props.images)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      props.onCancel()
    }
  }

  return (
    <div className="msg msg-user">
      <div className="msg-edit">
        <textarea
          ref={textareaRef}
          rows={1}
          value={draft}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="msg-edit-foot">
          <span className="msg-edit-hint">
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8h.01M12 11v5" />
            </svg>
            编辑后将从此处重新开始对话，已有产物不会被删除
          </span>
          <div className="msg-edit-actions">
            <button className="btn btn-ghost" onClick={props.onCancel}>
              取消
            </button>
            <button className="btn btn-primary" onClick={submit} disabled={!draft.trim()}>
              发送
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 *  聊天视图
 * ------------------------------------------------------------------ */

export default function ChatView(): JSX.Element {
  const session = useStore((s) => s.sessions.find((x) => x.id === s.activeId))
  const running = useStore((s) => s.running.includes(s.activeId ?? ''))
  const scrollerRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)

  // 当前正在编辑的用户消息 id；同一时间只允许编辑一条
  const [editingId, setEditingId] = useState<string | null>(null)

  const items = session?.items ?? []

  // 切换会话时退出编辑态
  useEffect(() => {
    setEditingId(null)
  }, [session?.id])

  // 用户向上翻阅时不打断；贴底时自动跟随
  useEffect(() => {
    const el = scrollerRef.current
    if (!el || !pinnedRef.current) return
    el.scrollTop = el.scrollHeight
  }, [items, running])

  const handleScroll = (): void => {
    const el = scrollerRef.current
    if (!el) return
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  const handleSubmitEdit = (itemId: string, text: string, images?: ImageAttachment[]): void => {
    setEditingId(null)
    void editAndResend(itemId, text, images)
  }

  return (
    <div className="chat" ref={scrollerRef} onScroll={handleScroll}>
      <div className="chat-inner">
        {items.length === 0 && (
          <div className="chat-hint">
            <p>会话已就绪，开始描述你想做的事。</p>
            <p className="muted">Agent 可以读写文件、执行命令、检索代码——与终端版 Grok Build 能力一致。</p>
          </div>
        )}

        {items.map((item) => {
          switch (item.kind) {
            case 'user':
              if (editingId === item.id) {
                return (
                  <UserEditBox
                    key={item.id}
                    initial={item.text}
                    images={item.images}
                    onCancel={() => setEditingId(null)}
                    onSubmit={(text, images) => handleSubmitEdit(item.id, text, images)}
                  />
                )
              }
              return (
                <div key={item.id} className="msg msg-user">
                  <div className="user-col">
                    <div className="bubble">
                      {item.images && item.images.length > 0 && (
                        <div className="bubble-images">
                          {item.images.map((img, i) => (
                            <img
                              key={i}
                              src={`data:${img.mimeType};base64,${img.data}`}
                              alt={img.name ?? '图片'}
                            />
                          ))}
                        </div>
                      )}
                      {item.text}
                    </div>
                    <div className="msg-meta">
                      <span className="msg-time">{formatTime(item.at)}</span>
                      <button
                        className="msg-icon-btn"
                        title="复制"
                        onClick={() => copyText(item.text)}
                      >
                        <IconCopy size={13} />
                      </button>
                      {!running && (
                        <button
                          className="msg-icon-btn"
                          title="编辑"
                          onClick={() => setEditingId(item.id)}
                        >
                          <IconEdit size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            case 'assistant':
              return (
                <div key={item.id} className="msg msg-assistant">
                  <Markdown text={item.text} />
                  {item.streaming && <span className="caret" />}
                </div>
              )
            case 'thinking':
              return <ThinkingBlock key={item.id} item={item} />
            case 'tool':
              return <ToolCallCard key={item.id} item={item} />
            case 'plan':
              return <PlanPanel key={item.id} item={item} />
            case 'notice':
              return (
                <div key={item.id} className={`notice notice-${item.level}`}>
                  {item.text}
                </div>
              )
            default:
              return null
          }
        })}

        {running && (
          <div className="running-row">
            <span className="spinner" />
            <span>Agent 正在工作…</span>
          </div>
        )}
      </div>
    </div>
  )
}
