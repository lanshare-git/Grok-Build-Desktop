import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { editAndResend } from '../actions'
import { useLocale, useT, type Locale } from '../i18n'
import { useStore } from '../store'
import type { ChatItem, ImageAttachment, MediaAttachment } from '@shared/types'

type ToolItem = Extract<ChatItem, { kind: 'tool' }>
import Markdown from './Markdown'
import PlanPanel from './PlanPanel'
import ThinkingBlock from './ThinkingBlock'
import ToolCallCard from './ToolCallCard'
import ToolGroupCard from './ToolGroupCard'
import { densityGroupsTools } from '@shared/types'
import { IconCopy, IconEdit } from './Icons'

/** 09:20 样式的短时间戳 */
const formatTime = (at: number, locale: Locale): string =>
  new Date(at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false })

function copyText(text: string): void {
  void navigator.clipboard?.writeText(text)
}

/* ------------------------------------------------------------------ *
 *  媒体渲染：把 grok 下发的视频/图片（resource_link / image 内容块，
 *  或对结构化媒体缺失时、从助手文本里抽取的裸媒体链接）渲染出来。
 * ------------------------------------------------------------------ */

const MEDIA_EXT = /\.(mp4|webm|mov|m4v|ogv|png|jpe?g|gif|webp|avif|bmp|svg)(\?\S*)?$/i

function mediaKindFromUri(uri: string): 'video' | 'image' | null {
  const u = uri.toLowerCase().split('#')[0]
  if (!MEDIA_EXT.test(u)) return null
  return /\.(mp4|webm|mov|m4v|ogv)(\?\S*)?$/i.test(u) ? 'video' : 'image'
}

/**
 * 兜底：当助手消息没有结构化 media 时，从文本里抽取裸媒体链接
 * （http(s) URL 或本地绝对路径）。跳过已写在 markdown 链接 `](...)` 里的，
 * 避免与 Markdown 组件重复渲染。
 */
function extractEmbeddedMedia(text: string): MediaAttachment[] {
  if (!text) return []
  const out: MediaAttachment[] = []
  const patterns = [
    /https?:\/\/[^\s)\]]+\.(?:mp4|webm|mov|m4v|ogv|png|jpe?g|gif|webp|avif|bmp|svg)(?:\?\S*)?/gi,
    /(?:[a-zA-Z]:\\[^\s)\]]+|\\[\\[\w.-]+\\[^\s)\]]+)\.(?:mp4|webm|mov|m4v|ogv|png|jpe?g|gif|webp|avif|bmp|svg)/gi
  ]
  for (const re of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      const uri = m[0]
      const before = text.slice(Math.max(0, m.index - 3), m.index)
      if (before.endsWith('](') || before.endsWith('!](')) continue // 已在 markdown 链接内
      const kind = mediaKindFromUri(uri)
      if (kind && !out.some((x) => x.uri === uri)) out.push({ kind, uri })
    }
  }
  return out
}

function MediaView({ media }: { media: MediaAttachment[] }): JSX.Element {
  const t = useT()
  const [srcs, setSrcs] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    void Promise.all(
      media.map(async (m) => {
        try {
          const resolved = await window.grok.resolveAsset(m.uri)
          return [m.uri, resolved] as const
        } catch {
          return [m.uri, ''] as const
        }
      })
    ).then((entries) => {
      if (cancelled) return
      const map: Record<string, string> = {}
      for (const [k, v] of entries) if (v) map[k] = v
      setSrcs(map)
    })
    return () => {
      cancelled = true
    }
  }, [media])

  return (
    <div className="msg-media-wrap">
      {media.map((m) => {
        const src = srcs[m.uri]
        if (!src) {
          return (
            <div key={m.uri} className="msg-media-loading muted">
              {t('chat.preparingMedia')}
            </div>
          )
        }
        return m.kind === 'video' ? (
          <video key={m.uri} className="msg-media" src={src} controls preload="metadata" />
        ) : (
          <img key={m.uri} className="msg-media" src={src} alt={m.name ?? t('chat.imageFallback')} />
        )
      })}
    </div>
  )
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
  const t = useT()
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
            {t('chat.editHint')}
          </span>
          <div className="msg-edit-actions">
            <button className="btn btn-ghost" onClick={props.onCancel}>
              {t('common.cancel')}
            </button>
            <button className="btn btn-primary" onClick={submit} disabled={!draft.trim()}>
              {t('composer.send')}
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
  const t = useT()
  const locale = useLocale()
  const session = useStore((s) => s.sessions.find((x) => x.id === s.activeId))
  const running = useStore((s) => s.running.includes(s.activeId ?? ''))
  // 正在 session/load 重放历史：此时 items 被清空，若不管就会显示 welcome 文案，
  // 等于谎称「会话已就绪」。超大会话重放要好几秒，这个假文案会一直挂着。
  const reloading = useStore((s) => s.reloadingSessions.includes(s.activeId ?? ''))
  /**
   * 重放进度比例（0~1），用于画顶部那条 2px 细线；null = 总数未知 → 画往复动画。
   * ⚠️ 必须返回**数字或 null**（原始值），不能返回对象：
   * zustand 用 Object.is 比较 selector 返回值，每次渲染现造对象会导致无限重渲染。
   */
  const progressRatio = useStore((s) => {
    const id = s.activeId
    const p = id ? s.replayProgress[id] : undefined
    if (!p || p.total <= 0) return null
    return Math.max(0.04, Math.min(1, p.applied / p.total))
  })
  const scrollerRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)

  // 当前正在编辑的用户消息 id；同一时间只允许编辑一条
  const [editingId, setEditingId] = useState<string | null>(null)

  const rawItems = session?.items ?? []
  // 「紧凑 + 分组 / 最紧凑」档：把**连续的同种**工具调用折成一张汇总卡（grok 1.0.52 同义行为）。
  // 必须在渲染前做，且用 useMemo 缓存 —— 否则每次 keystroke 都会重扫几百条 items。
  const groupTools = useStore((s) => densityGroupsTools(s.toolCallDensity))
  const items = useMemo(() => {
    if (!groupTools) return rawItems
    const out: Array<ChatItem | { kind: 'tool-group'; id: string; items: ToolItem[] }> = []
    for (const item of rawItems) {
      const last = out[out.length - 1]
      const canJoin =
        item.kind === 'tool' &&
        last?.kind === 'tool-group' &&
        (last.items[0].toolName || last.items[0].title) === (item.toolName || item.title)
      if (canJoin) {
        // 连续同工具才合并；夹了别的类型就自然断开（上面 canJoin 已保证）
        ;(last as { items: ToolItem[] }).items.push(item)
        continue
      }
      if (item.kind === 'tool') {
        out.push({ kind: 'tool-group', id: `tg-${item.id}`, items: [item] })
        continue
      }
      out.push(item)
    }
    return out
  }, [rawItems, groupTools])

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
        {/*
          重放指示：**只有一条 2px 细进度线**，不要文字、不用 spinner、不加边框。
          之前是「带边框的卡片 + spinner + 「已加载 N/M 条」文案」+ 输入框上方再来一条
 「正在加载历史对话，可先输入…」—— 三处提示同时出现，太吵。
        实测小会话首批只需 7ms、大会话约 700ms，用户其实只需要知道「还在加载」，
        细线足够；文案属于噪音（且 N/M 数字反而让人盯着进度条算时间）。
        只在重放期间存在，不占布局高度以外的空间。
        */}
        {reloading && (
          <div className="replay-line">
            {progressRatio !== null ? (
              <div className="replay-line-fill" style={{ width: `${progressRatio * 100}%` }} />
            ) : (
              <div className="replay-line-fill is-indeterminate" />
            )}
          </div>
        )}

        {items.length === 0 && !reloading && (
          <div className="chat-hint">
            <p>{t('chat.readyLine1')}</p>
            <p className="muted">{t('chat.readyLine2')}</p>
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
                              alt={img.name ?? t('chat.imageFallback')}
                            />
                          ))}
                        </div>
                      )}
                      {item.text}
                    </div>
                    <div className="msg-meta">
                      <span className="msg-time">{formatTime(item.at, locale)}</span>
                      <button
                        className="msg-icon-btn"
                        title={t('common.copy')}
                        onClick={() => copyText(item.text)}
                      >
                        <IconCopy size={13} />
                      </button>
                      {!running && (
                        <button
                          className="msg-icon-btn"
                          title={t('chat.edit')}
                          onClick={() => setEditingId(item.id)}
                        >
                          <IconEdit size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            case 'assistant': {
              const media = item.media && item.media.length > 0 ? item.media : extractEmbeddedMedia(item.text)
              return (
                <div key={item.id} className="msg msg-assistant">
                  <Markdown text={item.text} />
                  {media.length > 0 && <MediaView media={media} />}
                  {item.streaming && <span className="caret" />}
                </div>
              )
            }
            case 'thinking':
              return <ThinkingBlock key={item.id} item={item} />
            case 'tool':
              return <ToolCallCard key={item.id} item={item} />
            case 'tool-group':
              // 只有一张时退回普通卡片，避免为单次调用平白多一层壳
              return item.items.length > 1 ? (
                <ToolGroupCard key={item.id} items={item.items} />
              ) : (
                <ToolCallCard key={item.items[0].id} item={item.items[0]} />
              )
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
            <span>{t('chat.agentWorking')}</span>
          </div>
        )}
      </div>
    </div>
  )
}
