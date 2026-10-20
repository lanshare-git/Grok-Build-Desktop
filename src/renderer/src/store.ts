import { create } from 'zustand'
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware'

import type {
  AcpStreamEvent,
  AvailableCommand,
  ChatItem,
  ConfigOption,
  ConnectionState,
  DiagnosticsReport,
  GrokAccount,
  GrokAnnouncement,
  GrokEnvInfo,
  ImageAttachment,
  MediaAttachment,
  McpServer,
  PermissionMode,
  PermissionRequestEvent,
  UserQuestionEvent,
  PlanEntry,
  SessionMeta,
  SessionUpdateEnvelope,
  ToolCallDensity,
  ToolCallLocation,
  TurnUsage,
  WorkspaceMeta
} from '@shared/types'
import { densityExpandsByDefault } from '@shared/types'
import { stripAgentNoise } from '@shared/agent-noise'
import { resolveLocale, t as tShared, type Locale } from '@shared/i18n'
import { mostRecentWorkspaceCwd, normalizeDir, toolCallOutput } from './utils'
import type { AppVersionInfo } from '@shared/api'

const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

/** 设置中心的分区（统一收编 MCP / 环境自检 / 关于等原本散落的入口） */
export type SettingsSection =
  | 'general'
  | 'account'
  /** 全局用量：账号额度（每周百分比）+ 全部会话累计 */
  | 'usage'
  | 'mcp'
  | 'plugins'
  /** 磁盘占用（~/.grok 各目录）+ 记忆清理 */
  | 'disk'
  /** git worktree 清单与 gc */
  | 'worktree'
  /** grok 版本检查与安装更新 */
  | 'version'
  | 'diagnostics'
  | 'about'

const MAX_SESSIONS = 60
const MAX_ITEMS_PER_SESSION = 400

/** 输入框未发送草稿（按会话记忆；不落盘，含图片 base64 太大） */
export interface ComposerDraft {
  text: string
  attachments: ImageAttachment[]
}

function composerDraftHasContent(draft: ComposerDraft | undefined): boolean {
  if (!draft) return false
  return draft.text.trim().length > 0 || draft.attachments.length > 0
}

/**
 * 可丢弃的空草稿（对齐 Cursor「New Agent 未发消息即撤销」）。
 * 已写入用户消息、正在首发、或输入框里还有未发送内容的草稿不能丢。
 */
function isDisposableDraft(
  session: SessionMeta,
  running: readonly string[],
  composerDrafts: Record<string, ComposerDraft>
): boolean {
  return (
    !!session.isDraft &&
    session.items.length === 0 &&
    !running.includes(session.id) &&
    !composerDraftHasContent(composerDrafts[session.id])
  )
}

function dropComposerDraft(
  map: Record<string, ComposerDraft>,
  id: string
): Record<string, ComposerDraft> {
  if (!(id in map)) return map
  const next = { ...map }
  delete next[id]
  return next
}

const CATALOG_IDS = new Set(['model', 'reasoning_effort'])

/** 从会话 configOptions 抽出可缓存的模型/推理强度选项（供新任务草稿下拉用） */
function pickConfigCatalog(options: ConfigOption[] | undefined): ConfigOption[] {
  if (!options?.length) return []
  return options.filter((o) => CATALOG_IDS.has(o.configId ?? o.id ?? ''))
}

function mergeConfigCatalog(
  prev: ConfigOption[],
  incoming: ConfigOption[] | undefined
): ConfigOption[] {
  const picked = pickConfigCatalog(incoming)
  if (picked.length === 0) return prev
  const map = new Map<string, ConfigOption>()
  for (const o of prev) {
    const id = o.configId ?? o.id
    if (id) map.set(id, o)
  }
  for (const o of picked) {
    const id = o.configId ?? o.id
    if (id) map.set(id, o)
  }
  return [...map.values()]
}

/** 从已有会话里挖一份目录（冷启动时还没有独立缓存） */
function catalogFromSessions(sessions: SessionMeta[]): ConfigOption[] {
  let out: ConfigOption[] = []
  for (const s of sessions) {
    out = mergeConfigCatalog(out, s.configOptions)
  }
  return out
}

/**
 * 按 name 合并两组命令，后者覆盖同名前项的描述（grok 可能给同一命令补全描述）。
 * 返回新数组，避免在 selector 里产生新引用导致的重渲染。
 */
function mergeByName(base: AvailableCommand[], incoming: AvailableCommand[]): AvailableCommand[] {
  if (incoming.length === 0) return base
  if (base.length === 0) return incoming
  const map = new Map<string, AvailableCommand>()
  for (const c of base) if (c?.name) map.set(c.name, c)
  for (const c of incoming) if (c?.name) map.set(c.name, { ...map.get(c.name), ...c })
  return [...map.values()]
}

/** 只带元数据、不代表「用户有新活动」的 session/update 类型 */
const METADATA_UPDATES = new Set([
  'session_info_update',
  'available_commands_update',
  'config_option_update'
])

/**
 * 重放尾巴的硬上限：session/load 返回后，静默窗口最多只能被重放通知
 * 往后延长这么多毫秒。取30s 是因为几百条消息的大会话重放实测要好几秒；
 * 超时后该会话恢复正常记账（此后的更新才算真活动）。
 */
const REPLAY_SLIDING_CAP_MS = 30_000

/* ------------------------------------------------------------------ *
 *  transcript 归约：把 ACP session/update 折叠成有序的 ChatItem 列表
 * ------------------------------------------------------------------ */

type TextKind = 'user' | 'assistant' | 'thinking'

function finalize(items: ChatItem[]): ChatItem[] {
  return items.map((it) =>
    it.kind === 'assistant' || it.kind === 'thinking' ? { ...it, streaming: false } : it
  )
}

/**
 * 重放收尾时把指定会话里仍在 `streaming: true` 的条目封口。
 *
 * 为什么需要：重放全部经reduceUpdate，最后一条 assistant/thinking 是以
 * `streaming: true` 建出来的，而 `finalizeSession`（唯一会封口的对外动作）
 * **只在 sendPrompt 真正生成时调用**。于是重放历史后消息末尾会**永久闪烁一个
 * 生成光标**，看起来像那里可以输入，其实是历史内容。
 *
 * 只在真的有条目仍处于 streaming 时才返回新数组（无变化就复用原引用），
 * 避免每次重放收尾都无谓地让整个会话引用变化、触发一轮重渲染。
 */
function finalizeReplay(sessions: SessionMeta[], sessionId: string): SessionMeta[] {
  // ⚠️ 该会话正在真实生成中 → **不能封口**。否则用户在生成过程中切走再切回，
  // 恰好触发重放收尾，会把还在流式输出的消息提前封成完成态（光标消失、后续分片断流）。
  if (useStore.getState().running.includes(sessionId)) return sessions

  const index = sessions.findIndex((x) => x.id === sessionId)
  if (index === -1) return sessions
  const items = sessions[index].items
  if (!items.some((it) => (it.kind === 'assistant' || it.kind === 'thinking') && it.streaming)) {
    return sessions
  }
  const next = [...sessions]
  next[index] = { ...sessions[index], items: finalize(items) }
  return next
}

/**
 * 工具卡「卡住」时的兜底文案。两种来源说法不同，且都刻意**不写「失败」**：
 * 客户端确实没收到结果，写「失败」等于替 agent 编了一个它从没说过的结论。
 */
const STUCK_REASON_TURN = '回合已结束，客户端未收到该工具的返回结果（可能是被中断或 agent 侧超时）。'
const STUCK_REASON_REPLAY = '这是上一次进程里未完成的调用，重启后不会再有结果。'

/**
 * 把「非终态」的工具卡标成 `interrupted` —— 纯本地状态，不依赖 agent 下发。
 *
 * 依据（scripts/cancel-tool-probe.mjs 实测，别凭感觉改）：`session/cancel`
 * **只结束 prompt，停不掉在飞的工具**，agent 也不会补发终态 update
 * —— 观测 60s，该卡始终是 `in_progress`。没有兜底就是永远转圈。
 *
 * 无变化时返回**原数组**（保持引用稳定，memo 才跳得掉整列表重渲染）。
 */
function markStuckToolsIn(items: ChatItem[], reason: string, only?: string[]): ChatItem[] {
  const hit = (it: ChatItem): boolean =>
    it.kind === 'tool' &&
    (it.status === 'in_progress' || it.status === 'pending') &&
    // 传了白名单就只清算**中断那一刻在飞的那批** —— 中途新起的调用不能被误伤
    (!only || only.includes(it.toolCallId))
  if (!items.some(hit)) return items
  return items.map((it) => (hit(it) ? { ...it, status: 'interrupted' as const, output: reason } : it))
}

/** 重放收尾版：会话正在真实生成中时不许动（同 finalizeReplay 的守卫理由） */
function markStuckToolsAfterReplay(sessions: SessionMeta[], sessionId: string): SessionMeta[] {
  if (useStore.getState().running.includes(sessionId)) return sessions
  const index = sessions.findIndex((x) => x.id === sessionId)
  if (index === -1) return sessions
  const items = markStuckToolsIn(sessions[index].items, STUCK_REASON_REPLAY)
  if (items === sessions[index].items) return sessions
  const next = [...sessions]
  next[index] = { ...sessions[index], items }
  return next
}

function isLocalUser(item: ChatItem | undefined): item is Extract<ChatItem, { kind: 'user' }> {
  return !!item && item.kind === 'user' && item.local === true
}

/** pending 乐观气泡与 items 里已有 user 是否同一条（id 不同，只能比正文） */
function isSameUserText(a: string, b: string): boolean {
  return a.includes(b) || b.includes(a)
}

/**
 * 把 pendingUserMessages 并入 items 末尾（按正文去重），并清掉 pending。
 * 供 finishSessionReplay / 发 prompt 前兜底 / clearLoaded 异常路径共用。
 */
function mergePendingUserMessages(
  sessions: SessionMeta[],
  pendingUserMessages: Record<string, Extract<ChatItem, { kind: 'user' }>[]>,
  sessionId: string
): {
  sessions: SessionMeta[]
  pendingUserMessages: Record<string, Extract<ChatItem, { kind: 'user' }>[]>
} {
  const pending = pendingUserMessages[sessionId] ?? []
  const nextPending = { ...pendingUserMessages }
  delete nextPending[sessionId]
  if (pending.length === 0) {
    return { sessions, pendingUserMessages: nextPending }
  }
  return {
    pendingUserMessages: nextPending,
    sessions: sessions.map((x) => {
      if (x.id !== sessionId) return x
      const ids = new Set(x.items.map((it) => it.id))
      const userTexts = x.items
        .filter((it): it is Extract<ChatItem, { kind: 'user' }> => it.kind === 'user')
        .map((it) => it.text)
      const extra = pending.filter((p) => {
        if (ids.has(p.id)) return false
        return !userTexts.some((t) => isSameUserText(t, p.text))
      })
      return extra.length === 0 ? x : { ...x, items: [...x.items, ...extra] }
    })
  }
}

/** 优先用 agent 下发的真实事件时间；没有才退回现在（现场发送的乐观气泡仍走 Date.now()） */
function eventAt(update: SessionUpdateEnvelope): number {
  const meta = update._meta
  if (meta && typeof meta === 'object') {
    const raw = (meta as Record<string, unknown>).agentTimestampMs
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw
  }
  return Date.now()
}

function appendText(items: ChatItem[], kind: TextKind, text?: string, at = Date.now()): ChatItem[] {
  if (!text) return items
  const last = items[items.length - 1]

  if (last && last.kind === kind) {
    // 用字面量比较才能让 TS 收窄到具体变体
    if (last.kind === 'user') {
      // 本地乐观插入的用户消息已经是完整一条。agent 回显同一段文字时
      // 再 concat 会变成「自己的话重复两遍」；重放历史的下一条用户消息
      // 若拼进来，刚发的内容会消失在历史气泡里（界面底部就像没发出去）。
      if (last.local) {
        // agent 回显同一段 → 去掉 local。若不摘掉，下次 session/load 会把这条
        // 当「未确认」收进 pending，重放完再挂到列表末尾，看起来就像
        // 「最新一条是我发的、后面没有 Agent 回复」（2026-10-19 实锤）。
        if (last.text.includes(text) || text.includes(last.text)) {
          const textKeep = last.text.length >= text.length ? last.text : text
          return [...items.slice(0, -1), { ...last, text: textKeep, local: false }]
        }
        return [...items, { kind: 'user', id: uid(), text, at }]
      }
      return [...items.slice(0, -1), { ...last, text: last.text + text }]
    }
    if (last.streaming) {
      return [...items.slice(0, -1), { ...last, text: last.text + text }]
    }
  }

  const sealed = finalize(items)
  if (kind === 'user') {
    return [...sealed, { kind: 'user', id: uid(), text, at }]
  }
  return [
    ...sealed,
    { kind, id: uid(), text, streaming: true, at } as ChatItem
  ]
}

function contentText(content: SessionUpdateEnvelope['content']): string | undefined {
  return content?.type === 'text' ? content.text : undefined
}

/**
 * 把用户附图挂到最近一条用户气泡上。
 *
 * session/load 重放时 grok 先推 `user_message_chunk`（type=image），再推文字 chunk；
 * 以前只认 text，图片块被直接丢掉 → 重启/切会话后「一起发出的图」消失。
 */
function appendUserImage(items: ChatItem[], img: ImageAttachment, at = Date.now()): ChatItem[] {
  if (!img.data || !img.mimeType) return items
  const last = items[items.length - 1]
  if (last?.kind === 'user') {
    const prev = last.images ?? []
    if (prev.some((x) => x.data === img.data)) return items
    return [...items.slice(0, -1), { ...last, images: [...prev, img] }]
  }
  return [...finalize(items), { kind: 'user', id: uid(), text: '', images: [img], at }]
}

/** 由 mimeType / uri 后缀推断媒体类型（resource_link 可能不带 mimeType） */
function guessMediaKind(uri?: string, mimeType?: string): 'video' | 'image' | null {
  const mt = (mimeType || '').toLowerCase()
  if (mt.startsWith('video/')) return 'video'
  if (mt.startsWith('image/')) return 'image'
  if (!uri) return null
  // 路径后缀或 query（TFS ?fileName=xxx.png）里带扩展名都算
  const u = uri.toLowerCase().split('#')[0]
  if (/\.(mp4|webm|mov|m4v|ogv)(?:\?|#|$)/i.test(u) || /[?&][^#]*\.(mp4|webm|mov|m4v|ogv)(?:&|#|$)/i.test(u)) {
    return 'video'
  }
  if (/\.(png|jpe?g|gif|webp|avif|bmp|svg)(?:\?|#|$)/i.test(u) || /[?&][^#]*\.(png|jpe?g|gif|webp|avif|bmp|svg)(?:&|#|$)/i.test(u)) {
    return 'image'
  }
  return null
}

/**
 * 从一条 session/update 抽取媒体附件。grok 可能以单块（content）或多块数组
 * （contentBlocks / contents）形式下发 resource_link / image 内容块。
 */
function mediaFromUpdate(update: SessionUpdateEnvelope): MediaAttachment[] {
  const raw = update as unknown as { content?: any; contentBlocks?: any; contents?: any }
  const blocks: any[] = []
  if (Array.isArray(raw.contentBlocks)) blocks.push(...raw.contentBlocks)
  else if (Array.isArray(raw.contents)) blocks.push(...raw.contents)
  else if (raw.content) blocks.push(raw.content)

  const out: MediaAttachment[] = []
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue
    if (b.type === 'resource_link') {
      const kind = guessMediaKind(b.uri, b.mimeType)
      if (kind && b.uri) out.push({ kind, uri: b.uri, mimeType: b.mimeType, name: b.name })
    } else if (b.type === 'image') {
      if (b.data) {
        out.push({ kind: 'image', uri: `data:${b.mimeType};base64,${b.data}`, mimeType: b.mimeType, name: b.name })
      } else if (b.uri) {
        out.push({ kind: 'image', uri: b.uri, mimeType: b.mimeType, name: b.name })
      }
    }
  }
  return out
}

/** 把媒体挂到「当前正在流式输出的助手消息」；若没有则新建一条只含媒体的助手消息 */
function appendMedia(items: ChatItem[], media: MediaAttachment[], at = Date.now()): ChatItem[] {
  if (media.length === 0) return items
  const merge = (prev: MediaAttachment[] | undefined): MediaAttachment[] =>
    media.reduce((list, m) => (list.some((x) => x.uri === m.uri) ? list : [...list, m]), prev ?? [])
  const last = items[items.length - 1]
  if (last && last.kind === 'assistant' && last.streaming) {
    return [...items.slice(0, -1), { ...last, media: merge(last.media) }]
  }
  const sealed = finalize(items)
  const item = {
    kind: 'assistant',
    id: uid(),
    text: '',
    streaming: true,
    at,
    media: merge(undefined)
  } as ChatItem
  return [...sealed, item]
}

function upsertTool(items: ChatItem[], update: SessionUpdateEnvelope, at = Date.now()): ChatItem[] {
  const toolCallId = String(update.toolCallId ?? '')
  if (!toolCallId) return items

  const index = items.findIndex((it) => it.kind === 'tool' && it.toolCallId === toolCallId)
  const sealed = index === -1 ? finalize(items) : items

  if (index !== -1) {
    const current = sealed[index]
    if (current.kind !== 'tool') return items
    // 输出去重口径见 utils.toolCallOutput：rawOutput 优先，其次 content 文本块
    //（失败原因只走在 content 里，之前只读 rawOutput 会把失败卡片变成一句光秃秃的「失败」）
    const output = toolCallOutput(update)
    const merged: ChatItem = {
      ...current,
      title: update.title ?? current.title,
      toolKind: update.kind ?? current.toolKind,
      toolName: update.toolName ?? current.toolName,
      status: update.status ?? current.status,
      input: update.rawInput !== undefined ? update.rawInput : current.input,
      output: output !== undefined ? output : current.output,
      locations: (update.locations as ToolCallLocation[] | undefined) ?? current.locations
    }
    return [...sealed.slice(0, index), merged, ...sealed.slice(index + 1)]
  }

  return [
    ...sealed,
    {
      kind: 'tool',
      id: uid(),
      toolCallId,
      title: update.title ?? '工具调用',
      toolKind: update.kind,
      toolName: update.toolName,
      status: update.status ?? 'in_progress',
      input: update.rawInput,
      output: toolCallOutput(update),
      locations: update.locations as any,
      at
    }
  ]
}

function upsertPlan(items: ChatItem[], entries: PlanEntry[], at = Date.now()): ChatItem[] {
  const index = items.findIndex((it) => it.kind === 'plan')
  if (index !== -1) {
    const current = items[index]
    if (current.kind !== 'plan') return items
    const merged = { ...current, entries, at }
    return [...items.slice(0, index), merged, ...items.slice(index + 1)]
  }
  return [...finalize(items), { kind: 'plan', id: uid(), entries, at }]
}

function reduceUpdate(items: ChatItem[], update: SessionUpdateEnvelope): ChatItem[] {
  const at = eventAt(update)
  switch (update.sessionUpdate) {
    case 'user_message_chunk': {
      const content = update.content
      // 附图：type=image + base64 data（与文字分两条 chunk，常见顺序是图→文）
      if (content?.type === 'image' && content.data) {
        return appendUserImage(
          items,
          {
            data: content.data,
            mimeType: content.mimeType || 'image/png',
            name: content.name
          },
          at
        )
      }
      // agent 注入的 <system-reminder> 等会以 user_message_chunk 下发，不能画成用户气泡
      const raw = content && content.type === 'text' ? content.text : undefined
      if (!raw) return items
      const text = stripAgentNoise(raw)
      if (!text) return items
      return appendText(items, 'user', text, at)
    }
    case 'agent_message_chunk': {
      const text = contentText(update.content)
      const media = mediaFromUpdate(update)
      // 文本与媒体可能分多条 chunk 到达，但都属于同一条流式助手消息
      let next = text ? appendText(items, 'assistant', text, at) : items
      if (media.length) next = appendMedia(next, media, at)
      return next
    }
    case 'agent_thought_chunk':
      return appendText(items, 'thinking', contentText(update.content), at)
    case 'tool_call':
    case 'tool_call_update':
      return upsertTool(items, update, at)
    case 'plan':
      return upsertPlan(items, update.entries ?? [], at)
    default:
      return items
  }
}

/* ------------------------------------------------------------------ *
 *  Store
 * ------------------------------------------------------------------ */

/**
 * 右下角全局提示（不持久化）。
 *
 * 定位：**只有在「不打断当前任务」的前提下才该用它**。任务内的授权/提问一律内联到
 * 该任务的输入框上方；只有当请求归属的任务不是当前正在看的那个时，才用这里的提示兜底。
 */
export interface Toast {
  id: string
  level: 'info' | 'success' | 'warn' | 'error'
  title: string
  text?: string
  /** 关联任务：点击提示跳到该任务 */
  sessionId?: string
  /** 关联的授权/提问请求：该请求被响应后，这条提示自动消失 */
  requestId?: number
  /** 可选动作按钮 */
  action?: 'reconnect'
  /** 自动消失毫秒数；0 或省略 = 常驻，需手动关闭 */
  ttl?: number
  createdAt: number
}

interface AppState {
  connection: { state: ConnectionState; message?: string }
  sessions: SessionMeta[]
  activeId: string | null
  cwd: string
  /** 用户主目录（homedir）：「纯聊天」会话以此作为工作根，不受默认 cwd 影响 */
  homeDir: string
  permissionMode: PermissionMode
  /**
   * 各会话输入框未发送内容（文字 + 图片）。不持久化。
   * 对齐 Cursor：切走再回来草稿还在；新任务只要输入框非空，切走也不自动撤销。
   */
  composerDrafts: Record<string, ComposerDraft>
  /**
   * 最近一次从真实会话拿到的模型 / 推理强度选项目录。
   * 草稿会话没有 ACP configOptions，Header 用这份缓存画下拉。
   */
  configOptionCatalog: ConfigOption[]
  /** 新建任务默认选用的模型（用户在草稿或真实会话里改过会更新） */
  preferredModel: string | null
  preferredEffort: string | null
  running: string[]
  /**
   * Agent 已跑完、但用户还没点开看过的会话（不持久化）。
   * 对齐 Cursor：蓝点 = 做完未读；点开该会话即清除。
   */
  unreadSessionIds: string[]
  /**
   * 待用户响应的工具授权请求（可多个任务并存，按 sessionId 归属）。
   *
   * 旧实现是**一个全局槽位**：谁最后触发谁占用，界面把它渲染成铺满全屏的模态框——
   * 于是「后台任务请求授权」会把用户当前正在看的任务整个盖住。现在按会话归属、
   * 内联到对应任务的输入框上方，不再抢焦点。
   */
  permissions: PermissionRequestEvent[]
  /** 待回答的 Agent 提问，同样按 sessionId 归属、内联展示 */
  questions: UserQuestionEvent[]
  /** 右下角全局提示（不持久化） */
  toasts: Toast[]
  logs: string[]
  diagnostics: DiagnosticsReport | null
  /**
   * 设置中心当前分区；null = 关闭。
   * 一个状态管所有设置类入口（通用 / MCP / 环境自检 / 关于），
   * 替代原先 showDiagnostics / showMcp / showAbout 三个互不知情的布尔。
   */
  settingsSection: SettingsSection | null
  /** 当前已配置的 MCP 服务器（由主进程从 grok 读取，不持久化） */
  mcpServers: McpServer[]
  /** 当前登录的 grok 账户（非敏感字段；未登录为 null，不持久化） */
  account: GrokAccount | null
  /** 已在当前 agent 进程中创建/加载过的会话（不持久化，agent 重启后失效） */
  loadedSessions: string[]
  /**
   * 会话 -> 在此刻之前收到的 ACP 通知一律不算「有新活动」（不持久化）。
   *
   * 为什么需要它：`session/load` 会把整段历史当作一串 session/update 重放回来，
   * 若照单全收地刷新 updatedAt，**光是点开一个会话**就会把它顶到侧栏最前面，
   * 于是每切一次会话分组顺序就翻一次 —— 这就是「排序一直跳」的根因。
   */
  suppressActivityUntil: Record<string, number>
  /**
   * 正在 session/load 重放历史的会话（不持久化）。
   *
   * 为什么要显式存一份，而不是靠 suppressActivityUntil 的时间窗推断：
   * 超大会话（实测 729 条 update）重放要 ~6s，这期间界面必须显示「正在加载历史」，
   * 而不是 `items.length === 0` 命中 welcome 文案（那等于谎称「会话已就绪」）。
   * 同时这段时间输入框要保持可用（允许提前打字），不能被 running 态误禁。
   */
  reloadingSessions: string[]
  /**
   * 重放进度（不持久化）：会话 -> 已应用到界面的重放条数。
   *
   * 为什么要显式计数：`reloadingSessions` 只能表达「正在重放」，无法回答
   *「还剩多少」。用户反馈的「进度走完了但只加载了一部分」就是缺这个信号——
   * 界面在 loadSession 返回那一刻就宣告结束，可实际还有几百条 update 在路上。
   * 有了计数，ChatView 才能在顶部画那条 2px 细进度线（**不显示 N/M 文字**，太吵），
   * 并且 stream-queue 能判断「是否已排空」—— 这才是它最关键的用途。
   */
  replayProgress: Record<string, { applied: number; total: number; lastAt: number }>
  /**
   * 重放「尾巴」的硬上限（绝对时间戳）：静默窗口每收到一条重放通知就往后延，
   * 但最多只到这个点 —— 防止超长会话一直重放导致该会话永远不刷新活动时间。
   */
  replayCapUntil: Record<string, number>
  /**
   * 正在重放时，用户新发的消息不能进 items（重放是追加语义，会插到历史中间，
   * 或被 beginSessionReload 清掉）。先挂在这里，ChatView 永远画在列表末尾，
   * 重放收尾再并进 items。不持久化。
   */
  pendingUserMessages: Record<string, Extract<ChatItem, { kind: 'user' }>[]>
  /** 工作目录登记表：别名 + 手动添加的目录（会话本身的 cwd 由 grok 决定，不在这里） */
  workspaces: WorkspaceMeta[]
  /** 侧栏里折叠起来的分组（存规范化小写路径） */
  collapsedGroups: string[]
  /**
   * 展开着的工具调用（存 toolCallId）。
   * 白名单语义：不在集合里 = 折叠（这也是新工具调用的默认态）。
   * toolCallId 由 agent 生成、session/load 重放时带回同一批 id，跨重启稳定。
   */
  expandedToolCalls: string[]
  /**
   * 被用户**手动收起**的工具调用（存 toolCallId）。
   * 为什么需要它：密度档位为「详细」时工具卡默认展开，若只有 expandedToolCalls 白名单，
   * 用户点一下收起就会被立即弹回展开态，等于关不掉。两个集合都不在时才走密度默认态。
   */
  collapsedToolCalls: string[]
  /** 工具调用展示密度（grok `ui.tool_call_density`，与终端共用；不持久化，启动时从 config.toml 读） */
  toolCallDensity: ToolCallDensity
  /** 应用自身版本信息（不持久化，启动时从主进程取） */
  appVersion: AppVersionInfo | null
  /**
   * 界面语言（不持久化；唯一事实源在主进程 config.json）。
   * 初始值同步归一 navigator.language 避免首帧闪烁，启动 effect 里再经 IPC 回源校正。
   */
  locale: Locale
  /** 首次点击关闭、配置为空时，主进程请求弹窗询问「关闭时如何」 */
  showCloseActionPrompt: boolean
  /** 用量面板是否打开（不持久化） */
  usageOpen: boolean
  /** 用量面板当前查看的会话 id；null = 只看全局累计（从账号菜单进来就是这种） */
  usageSessionId: string | null
  /**
   * 长截屏「选起点」模式：非 null 时 ChatView 进入点选态。
   * 不持久化 —— 关应用就取消。
   */
  longShotPickSessionId: string | null
  /**
   * agent 握手时上报的内置命令（compact / context / deep-research…），
   * 与 `grok inspect` 拿到的技能、子代理合并后构成命令面板的完整来源。
   * ACP 只在 initialize 响应里给一次，不接住就只剩客户端硬编码的两条。
   */
  builtinCommands: AvailableCommand[]
  /** grok 下发的公告（新功能/版本提示，终端里是启动横幅） */
  announcements: GrokAnnouncement[]
  /** `grok inspect` 结果：内置技能与子代理清单（不持久化，启动时刷新） */
  envInfo: GrokEnvInfo | null

  /** 写入 agent 上报的元能力（命令 + 公告） */
  applyAgentMeta(meta: { commands: AvailableCommand[]; announcements: GrokAnnouncement[] }): void
  /** 写入 grok inspect 的技能/子代理视图 */
  setEnvInfo(info: GrokEnvInfo | null): void

  setConnection(state: ConnectionState, message?: string): void
  setCwd(cwd: string): void
  setHomeDir(homeDir: string): void
  setPermissionMode(v: PermissionMode): void
  setDiagnostics(report: DiagnosticsReport | null): void
  setMcpServers(list: McpServer[]): void
  /** 写入当前登录账户（null = 未登录）；来自主进程读取 ~/.grok/auth.json */
  setAccount(account: GrokAccount | null): void
  setAppVersion(info: AppVersionInfo | null): void
  /** 更新界面语言缓存（唯一事实源在主进程 config.json，经 IPC 回源/广播同步） */
  setLocale(locale: Locale): void
  /** 直接指定设置中心的分区（null = 关闭） */
  setSettingsSection(v: SettingsSection | null): void
  /* 下面三个保留旧签名（原先是各自面板的开关），内部统一落到 settingsSection：
     调用点（Sidebar / Header / Welcome / actions）无需感知重构。 */
  toggleDiagnostics(v?: boolean): void
  toggleMcp(v?: boolean): void
  toggleAbout(v?: boolean): void
  /** 设置关闭行为询问弹窗的显隐（主进程请求时打开） */
  setShowCloseActionPrompt(v?: boolean): void
  /** 打开用量面板；传 null 表示只看全局累计（账号额度入口） */
  openUsage(sessionId: string | null): void
  closeUsage(): void

  /** 登记一个工作目录（已存在则只标记为手动添加） */
  addWorkspace(path: string): void
  /** 改别名；alias 传空则恢复显示目录名 */
  renameWorkspace(path: string, alias: string): void
  /** 从登记表移除（不影响会话本身） */
  removeWorkspace(path: string): void
  toggleGroup(key: string): void
  /** 展开/折叠单个工具调用；结果写入 expanded/collapsed 覆盖集合，跨会话记忆 */
  toggleToolCall(toolCallId: string): void
  /** 设置展示密度（同时落盘 config.toml，由调用方负责 IPC） */
  setToolCallDensity(v: ToolCallDensity): void
  /** 某个工具调用当前是否展开 = 覆盖集合优先，其次按密度默认态 */
  isToolCallExpanded(toolCallId: string): boolean

  createSession(meta: { id: string; cwd: string; configOptions?: ConfigOption[]; kind?: 'chat' }): void
  /**
   * 建一个本地草稿会话（不调 grok 的 session/new，磁盘不落文件）。
   * 用户首次发送时才由 materializeDraft 替换为真实会话。
   */
  createDraftSession(meta: { cwd: string; kind?: 'chat'; permissionMode: PermissionMode }): void
  /**
   * 草稿首发送时调用：把草稿 sessionId 替换为 grok newSession 返回的 realId，
   * 沿用草稿的 kind / cwd / items（已塞入的用户消息），并标记为已加载，
   * 使后续 prompt 不再触发 loadSession。
   */
  materializeDraft(draftId: string, meta: { id: string; configOptions?: ConfigOption[] }): void
  selectSession(id: string | null): void
  deleteSession(id: string): void
  /** 写入/更新某会话的输入框草稿；text 与附件皆空则删除该键 */
  setComposerDraft(sessionId: string, draft: ComposerDraft): void
  clearComposerDraft(sessionId: string): void
  /** 记住模型/推理强度选项目录（来自 session/new 或 config_option_update） */
  rememberConfigCatalog(options: ConfigOption[] | undefined): void
  /**
   * 草稿上改模型/推理强度：只写 pending* + preferred，首发 newSession 时带上。
   * 真实会话请走 actions.changeConfigOption（发 ACP）。
   */
  setDraftConfig(sessionId: string, configId: 'model' | 'reasoning_effort', value: string): void
  /** 改会话名：写 customTitle，不动 updatedAt（改名不该改变排序） */
  renameSession(id: string, title: string): void
  /**
   * 改会话的工作目录（磁盘目录已被搬运后才调用）。
   * 只动 `cwd`，并清掉 `activityAt` —— 路径变了，旧值对应的文件已经不在了，
   * 由随后的 `refreshActivity` 从新路径重读。排序/分组都由 cwd 派生，无需额外处理。
   */
  setSessionCwd(id: string, cwd: string): void

  /** 发送前调用：未知会话先清空本地历史，由 session/load 重放重建，并暂时屏蔽活动刷新 */
  beginSessionReload(sessionId: string, total?: number): void
  markSessionLoaded(sessionId: string): void
  /**
   * 每应用完一批重放就推进进度（只累加计数，**不判定结束**）。
   * 结束判定在 stream-queue.ts 的 maybeFinishReplay 里（需结合总条数与静默时间）。
   */
  advanceReplayProgress(sessionId: string, applied: number): void
  /** 写入主进程报的重放总条数（用于显示 N/M 与判断是否已排空） */
  setReplayTotal(sessionId: string, total: number): void
  /**
   * 真正结束重放态：解开活动屏蔽、留静默窗、清进度（四处必须成对清理，勿漏）。
   *
   * 正常路径由 stream-queue 判定「已排空或已静默」后调用；加载失败时由 actions
   * 直接调用，否则「正在加载」会一直转。
   * ⚠️ 刻意不提供「无条件结束」的快捷方法 —— 那正是「进度提前走完、
   * 只加载了一部分」的成因，留着一定会被误用。
   */
  finishSessionReplay(sessionId: string): void
  /**
   * 把仍挂着的 pending 用户气泡强制并入 items（发 prompt 前兜底）。
   * 重放超时 / agent 重启清掉 reloading 却漏 flush 时，否则 Agent 流会写进 items，
   * 用户气泡仍被 ChatView 钉在最底 —— 看起来像「反着加载」。
   */
  flushPendingUserMessages(sessionId: string): void
  clearLoadedSessions(): void
  /**
   * 卸载单个会话的本地状态（配合 ACP session/close）。
   * 会话与历史保留，只清「已在 agent 进程内」及其派生状态。
   */
  forgetLoadedSession(sessionId: string): void
  /**
   * 用磁盘真值刷新会话的活动时间（排序的权威来源）。
   * 启动时对所有会话调用一次；每个回合结束后再对当前会话调一次。
   * 读不到（草稿会话、文件缺失）的会话保持不变，不会把已有时间抹掉。
   */
  refreshActivity(sessionIds?: string[]): Promise<void>
  /** 追加一条用户消息（支持图片附件） */
  pushUserMessage(sessionId: string, text: string, images?: ImageAttachment[]): void

  applyStream(event: AcpStreamEvent): void
  /**
   * 批量应用 update：整批只做一次 set()。
   * persist 会在每次 set() 后全量序列化 store，重放大会话时必须用它，
   * 否则逐条 set 会造成数秒的主线程阻塞（详见实现处的实测数据）。
   */
  applyStreamBatch(events: AcpStreamEvent[]): void
  appendNotice(sessionId: string, text: string, level?: 'info' | 'warn' | 'error'): void
  setRunning(sessionId: string, running: boolean): void
  /** 标记会话有未读完成结果（一般由 setRunning(false) 自动调用） */
  markSessionUnread(sessionId: string): void
  /** 清除未读（点开会话时） */
  clearSessionUnread(sessionId: string): void
  finalizeSession(sessionId: string): void
  /** 编辑重发：删除指定 item 及其之后的所有内容（UI 层从头开始对话） */
  truncateFrom(sessionId: string, itemId: string): void

  /**
   * 客户端兜底：把该会话里**没有终态**的工具卡标成 `interrupted`，返回被标记的数量。
   *
   * 只在「回合已结束 / 已中断」时调用（sendPrompt 的 finally、点 ■ 后的延迟扫描、重放收尾）——
   * 生成途中**绝不能无条件调**：一个跑了 3 分钟的长命令会被误判成「没收到结果」。
   * 真要在生成途中清理，必须传 `onlyToolCallIds` 限定到具体那几个调用。
   */
  markStuckTools(sessionId: string, reason?: string, onlyToolCallIds?: string[]): number

  pushLog(line: string): void
  clearLogs(): void

  setPermission(request: PermissionRequestEvent): void
  /** 按 requestId 移除（已响应的那一条），并收起与它关联的全局提示 */
  clearPermission(requestId: number): void

  setQuestion(event: UserQuestionEvent): void
  clearQuestion(requestId: number): void

  /** agent 进程重启/退出时清空全部待响应项（它们已随进程失效） */
  clearAllPrompts(): void

  /** 弹出一条右下角提示，返回其 id */
  pushToast(toast: Omit<Toast, 'id' | 'createdAt'> & { id?: string }): string
  dismissToast(id: string): void

  /** 进入长截屏选点模式（通常先切到该会话） */
  beginLongShotPick(sessionId: string): void
  cancelLongShotPick(): void

  activeSession(): SessionMeta | undefined
}

/**
 * 把一批 session/update 应用到 state 上，**整批只产生一个新 state**。
 *
 * 抽成模块级函数（而不是内联在 set() 里）是为了让 applyStream / applyStreamBatch
 * 共用同一段逻辑：单条走 applyStream（生成中每个分片），
 * 重放/回放走 applyStreamBatch（一批几百条）。
 *
 * 批量化是性能关键，不是微优化：zustand persist 会在**每次 set()** 后把整个 store
 * 做 partialize + JSON.stringify（本机实测 547KB/次、约 6.6ms）。
 * 大会话重放 732 条 update，逐条 set = 732 次全量序列化 ≈ 4.8s 纯阻塞，
 * 还会连带732 次 React 重渲染。批量化后降到 19 次 ≈ 19ms。
 */
function applyOne(s: AppState, events: AcpStreamEvent[]): Partial<AppState> {
  if (events.length === 0) return {}

  let sessions = s.sessions
  let suppressActivityUntil = s.suppressActivityUntil
  let replayCapUntil = s.replayCapUntil
  let configOptionCatalog = s.configOptionCatalog
  /** 是否已复制过数组：批内只复制一次，后续更新就地改我们自己的副本 */
  let copied = false

  for (const { sessionId, update } of events) {
    const index = sessions.findIndex((x) => x.id === sessionId)
    if (index === -1) continue
    // 复制一次即可；未改动的会话元素保持原引用，React memo 才能跳过重渲染
    if (!copied) {
      sessions = [...sessions]
      copied = true
    }

    const session = sessions[index]
    let items = session.items
    let title = session.title
    let commands = session.commands
    let configOptions = session.configOptions
    let usage: TurnUsage | undefined = session.usage

    items = reduceUpdate(items, update)

    if (update.sessionUpdate === 'session_info_update' && update.title) {
      title = String(update.title)
    }
    if (update.sessionUpdate === 'available_commands_update') {
      commands = update.availableCommands ?? []
    }
    if (update.sessionUpdate === 'config_option_update' && update.configOptions) {
      configOptions = update.configOptions
      configOptionCatalog = mergeConfigCatalog(configOptionCatalog, update.configOptions)
    }
    const rawUsage = (update as any).usage
    if (rawUsage && typeof rawUsage === 'object') {
      usage = {
        inputTokens: rawUsage.input_tokens ?? rawUsage.inputTokens,
        outputTokens: rawUsage.output_tokens ?? rawUsage.outputTokens,
        cacheReadInputTokens: rawUsage.cache_read_input_tokens ?? rawUsage.cacheReadInputTokens,
        cacheCreationInputTokens:
          rawUsage.cache_creation_input_tokens ?? rawUsage.cacheCreationInputTokens,
        reasoningTokens: rawUsage.reasoning_tokens ?? rawUsage.reasoningTokens,
        totalTokens: rawUsage.total_tokens ?? rawUsage.totalTokens,
        numTurns: rawUsage.num_turns ?? rawUsage.numTurns,
        costUsd: rawUsage.total_cost_usd ?? rawUsage.costUSD,
        model: rawUsage.model
      }
    }

    const trimmed =
      items.length > MAX_ITEMS_PER_SESSION ? items.slice(-MAX_ITEMS_PER_SESSION) : items

    // 只有「真有内容产出」的通知才算新活动。
    //  · 重放期间（suppressActivityUntil）收到的一律不算 —— 否则点开会话就会顶到最前
    //  · 标题/命令/配置这类元数据更新也不算活动
    const now = Date.now()
    const until = suppressActivityUntil[sessionId] ?? 0
    const isSuppressed = until > now
    const metadataOnly = METADATA_UPDATES.has(update.sessionUpdate)
    const wasActive = !isSuppressed && !metadataOnly

    // 滑动静默窗口：还在窗口里就又收到通知 = 重放仍在继续，把窗口往后延，
    // 但不超过硬上限（避免超长会话无限重放导致该会话永不刷新活动时间）。
    // 判定用延之前的 suppressed，所以本条通知依旧不算活动。
    if (isSuppressed && Number.isFinite(until)) {
      const cap = replayCapUntil[sessionId] ?? 0
      const nextUntil = Math.min(now + 1200, cap > 0 ? cap : until)
      suppressActivityUntil = { ...suppressActivityUntil, [sessionId]: nextUntil }
      // 超过上限：窗口不再延长，并清掉这两个键避免无限堆积
      if (cap > 0 && now >= cap) {
        suppressActivityUntil = { ...suppressActivityUntil, [sessionId]: 0 }
        replayCapUntil = { ...replayCapUntil, [sessionId]: 0 }
      }
    }

    // ⚠️ activityAt 也要一起刷：侧栏优先读 activityAt（防重放污染 updatedAt）。
    // 若只改 updatedAt，上一回合 refreshActivity 留下的旧 activityAt 会盖住本回合的
    // 实时活动——表现为「新建会话正在跑，侧栏却显示几十分钟前」（2026-10-19）。
    const next: SessionMeta = {
      ...session,
      items: trimmed,
      title,
      commands,
      configOptions,
      usage,
      updatedAt: wasActive ? now : session.updatedAt,
      activityAt: wasActive ? now : session.activityAt
    }

    // 就地写进我们自己的副本
    sessions[index] = next
  }

  if (!copied && configOptionCatalog === s.configOptionCatalog) return {}
  const out: Partial<AppState> = {}
  if (copied) {
    out.sessions = sessions
    out.suppressActivityUntil = suppressActivityUntil
    out.replayCapUntil = replayCapUntil
  }
  if (configOptionCatalog !== s.configOptionCatalog) {
    out.configOptionCatalog = configOptionCatalog
  }
  return out
}

/**
 * 真正落盘的字段集合（= `partialize` 的返回值）。
 * 单独抽出来是为了给自定义 storage 一个准确的泛型参数 —— persist 的存储层
 * 是对**持久化子集**操作的，用 AppState 会类型不匹配。
 */
type PersistedState = Pick<
  AppState,
  | 'sessions'
  | 'activeId'
  | 'cwd'
  | 'permissionMode'
  | 'workspaces'
  | 'collapsedGroups'
  | 'expandedToolCalls'
  | 'collapsedToolCalls'
  | 'configOptionCatalog'
  | 'preferredModel'
  | 'preferredEffort'
>

/**
 * 持久化存储（自带节流）。
 *
 * ⚠️ 为什么必须自己实现，不能直接用 `createJSONStorage(() => localStorage)`：
 * zustand persist 在**每一次 set()** 之后都会跑一遍
 * `partialize → JSON.stringify → storage.setItem`。
 * 用本机真实数据实测（持久化负载 3.61MB / 5 个会话 / 497 条 item）：
 *   - `JSON.stringify` 单次约 **30ms**
 *   - `localStorage.setItem` 单次约 **107ms**（写 3.6MB 到 LevelDB，同步阻塞主线程）
 * 合计 **~137ms 纯阻塞，且每一次 set() 都要付一遍**。
 * 会话重放时每批 update 会触发多次 set()，几十次叠加就是好几秒 —— 表现正是
 * 「切换会话后输入框一段时间打不动字」。
 *
 * 这里把「序列化 + 落盘」从每次 set() 里解耦：set() 只记住最新值，
 * 真正落盘按 PERSIST_THROTTLE_MS 合并成一次；页面隐藏/卸载前再强制落一次。
 *
 * 代价：崩溃时最多丢失这几百毫秒内的界面状态。这是可接受的 ——
 * 持久化的 items 只是「重开应用时的预览缓存」，权威数据在 grok 磁盘上
 * （点开会话会 `session/load` 全量重放），丢了没有实际损失。
 */
const PERSIST_THROTTLE_MS = 800

let pendingPersist: { name: string; value: StorageValue<PersistedState> } | null = null
let persistTimer: ReturnType<typeof setTimeout> | null = null

function flushPersist(): void {
  if (persistTimer !== null) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  const pending = pendingPersist
  pendingPersist = null
  if (!pending) return
  try {
    localStorage.setItem(pending.name, JSON.stringify(pending.value))
  } catch (err) {
    // 配额超限 / 隐私模式：落盘失败不该影响使用，仅记录
    console.warn('[persist] 写入失败：', err)
  }
}

const throttledPersistStorage: PersistStorage<PersistedState> = {
  getItem: (name) => {
    try {
      const raw = localStorage.getItem(name)
      return raw ? (JSON.parse(raw) as StorageValue<PersistedState>) : null
    } catch (err) {
      console.warn('[persist] 读取失败，按空状态启动：', err)
      return null
    }
  },
  setItem: (name, value) => {
    pendingPersist = { name, value }
    // 已有排期就只更新待写值，不重复排期 —— 一个窗口内无论 set() 多少次，都只落盘一次
    if (persistTimer !== null) return
    persistTimer = setTimeout(flushPersist, PERSIST_THROTTLE_MS)
  },
  removeItem: (name) => {
    pendingPersist = null
    try {
      localStorage.removeItem(name)
    } catch {
      /* 忽略 */
    }
  }
}

// 页面隐藏 / 卸载前强制落一次，别把最新状态拖丢
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushPersist)
  window.addEventListener('beforeunload', flushPersist)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPersist()
  })
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      connection: { state: 'idle' },
      sessions: [],
      activeId: null,
      cwd: '',
      homeDir: '',
      permissionMode: 'bypassPermissions',
      composerDrafts: {},
      configOptionCatalog: [],
      preferredModel: null,
      preferredEffort: null,
      running: [],
      unreadSessionIds: [],
      permissions: [],
      questions: [],
      toasts: [],
      logs: [],
      diagnostics: null,
      settingsSection: null,
      mcpServers: [],
      account: null,
      loadedSessions: [],
      suppressActivityUntil: {},
      replayCapUntil: {},
      reloadingSessions: [],
      replayProgress: {},
      pendingUserMessages: {},
      workspaces: [],
      collapsedGroups: [],
      expandedToolCalls: [],
      appVersion: null,
      locale: resolveLocale(typeof navigator !== 'undefined' ? navigator.language : 'zh-CN'),
      showCloseActionPrompt: false,
      builtinCommands: [],
      announcements: [],
      envInfo: null,
      usageOpen: false,
      usageSessionId: null,
      longShotPickSessionId: null,
      collapsedToolCalls: [],
      toolCallDensity: 'compact-ungrouped',

      setConnection: (state, message) => set({ connection: { state, message } }),
      setCwd: (cwd) => set({ cwd }),
      setHomeDir: (homeDir) => set({ homeDir }),
      setPermissionMode: (permissionMode) => set({ permissionMode }),
      setDiagnostics: (diagnostics) => set({ diagnostics }),

      setMcpServers: (mcpServers) => set({ mcpServers }),
      setAccount: (account) => set({ account }),

      setAppVersion: (appVersion) => set({ appVersion }),
      setLocale: (locale) => set({ locale }),

      // agent 上报的元能力：命令与公告都以「合并」语义写入，
      // 重复推送（agent 重启后再握手一次）不会把已有内容清掉。
      applyAgentMeta: ({ commands, announcements }) =>
        set((s) => ({
          builtinCommands: mergeByName(s.builtinCommands, commands),
          announcements: announcements.length > 0 ? announcements : s.announcements
        })),
      setEnvInfo: (envInfo) => set({ envInfo }),

      openUsage: (usageSessionId) => set({ usageOpen: true, usageSessionId }),
      closeUsage: () => set({ usageOpen: false }),
      setSettingsSection: (settingsSection) => set({ settingsSection }),
      toggleDiagnostics: (v) =>
        set((s) => ({
          settingsSection:
            v === undefined
              ? s.settingsSection === 'diagnostics'
                ? null
                : 'diagnostics'
              : v
                ? 'diagnostics'
                : null
        })),
      toggleMcp: (v) =>
        set((s) => ({
          settingsSection:
            v === undefined ? (s.settingsSection === 'mcp' ? null : 'mcp') : v ? 'mcp' : null
        })),
      toggleAbout: (v) =>
        set((s) => ({
          settingsSection:
            v === undefined ? (s.settingsSection === 'about' ? null : 'about') : v ? 'about' : null
        })),
      setShowCloseActionPrompt: (v) =>
        set((s) => ({ showCloseActionPrompt: v === undefined ? !s.showCloseActionPrompt : v })),

      addWorkspace: (path) =>
        set((s) => {
          const normalized = normalizeDir(path)
          const key = normalized.toLowerCase()
          const exists = s.workspaces.some((w) => normalizeDir(w.path).toLowerCase() === key)
          if (exists) {
            return {
              workspaces: s.workspaces.map((w) =>
                normalizeDir(w.path).toLowerCase() === key
                  ? { ...w, path: normalized, manual: true }
                  : w
              )
            }
          }
          return {
            workspaces: [
              ...s.workspaces,
              { path: normalized, manual: true, createdAt: Date.now() }
            ]
          }
        }),

      renameWorkspace: (path, alias) =>
        set((s) => {
          const normalized = normalizeDir(path)
          const key = normalized.toLowerCase()
          const clean = alias.trim()
          const exists = s.workspaces.some((w) => normalizeDir(w.path).toLowerCase() === key)
          if (!exists) {
            return {
              workspaces: [
                ...s.workspaces,
                { path: normalized, alias: clean || undefined, createdAt: Date.now() }
              ]
            }
          }
          return {
            workspaces: s.workspaces.map((w) =>
              normalizeDir(w.path).toLowerCase() === key
                ? { ...w, alias: clean || undefined }
                : w
            )
          }
        }),

      removeWorkspace: (path) =>
        set((s) => {
          const key = normalizeDir(path).toLowerCase()
          return {
            workspaces: s.workspaces.filter((w) => normalizeDir(w.path).toLowerCase() !== key)
          }
        }),

      toggleGroup: (key) =>
        set((s) => ({
          collapsedGroups: s.collapsedGroups.includes(key)
            ? s.collapsedGroups.filter((k) => k !== key)
            : [...s.collapsedGroups, key]
        })),

      // 两集合都要留空槽：点一下从「默认态」翻到相反态，再点回来（而不是二值翻转默认态），
      // 这样在「详细」档位下也能把某张卡单独收起来。
      toggleToolCall: (toolCallId) =>
        set((s) => {
          if (!toolCallId) return {}
          const wasExpanded = s.isToolCallExpanded(toolCallId)
          const drop = (arr: string[]): string[] => arr.filter((id) => id !== toolCallId)
          const add = (arr: string[]): string[] =>
            // partialize 只保留每个会话最后 120 个 item，被截掉的历史 toolCallId 会永久残留。
            // 不做 O(所有会话×item) 的精确对账，改用长度封顶（300 远超实际上限，实践中永不误伤）。
            [...drop(arr), toolCallId].slice(-300)
          return {
            expandedToolCalls: wasExpanded ? drop(s.expandedToolCalls) : add(s.expandedToolCalls),
            collapsedToolCalls: wasExpanded ? add(s.collapsedToolCalls) : drop(s.collapsedToolCalls)
          }
        }),

      setToolCallDensity: (toolCallDensity) => set({ toolCallDensity }),

      isToolCallExpanded: (toolCallId) => {
        const s = get()
        if (s.collapsedToolCalls.includes(toolCallId)) return false
        if (s.expandedToolCalls.includes(toolCallId)) return true
        return densityExpandsByDefault(s.toolCallDensity)
      },

      createSession: ({ id, cwd, configOptions, kind }) =>
        set((s) => {
          const clearUnread = {
            unreadSessionIds: s.unreadSessionIds.filter((x) => x !== id)
          }
          if (s.sessions.some((x) => x.id === id)) {
            return {
              activeId: id,
              loadedSessions: s.loadedSessions.includes(id) ? s.loadedSessions : [...s.loadedSessions, id],
              ...clearUnread
            }
          }
          const session: SessionMeta = {
            id,
            title: kind === 'chat' ? tShared(get().locale, 'chat.newChat') : tShared(get().locale, 'chat.newTask'),
            cwd,
            kind,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            items: [],
            configOptions: configOptions ?? [],
            commands: []
          }
          return {
            sessions: [session, ...s.sessions].slice(0, MAX_SESSIONS),
            activeId: id,
            loadedSessions: [...s.loadedSessions, id],
            configOptionCatalog: mergeConfigCatalog(s.configOptionCatalog, configOptions),
            ...clearUnread
          }
        }),

      createDraftSession: ({ cwd, kind, permissionMode }) =>
        set((s) => {
          const id = `draft:${crypto.randomUUID()}`
          // 目录为空时从其它会话挖一份，保证「新任务」也能立刻画模型下拉
          const catalog =
            s.configOptionCatalog.length > 0
              ? s.configOptionCatalog
              : catalogFromSessions(s.sessions)
          const session: SessionMeta = {
            id,
            title: kind === 'chat' ? tShared(get().locale, 'chat.newChat') : tShared(get().locale, 'chat.newTask'),
            cwd,
            kind,
            isDraft: true,
            pendingPermissionMode: permissionMode,
            pendingModel: s.preferredModel ?? undefined,
            pendingEffort: s.preferredEffort ?? undefined,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            items: [],
            // 草稿本身没有 ACP 选项；挂上缓存目录供 Header 渲染（currentValue 用 preferred 覆盖）
            configOptions: catalog.map((o) => {
              const cid = o.configId ?? o.id
              if (cid === 'model' && s.preferredModel) {
                return { ...o, currentValue: s.preferredModel }
              }
              if (cid === 'reasoning_effort' && s.preferredEffort) {
                return { ...o, currentValue: s.preferredEffort }
              }
              return o
            }),
            commands: []
          }
          // 对齐 Cursor：未发消息的草稿不进侧栏；再建时先撤掉其它空草稿
          // （输入框还有未发送内容的草稿不算空，会保留，但仍不在侧栏显示）
          const dropped = s.sessions.filter((x) => isDisposableDraft(x, s.running, s.composerDrafts))
          const kept = s.sessions.filter((x) => !isDisposableDraft(x, s.running, s.composerDrafts))
          let composerDrafts = s.composerDrafts
          for (const d of dropped) composerDrafts = dropComposerDraft(composerDrafts, d.id)
          return {
            sessions: [session, ...kept].slice(0, MAX_SESSIONS),
            activeId: id,
            composerDrafts,
            // 冷启动从其它会话挖出的目录写回，避免下次还要再扫
            configOptionCatalog: catalog,
            unreadSessionIds: s.unreadSessionIds.filter((x) => x !== id)
          }
        }),

      materializeDraft: (draftId, { id, configOptions }) =>
        set((s) => {
          const idx = s.sessions.findIndex((x) => x.id === draftId)
          if (idx === -1) return {}
          const draft = s.sessions[idx]
          const real: SessionMeta = {
            ...draft,
            id,
            isDraft: false,
            pendingPermissionMode: undefined,
            pendingModel: undefined,
            pendingEffort: undefined,
            configOptions: configOptions ?? [],
            updatedAt: Date.now()
          }
          const sessions = s.sessions.map((x) => (x.id === draftId ? real : x))
          const pending = s.pendingUserMessages[draftId]
          let pendingUserMessages = s.pendingUserMessages
          if (pending && pending.length > 0) {
            pendingUserMessages = { ...s.pendingUserMessages }
            delete pendingUserMessages[draftId]
            pendingUserMessages[id] = [...(pendingUserMessages[id] ?? []), ...pending]
          }
          // 输入框草稿随 sessionId 迁移（发送前通常已清空；兜底防丢）
          let composerDrafts = s.composerDrafts
          const moved = composerDrafts[draftId]
          if (moved) {
            composerDrafts = { ...composerDrafts, [id]: moved }
            delete composerDrafts[draftId]
          }
          return {
            sessions,
            activeId: id,
            pendingUserMessages,
            composerDrafts,
            configOptionCatalog: mergeConfigCatalog(s.configOptionCatalog, configOptions),
            loadedSessions: s.loadedSessions.includes(id)
              ? s.loadedSessions
              : [...s.loadedSessions, id],
            unreadSessionIds: s.unreadSessionIds.filter((x) => x !== id && x !== draftId)
          }
        }),

      rememberConfigCatalog: (options) =>
        set((s) => {
          const next = mergeConfigCatalog(s.configOptionCatalog, options)
          if (next === s.configOptionCatalog) return {}
          // 顺带用最新 currentValue 填 preferred（用户还没手选过时）
          const model = next.find((o) => (o.configId ?? o.id) === 'model')
          const effort = next.find((o) => (o.configId ?? o.id) === 'reasoning_effort')
          return {
            configOptionCatalog: next,
            preferredModel: s.preferredModel ?? model?.currentValue ?? null,
            preferredEffort: s.preferredEffort ?? effort?.currentValue ?? null
          }
        }),

      setDraftConfig: (sessionId, configId, value) =>
        set((s) => ({
          preferredModel: configId === 'model' ? value : s.preferredModel,
          preferredEffort: configId === 'reasoning_effort' ? value : s.preferredEffort,
          sessions: s.sessions.map((x) => {
            if (x.id !== sessionId) return x
            const configOptions = x.configOptions.map((o) =>
              (o.configId ?? o.id) === configId ? { ...o, currentValue: value } : o
            )
            // 草稿才写 pending*；真实会话只乐观更新 currentValue + preferred
            if (!x.isDraft) return { ...x, configOptions }
            return {
              ...x,
              configOptions,
              ...(configId === 'model' ? { pendingModel: value } : { pendingEffort: value })
            }
          })
        })),

      selectSession: (activeId) =>
        set((s) => {
          // 对齐 Cursor：空「New Agent」切走即撤销——未发过消息且输入框也空的草稿才丢掉
          const prev = s.sessions.find((x) => x.id === s.activeId)
          const dropPrev =
            prev &&
            prev.id !== activeId &&
            isDisposableDraft(prev, s.running, s.composerDrafts)
          const sessions = dropPrev
            ? s.sessions.filter((x) => x.id !== prev.id)
            : s.sessions
          return {
            sessions,
            activeId,
            composerDrafts: dropPrev
              ? dropComposerDraft(s.composerDrafts, prev.id)
              : s.composerDrafts,
            // 点开即视为已读（对齐 Cursor 蓝点清除）
            unreadSessionIds: activeId
              ? s.unreadSessionIds.filter((x) => x !== activeId)
              : s.unreadSessionIds,
            // 切走会话时取消选点，避免条带挂在错误会话上
            longShotPickSessionId:
              s.longShotPickSessionId && s.longShotPickSessionId !== activeId
                ? null
                : s.longShotPickSessionId
          }
        }),

      setComposerDraft: (sessionId, draft) =>
        set((s) => {
          if (!composerDraftHasContent(draft)) {
            return { composerDrafts: dropComposerDraft(s.composerDrafts, sessionId) }
          }
          return {
            composerDrafts: { ...s.composerDrafts, [sessionId]: draft }
          }
        }),

      clearComposerDraft: (sessionId) =>
        set((s) => ({ composerDrafts: dropComposerDraft(s.composerDrafts, sessionId) })),

      deleteSession: (id) =>
        set((s) => {
          const sessions = s.sessions.filter((x) => x.id !== id)
          // 一并清掉所有按会话 id 索引的临时状态：留着会拖住内存，
          // 且万一 id 被复用会「串味」（例如新会话莫名处于重放静默期）。
          const dropKey = <T,>(map: Record<string, T>): Record<string, T> => {
            if (!(id in map)) return map
            const next = { ...map }
            delete next[id]
            return next
          }
          return {
            sessions,
            activeId: s.activeId === id ? (sessions[0]?.id ?? null) : s.activeId,
            loadedSessions: s.loadedSessions.filter((x) => x !== id),
            running: s.running.filter((x) => x !== id),
            unreadSessionIds: s.unreadSessionIds.filter((x) => x !== id),
            reloadingSessions: s.reloadingSessions.filter((x) => x !== id),
            suppressActivityUntil: dropKey(s.suppressActivityUntil),
            replayCapUntil: dropKey(s.replayCapUntil),
            replayProgress: dropKey(s.replayProgress),
            pendingUserMessages: dropKey(s.pendingUserMessages),
            composerDrafts: dropComposerDraft(s.composerDrafts, id)
          }
        }),

      renameSession: (id, title) =>
        set((s) => ({
          // 只写 customTitle，不碰 title / updatedAt：
          // title 继续留给 grok 的自动标题，排序也不该因为改个名字而变化。
          // 预填的是「当前显示名」，所以用户原样提交很常见 —— 此时清掉 customTitle，
          // 让会话继续跟随 grok 的自动标题，而不是把此刻的标题冻结成固定名字。
          sessions: s.sessions.map((x) => {
            if (x.id !== id) return x
            const clean = title.trim()
            return { ...x, customTitle: clean && clean !== x.title ? clean : undefined }
          })
        })),

      /**
       * 改会话工作目录（磁盘目录已由主进程搬移完成后调用）。
       * 侧栏分组与排序都是从 `session.cwd` 派生的，所以只改这一个字段即可 ——
       * 搬完自动落到新工作目录的分组里。`activityAt` 一并清掉：路径变了，
       * 旧值对应的文件已不在原处，让 `refreshActivity` 从新路径重读。
       */
      setSessionCwd: (id, cwd) =>
        set((s) => ({
          sessions: s.sessions.map((x) =>
            x.id === id ? { ...x, cwd, activityAt: undefined } : x
          )
        })),

      beginSessionReload: (sessionId, total) =>
        set((s) => {
          // agent 将通过 session/load 重放完整历史，先清掉本地旧记录避免重复。
          // 只收「贴在列表末尾、后面还没有任何内容」的 local 用户消息：
          // 那些才是「刚发出、agent 可能还没落盘」的；夹在历史中间的 local
          // 是回显后没摘标记的残留，收了会在重放末尾再挂一条（用户看到的就是
          // 最新气泡是自己的话、后面没有回复）。
          const harvested: Extract<ChatItem, { kind: 'user' }>[] = [
            ...(s.pendingUserMessages[sessionId] ?? [])
          ]
          return {
            sessions: s.sessions.map((x) => {
              if (x.id !== sessionId) return x
              for (let i = x.items.length - 1; i >= 0; i--) {
                const it = x.items[i]
                if (!isLocalUser(it)) break
                if (!harvested.some((p) => p.id === it.id)) harvested.unshift(it)
              }
              return { ...x, items: [] }
            }),
            pendingUserMessages: { ...s.pendingUserMessages, [sessionId]: harvested },
            suppressActivityUntil: {
              ...s.suppressActivityUntil,
              [sessionId]: Number.MAX_SAFE_INTEGER
            },
            replayCapUntil: { ...s.replayCapUntil, [sessionId]: 0 },
            reloadingSessions: s.reloadingSessions.includes(sessionId)
              ? s.reloadingSessions
              : [...s.reloadingSessions, sessionId],
            replayProgress: {
              ...s.replayProgress,
              // total初始为 -1 = 「总数未知」；主进程 replay_begin 到达后会覆盖。
              // ⚠️ 不能初始为 0 —— 0 表示「已确认无历史」，会让进度条在 replay_begin 之前就收尾。
              [sessionId]: { applied: 0, total: total ?? -1, lastAt: Date.now() }
            }
          }
        }),

      markSessionLoaded: (sessionId) =>
        set((s) => ({
          loadedSessions: s.loadedSessions.includes(sessionId)
            ? s.loadedSessions
            : [...s.loadedSessions, sessionId]
        })),

/**
 * 推进重放计数（只累加，结束判定交给 stream-queue 的 maybeFinishReplay）。
 */
advanceReplayProgress: (sessionId, applied) =>
        set((s) => {
          const cur = s.replayProgress[sessionId]
          if (!cur) return {}
          return {
            replayProgress: {
              ...s.replayProgress,
              [sessionId]: { ...cur, applied: cur.applied + applied, lastAt: Date.now() }
            }
          }
        }),

      setReplayTotal: (sessionId, total) =>
      set((s) => {
          const cur = s.replayProgress[sessionId]
          if (!cur || cur.total === total) return {}
          return { replayProgress: { ...s.replayProgress, [sessionId]: { ...cur, total } } }
        }),

      /**
       * 真正结束重放态。
       *
       * ⚠️ suppressActivityUntil / replayCapUntil / reloadingSessions / replayProgress
       * **四处必须成对清理**，漏任何一处都有后遗症（进度条卡住 / 「正在加载」永不消失 /
       * 该会话此后不再刷新活动时间）。
       */
    finishSessionReplay: (sessionId) =>
      set((s) => {
        const now = Date.now()
        const progress = { ...s.replayProgress }
        delete progress[sessionId]
        const merged = mergePendingUserMessages(s.sessions, s.pendingUserMessages, sessionId)
        const sessions = markStuckToolsAfterReplay(
          finalizeReplay(merged.sessions, sessionId),
          sessionId
        )
        return {
          // ⚠️ 必须同时 finalize：重放走的是 reduceUpdate，最后一条 assistant/thinking
          // 会停在 `streaming: true`（没人再调 finalizeSession —— 那个只在 sendPrompt 里调）。
          // 结果就是历史消息末尾**永久闪烁一个生成光标**，用户会误以为那里能输入。
          //（实测 WorkHub 会话 01a12f33：331 条 update 重放后残留 1 条 streaming=true。）
          // 顺带兜底：重放是从磁盘读的历史，里面**未完成的工具调用**永远等不到结果
          //（那是上一个 agent 进程的事，新进程不会为它补发终态）—— 不标就是永远转圈。
          // 正是「重启客户端后某张卡一直『执行中』」的成因（2026-10-15）。
          sessions,
          pendingUserMessages: merged.pendingUserMessages,
          suppressActivityUntil: { ...s.suppressActivityUntil, [sessionId]: now + 1200 },
          replayCapUntil: { ...s.replayCapUntil, [sessionId]: now + REPLAY_SLIDING_CAP_MS },
          reloadingSessions: s.reloadingSessions.filter((id) => id !== sessionId),
          replayProgress: progress
        }
      }),

      flushPendingUserMessages: (sessionId) =>
        set((s) => {
          if (!(sessionId in s.pendingUserMessages)) return {}
          const merged = mergePendingUserMessages(s.sessions, s.pendingUserMessages, sessionId)
          return {
            sessions: merged.sessions,
            pendingUserMessages: merged.pendingUserMessages
          }
        }),

      clearLoadedSessions: () =>
        set((s) => {
          // agent 重启会走这里：reloading 被清掉时必须把 pending 并回 items，
          // 否则 waitForReplay 立刻返回 → prompt 开跑 → 用户气泡仍钉在底部。
          let sessions = s.sessions
          let pendingUserMessages = s.pendingUserMessages
          for (const id of Object.keys(pendingUserMessages)) {
            const merged = mergePendingUserMessages(sessions, pendingUserMessages, id)
            sessions = merged.sessions
            pendingUserMessages = merged.pendingUserMessages
          }
          return {
            sessions,
            pendingUserMessages,
            loadedSessions: [],
            suppressActivityUntil: {},
            replayCapUntil: {},
            reloadingSessions: [],
            replayProgress: {}
          }
        }),

      /**
       * 卸载单个会话（ACP session/close 成功后的本地收尾）。
       * 与 clearLoadedSessions 同样要清掉四份派生状态，否则该会话会永远显示
       * 「正在加载历史」、进度条卡住。**会话本身与 items 保留** —— 只是释放了
       * agent 进程里的副本，下次打开会重新 session/load。
       */
      forgetLoadedSession: (sessionId) =>
        set((s) => {
          const progress = { ...s.replayProgress }
          delete progress[sessionId]
          const suppress = { ...s.suppressActivityUntil }
          delete suppress[sessionId]
          const cap = { ...s.replayCapUntil }
          delete cap[sessionId]
          const merged = mergePendingUserMessages(s.sessions, s.pendingUserMessages, sessionId)
          return {
            sessions: merged.sessions,
            pendingUserMessages: merged.pendingUserMessages,
            loadedSessions: s.loadedSessions.filter((id) => id !== sessionId),
            reloadingSessions: s.reloadingSessions.filter((id) => id !== sessionId),
            replayProgress: progress,
            suppressActivityUntil: suppress,
            replayCapUntil: cap
          }
        }),

      refreshActivity: async (sessionIds) => {
        const state = get()
        const wanted = sessionIds
          ? state.sessions.filter((x) => sessionIds.includes(x.id))
          : state.sessions
        const items = wanted
          .filter((x) => !x.isDraft)
          .map((x) => ({ sessionId: x.id, cwd: x.cwd }))
        if (items.length === 0) return
        let map: Record<string, number>
        try {
          map = await window.grok.sessionActivity(items)
        } catch {
          return // 主进程不可用时静默忽略：updatedAt 仍是可用兜底
        }
        if (!map || Object.keys(map).length === 0) return
        set((s) => ({
          sessions: s.sessions.map((x) =>
            map[x.id] ? { ...x, activityAt: map[x.id] } : x
          )
        }))
      },

      pushUserMessage: (sessionId, text, images) =>
        set((s) => {
          const item = {
            kind: 'user' as const,
            id: uid(),
            text,
            images,
            at: Date.now(),
            local: true
          }
          // 重放尚未结束：消息只进 pending，ChatView 钉在底部。写进 items 会被
          // 后续 user_message_chunk 拼进历史，或夹在还没放完的回放中间。
          if (s.reloadingSessions.includes(sessionId)) {
            return {
              pendingUserMessages: {
                ...s.pendingUserMessages,
                [sessionId]: [...(s.pendingUserMessages[sessionId] ?? []), item]
              }
            }
          }
          const now = Date.now()
          return {
            sessions: s.sessions.map((x) =>
              x.id === sessionId
                ? {
                    ...x,
                    items: [...finalize(x.items), item],
                    updatedAt: now,
                    // 与 applyOne 同理：用户开口即算活动，不能让旧 activityAt 压住
                    activityAt: now
                  }
                : x
            )
          }
        }),

      applyStream: ({ sessionId, update }) => set((s) => applyOne(s, [{ sessionId, update }])),

      /**
       * 批量应用：一批 update 只做**一次** set()。
       *
       * 为什么必须有这个方法（性能实测，非推测）：
       * zustand 的 persist 中挂在每次 set() 之后都会跑 `partialize` + `JSON.stringify`，
       * 把**整个 store**（所有会话 × 各自最近 120 个 item）序列化写localStorage。
       * 单条 set() 的实测体积是 547KB、单次约 6.6ms。
       *大会话重放有 732 条 update —— 逐条 applyStream 就是 **732 次全量序列化**，
       * 合计约 4.8s 的纯JSON.stringify 阻塞，且每次 set() 还会触发一次
       * React 重渲染（几百个 ChatItem 重建）。这两项叠加，输入框必然卡死。
       *
       * 批量化后：19 批 × 1 次序列化，合计约 19ms（**降约 250倍**）。
       */
      applyStreamBatch: (events) => set((s) => applyOne(s, events)),

      appendNotice: (sessionId, text, level = 'info') =>
        set((s) => ({
          sessions: s.sessions.map((x) =>
            x.id === sessionId
              ? {
                  ...x,
                  items: [
                    ...finalize(x.items),
                    { kind: 'notice', id: uid(), text, level, at: Date.now() } as ChatItem
                  ],
                  updatedAt: Date.now()
                }
              : x
          )
        })),

      setRunning: (sessionId, running) =>
        set((s) => {
          const nextRunning = running
            ? s.running.includes(sessionId)
              ? s.running
              : [...s.running, sessionId]
            : s.running.filter((x) => x !== sessionId)

          let unreadSessionIds = s.unreadSessionIds
          if (running) {
            // 又开始跑了：清掉旧的「做完未读」，等本轮结束再标
            unreadSessionIds = unreadSessionIds.filter((x) => x !== sessionId)
          } else if (s.activeId !== sessionId && !unreadSessionIds.includes(sessionId)) {
            // 跑完时用户不在看这个会话 → 蓝点未读
            unreadSessionIds = [...unreadSessionIds, sessionId]
          }

          return { running: nextRunning, unreadSessionIds }
        }),

      markSessionUnread: (sessionId) =>
        set((s) =>
          s.unreadSessionIds.includes(sessionId)
            ? s
            : { unreadSessionIds: [...s.unreadSessionIds, sessionId] }
        ),

      clearSessionUnread: (sessionId) =>
        set((s) => ({
          unreadSessionIds: s.unreadSessionIds.filter((x) => x !== sessionId)
        })),

      finalizeSession: (sessionId) =>
        set((s) => ({
          sessions: s.sessions.map((x) =>
            x.id === sessionId ? { ...x, items: finalize(x.items) } : x
          )
        })),

      truncateFrom: (sessionId, itemId) =>
        set((s) => ({
          sessions: s.sessions.map((x) => {
            if (x.id !== sessionId) return x
            const idx = x.items.findIndex((it) => it.id === itemId)
            if (idx === -1) return x
            return { ...x, items: finalize(x.items.slice(0, idx)), updatedAt: Date.now() }
          })
        })),

      markStuckTools: (sessionId, reason = STUCK_REASON_TURN, onlyToolCallIds) => {
        // 先读一次判空：没有卡住的卡就**完全不 set()**（persist 每次 set 都要全量序列化）
        const session = get().sessions.find((x) => x.id === sessionId)
        if (!session) return 0
        const stuck = session.items.filter(
          (it) =>
            it.kind === 'tool' &&
            (it.status === 'in_progress' || it.status === 'pending') &&
            (!onlyToolCallIds || onlyToolCallIds.includes(it.toolCallId))
        ).length
        if (stuck === 0) return 0
        set((s) => ({
          // ⚠️ 刻意不刷 `updatedAt`：这是**界面纠偏**而不是新内容，
          // 刷了会让该会话在侧栏凭空跳到最前（排序/活动时间都按它派生）。
          sessions: s.sessions.map((x) =>
            x.id === sessionId ? { ...x, items: markStuckToolsIn(x.items, reason, onlyToolCallIds) } : x
          )
        }))
        return stuck
      },

      pushLog: (line) => set((s) => ({ logs: [...s.logs, line].slice(-500) })),
      clearLogs: () => set({ logs: [] }),

      setPermission: (request) =>
        set((s) => ({
          permissions: [
            ...s.permissions.filter((p) => p.requestId !== request.requestId),
            request
          ]
        })),
      clearPermission: (requestId) =>
        set((s) => ({
          permissions: s.permissions.filter((p) => p.requestId !== requestId),
          toasts: s.toasts.filter((t) => t.requestId !== requestId)
        })),

      setQuestion: (event) =>
        set((s) => ({
          questions: [...s.questions.filter((q) => q.requestId !== event.requestId), event]
        })),
      clearQuestion: (requestId) =>
        set((s) => ({
          questions: s.questions.filter((q) => q.requestId !== requestId),
          toasts: s.toasts.filter((t) => t.requestId !== requestId)
        })),

      clearAllPrompts: () =>
        set((s) => ({
          permissions: [],
          questions: [],
          // 只清掉与请求绑定的提示；连接类提示（无 requestId）保留
          toasts: s.toasts.filter((t) => t.requestId === undefined)
        })),

      pushToast: (toast) => {
        const id = toast.id ?? `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        set((s) => ({
          toasts: [...s.toasts.filter((t) => t.id !== id), { ...toast, id, createdAt: Date.now() }]
        }))
        return id
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

      beginLongShotPick: (sessionId) => set({ longShotPickSessionId: sessionId }),
      cancelLongShotPick: () => set({ longShotPickSessionId: null }),

      activeSession: () => {
        const { sessions, activeId } = get()
        return sessions.find((x) => x.id === activeId)
      }
    }),
    {
      name: 'grok-build-desktop',
      storage: throttledPersistStorage,
      // 兼容旧版本：原先只有布尔开关 autoApprove，按 true/false 映射为两档模式
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState> & { autoApprove?: boolean }
        const legacy: PermissionMode | undefined =
          typeof p.autoApprove === 'boolean'
            ? p.autoApprove
              ? 'bypassPermissions'
              : 'default'
            : undefined
        const { autoApprove: _legacy, ...rest } = p
        // 旧持久化可能残留空草稿；启动时一律丢掉（草稿本就不该落盘）
        const rawSessions = (rest.sessions ?? current.sessions) as SessionMeta[]
        const sessions = rawSessions.filter((x) => !x.isDraft)
        // 冷启动不恢复上次聚焦的会话：进空白草稿（App.bootstrapBlankSession）。
        // cwd 先校正为最近活动目录，避免首帧仍用过期的全局默认。
        const cwd =
          mostRecentWorkspaceCwd(sessions) ||
          (typeof rest.cwd === 'string' && rest.cwd ? normalizeDir(rest.cwd) : '') ||
          current.cwd
        const catalog =
          (rest.configOptionCatalog && rest.configOptionCatalog.length > 0
            ? rest.configOptionCatalog
            : catalogFromSessions(sessions)) ?? []
        return {
          ...current,
          ...rest,
          sessions,
          activeId: null,
          cwd,
          configOptionCatalog: catalog,
          preferredModel: rest.preferredModel ?? current.preferredModel,
          preferredEffort: rest.preferredEffort ?? current.preferredEffort,
          permissionMode: p.permissionMode ?? legacy ?? current.permissionMode,
          // 旧版本持久化数据里没有这个键；显式兜底防止 rest 里的 undefined 覆盖默认值
          expandedToolCalls: p.expandedToolCalls ?? current.expandedToolCalls,
          collapsedToolCalls: p.collapsedToolCalls ?? current.collapsedToolCalls,
          // 密度以 config.toml 为准，不从持久化里恢复（旧值可能已过时）
          toolCallDensity: current.toolCallDensity
        }
      },
      /**
       * ⚠️ 持久化只留「当前会话」的 items，其余会话只留元数据（标题/时间/工作目录）。
       * 草稿不落盘：未发过消息的「新任务」对齐 Cursor，关应用即视为撤销。
       *
       * 为什么可以不留：别的会话的 items 在界面里**从来不会显示** ——
       * 侧栏只渲染元数据，悬浮预览也只读 cwd/时间/标题；
       * 而一旦点开某个会话，`resumeSession` 会先 `beginSessionReload`（清空 items）
       * 再 `session/load` 全量重放，所以持久化里那 120 条**在切过去的瞬间就被清掉了**，
       * 留着纯属白占体积、白拖慢每一次序列化与落盘。
       *
       * 实测收益（真实数据 5 会话 / 497 条 item / 3.61MB）：负载降到约 1/4，
       * 每一次持久化的 JSON.stringify + localStorage.setItem 同步开销随之等比下降。
       */
      partialize: (s) => {
        const sessions = s.sessions
          .filter((x) => !x.isDraft)
          .map((x) => ({
            ...x,
            // 落盘时剥掉 streaming：否则异常收尾的会话重启后末尾永久闪生成光标
            items:
              x.id === s.activeId
                ? x.items.slice(-120).map((it) =>
                    it.kind === 'assistant' || it.kind === 'thinking'
                      ? { ...it, streaming: false }
                      : it
                  )
                : []
          }))
        const activeId =
          s.activeId && sessions.some((x) => x.id === s.activeId)
            ? s.activeId
            : (sessions[0]?.id ?? null)
        return {
          sessions,
          activeId,
          cwd: s.cwd,
          permissionMode: s.permissionMode,
          workspaces: s.workspaces,
          collapsedGroups: s.collapsedGroups,
          expandedToolCalls: s.expandedToolCalls,
          collapsedToolCalls: s.collapsedToolCalls,
          configOptionCatalog: s.configOptionCatalog,
          preferredModel: s.preferredModel,
          preferredEffort: s.preferredEffort
        }
      }
    }
  )
)
