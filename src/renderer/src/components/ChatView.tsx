import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'

import { editAndResend } from '../actions'
import { useLocale, useT, type Locale } from '../i18n'
import { captureLongShotFromElement } from '../long-shot'
import { useStore } from '../store'
import { sessionDisplayTitle } from '../utils'
import type { ChatItem, ImageAttachment, MediaAttachment } from '@shared/types'
import { isAgentNoiseOnly } from '@shared/agent-noise'

type ToolItem = Extract<ChatItem, { kind: 'tool' }>
import Markdown from './Markdown'
import PlanPanel from './PlanPanel'
import ThinkingBlock from './ThinkingBlock'
import ToolCallCard from './ToolCallCard'
import ToolGroupCard from './ToolGroupCard'
import ZoomableImage from './ZoomableImage'
import { densityGroupsTools } from '@shared/types'
import { IconCopy, IconEdit } from './Icons'

/** selector 空态必须稳定引用，否则每次渲染都是新数组 → zustand 无限重渲染 */
const EMPTY_PENDING: Extract<ChatItem, { kind: 'user' }>[] = []

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

const MEDIA_EXT = /\.(mp4|webm|mov|m4v|ogv|png|jpe?g|gif|webp|avif|bmp|svg)(?:\?\S*)?$/i

function mediaKindFromUri(uri: string): 'video' | 'image' | null {
  // 含 TFS ?fileName=xxx.png：扩展名可能在 query 里，不能先 strip ?
  const u = uri.toLowerCase().split('#')[0]
  if (!MEDIA_EXT.test(u) && !/\.(mp4|webm|mov|m4v|ogv|png|jpe?g|gif|webp|avif|bmp|svg)(?:["'\s)>]|$)/i.test(u)) {
    return null
  }
  return /\.(mp4|webm|mov|m4v|ogv)(?:\?|#|"|'|\s|>|$)/i.test(u) ? 'video' : 'image'
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
    // 路径后缀带扩展名：.../a.png?x=1
    /https?:\/\/[^\s)"'\]]+\.(?:mp4|webm|mov|m4v|ogv|png|jpe?g|gif|webp|avif|bmp|svg)(?:\?[^\s)"'\]]*)?/gi,
    // TFS 附件：扩展名只在 query（?fileName=xxx.png）
    /https?:\/\/[^\s)"'\]]+[?&][^\s)"'\]]*\.(?:mp4|webm|mov|m4v|ogv|png|jpe?g|gif|webp|avif|bmp|svg)(?=[^\w.]|$)/gi,
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

/**
 * 图片/视频加载失败（内网鉴权、404 等）时的回退：
 * 照正文里裸 URL 的 code-block 样式展示，http(s) 可点开浏览器（系统侧有登录态时能看）。
 */
function MediaUrlFallback({ uri }: { uri: string }): JSX.Element {
  const isHttp = /^https?:/i.test(uri)
  if (!isHttp) {
    return <div className="msg-media-link">{uri}</div>
  }
  return (
    <a
      className="msg-media-link"
      href={uri}
      title={uri}
      onClick={(e) => {
        e.preventDefault()
        void window.grok.openExternal(uri)
      }}
    >
      {uri}
    </a>
  )
}

function MediaView({ media }: { media: MediaAttachment[] }): JSX.Element | null {
  const t = useT()
  /** uri → 已解析 URL；空串 = 解析失败 */
  const [srcs, setSrcs] = useState<Record<string, string | null>>({})
  /** 加载失败：改成 URL 链接块，不画空图框 */
  const [failed, setFailed] = useState<Record<string, true>>({})

  useEffect(() => {
    let cancelled = false
    void Promise.all(
      media.map(async (m) => {
        try {
          const resolved = await window.grok.resolveAsset(m.uri)
          return [m.uri, resolved || null] as const
        } catch {
          return [m.uri, null] as const
        }
      })
    ).then((entries) => {
      if (cancelled) return
      const map: Record<string, string | null> = {}
      for (const [k, v] of entries) map[k] = v
      setSrcs(map)
    })
    return () => {
      cancelled = true
    }
  }, [media])

  const nodes = media.flatMap((m) => {
    if (failed[m.uri]) {
      return [<MediaUrlFallback key={m.uri} uri={m.uri} />]
    }
    if (!(m.uri in srcs)) {
      return [
        <div key={m.uri} className="msg-media-loading muted">
          {t('chat.preparingMedia')}
        </div>
      ]
    }
    const src = srcs[m.uri]
    if (!src) {
      return [<MediaUrlFallback key={m.uri} uri={m.uri} />]
    }
    return [
      m.kind === 'video' ? (
        <video
          key={m.uri}
          className="msg-media"
          src={src}
          controls
          preload="metadata"
          onError={() => setFailed((f) => ({ ...f, [m.uri]: true }))}
        />
      ) : (
        <ZoomableImage
          key={m.uri}
          className="msg-media"
          src={src}
          alt={m.name ?? t('chat.imageFallback')}
          onError={() => setFailed((f) => ({ ...f, [m.uri]: true }))}
        />
      )
    ]
  })
  if (nodes.length === 0) return null

  return <div className="msg-media-wrap">{nodes}</div>
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
  const longShotPicking = useStore(
    (s) => !!s.activeId && s.longShotPickSessionId === s.activeId
  )
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
  const pendingUser = useStore((s) => {
    const id = s.activeId
    if (!id) return EMPTY_PENDING
    return s.pendingUserMessages[id] ?? EMPTY_PENDING
  })

  // 当前正在编辑的用户消息 id；同一时间只允许编辑一条
  const [editingId, setEditingId] = useState<string | null>(null)
  const [longShotBusy, setLongShotBusy] = useState(false)

  const sessionItems = session?.items ?? []
  const rawItems = useMemo(() => {
    if (pendingUser.length === 0) return sessionItems
    // id 去重不够：乐观气泡与重放/回显气泡 id 不同。
    // 若 items 里已有同正文 user，丢掉 pending（否则会钉到最底，像反着加载）。
    const sameText = (a: string, b: string): boolean => a.includes(b) || b.includes(a)
    const visiblePending = pendingUser.filter(
      (p) =>
        !sessionItems.some(
          (it) =>
            it.id === p.id || (it.kind === 'user' && sameText(it.text, p.text))
        )
    )
    if (visiblePending.length === 0) return sessionItems
    const pendingIds = new Set(visiblePending.map((p) => p.id))
    return [...sessionItems.filter((it) => !pendingIds.has(it.id)), ...visiblePending]
  }, [sessionItems, pendingUser])
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

  const runLongShot = async (startEl: HTMLElement): Promise<void> => {
    const scroller = scrollerRef.current
    if (!scroller || !session) return
    useStore.getState().cancelLongShotPick()
    setLongShotBusy(true)
    // 等选点条卸掉再截，避免条带进画面
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
    try {
      const result = await captureLongShotFromElement(scroller, startEl)
      const title = sessionDisplayTitle(session, locale)
      const saved = await window.grok.saveLongShotPng({
        png: result.png,
        defaultName: `${title || 'session'}-long-shot`
      })
      if (result.truncated) {
        useStore.getState().pushToast({
          level: 'warn',
          title: t('chat.longShotTruncated'),
          text: '',
          ttl: 6000
        })
      }
      if (saved.path) {
        useStore.getState().pushToast({
          level: 'info',
          title: t('chat.longShotDone', { path: saved.path }),
          text: '',
          ttl: 5000
        })
        void window.grok.revealPath(saved.path)
      } else if (saved.clipboard) {
        useStore.getState().pushToast({
          level: 'info',
          title: t('chat.longShotDoneClipboardOnly'),
          text: '',
          ttl: 4000
        })
      } else {
        useStore.getState().pushToast({
          level: 'error',
          title: t('chat.longShotFailed', { message: t('sessionTools.unknownError') }),
          text: '',
          ttl: 5000
        })
      }
    } catch (err) {
      useStore.getState().pushToast({
        level: 'error',
        title: t('chat.longShotFailed', {
          message: err instanceof Error ? err.message : String(err)
        }),
        text: '',
        ttl: 6000
      })
    } finally {
      setLongShotBusy(false)
    }
  }

  const onChatClick = (e: MouseEvent<HTMLDivElement>): void => {
    if (!longShotPicking || longShotBusy) return
    const target = (e.target as HTMLElement | null)?.closest?.('[data-long-shot-target]')
    if (!target || !(target instanceof HTMLElement)) return
    e.preventDefault()
    e.stopPropagation()
    void runLongShot(target)
  }

  const chatClass = [
    'chat',
    longShotPicking ? 'is-long-shot-picking' : '',
    longShotBusy ? 'is-long-shot-capturing' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={chatClass} ref={scrollerRef} onScroll={handleScroll} onClick={onChatClick}>
      {longShotPicking && !longShotBusy && (
        <div className="long-shot-bar" role="status">
          <span className="long-shot-bar-hint">{t('chat.longShotPickHint')}</span>
          <div className="long-shot-bar-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={(e) => {
                e.stopPropagation()
                const inner = scrollerRef.current?.querySelector('.chat-inner')
                const first = inner?.querySelector('[data-long-shot-target]')
                if (first instanceof HTMLElement) void runLongShot(first)
              }}
            >
              {t('chat.longShotFromStart')}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={(e) => {
                e.stopPropagation()
                const scroller = scrollerRef.current
                if (!scroller) return
                // 造一个虚拟起点：当前可视区顶部对应的内容位置
                const probe = document.createElement('div')
                probe.style.position = 'absolute'
                probe.style.left = '0'
                probe.style.width = '1px'
                probe.style.height = '1px'
                probe.style.top = `${scroller.scrollTop}px`
                probe.style.pointerEvents = 'none'
                const inner = scroller.querySelector('.chat-inner')
                if (!inner) return
                ;(inner as HTMLElement).style.position = 'relative'
                inner.appendChild(probe)
                void runLongShot(probe).finally(() => {
                  probe.remove()
                })
              }}
            >
              {t('chat.longShotFromTop')}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={(e) => {
                e.stopPropagation()
                useStore.getState().cancelLongShotPick()
              }}
            >
              {t('chat.longShotCancel')}
            </button>
          </div>
        </div>
      )}
      {/* 截取中不在 chat 里挂提示条——会进截图像；用光标 wait + 标题即可 */}
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
              // agent 注入的 system-reminder（后台任务完成等）不是用户发的，不画气泡
              if (
                isAgentNoiseOnly(item.text) &&
                !(item.images && item.images.length > 0)
              ) {
                return null
              }
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
                <div key={item.id} className="msg msg-user" data-long-shot-target="">
                  <div className="user-col">
                    <div className="bubble">
                      {item.images && item.images.length > 0 && (
                        <div className="bubble-images">
                          {item.images.map((img, i) => (
                            <ZoomableImage
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
              // 光标只在「本会话正在跑」时显示。turn 没收尾时 streaming 会残留并被
              // persist 回来，已完成会话末尾就会永久闪黑块（本会话 1819895 就是此状）。
              return (
                <div key={item.id} className="msg msg-assistant" data-long-shot-target="">
                  <Markdown text={item.text} />
                  {media.length > 0 && <MediaView media={media} />}
                  {item.streaming && running && <span className="caret" />}
                </div>
              )
            }
            case 'thinking':
              return (
                <div key={item.id} data-long-shot-target="">
                  <ThinkingBlock item={item} />
                </div>
              )
            case 'tool':
              return (
                <div key={item.id} data-long-shot-target="">
                  <ToolCallCard item={item} />
                </div>
              )
            case 'tool-group':
              // 只有一张时退回普通卡片，避免为单次调用平白多一层壳
              return item.items.length > 1 ? (
                <div key={item.id} data-long-shot-target="">
                  <ToolGroupCard items={item.items} />
                </div>
              ) : (
                <div key={item.items[0].id} data-long-shot-target="">
                  <ToolCallCard item={item.items[0]} />
                </div>
              )
            case 'plan':
              return (
                <div key={item.id} data-long-shot-target="">
                  <PlanPanel item={item} />
                </div>
              )
            case 'notice':
              return (
                <div
                  key={item.id}
                  className={`notice notice-${item.level}`}
                  data-long-shot-target=""
                >
                  {item.text}
                </div>
              )
            default:
              return null
          }
        })}

        {running && !longShotBusy && (
          <div className="running-row">
            <span className="spinner" />
            <span>{t('chat.agentWorking')}</span>
          </div>
        )}
      </div>
    </div>
  )
}
