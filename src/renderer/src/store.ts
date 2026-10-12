import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type {
  AcpStreamEvent,
  ChatItem,
  ConfigOption,
  ConnectionState,
  DiagnosticsReport,
  ImageAttachment,
  PermissionRequestEvent,
  PlanEntry,
  SessionMeta,
  SessionUpdateEnvelope,
  ToolCallLocation,
  TurnUsage
} from '@shared/types'

const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

const MAX_SESSIONS = 60
const MAX_ITEMS_PER_SESSION = 400

/* ------------------------------------------------------------------ *
 *  transcript 归约：把 ACP session/update 折叠成有序的 ChatItem 列表
 * ------------------------------------------------------------------ */

type TextKind = 'user' | 'assistant' | 'thinking'

function finalize(items: ChatItem[]): ChatItem[] {
  return items.map((it) =>
    it.kind === 'assistant' || it.kind === 'thinking' ? { ...it, streaming: false } : it
  )
}

function appendText(items: ChatItem[], kind: TextKind, text?: string): ChatItem[] {
  if (!text) return items
  const last = items[items.length - 1]

  if (last && last.kind === kind) {
    // 用字面量比较才能让 TS 收窄到具体变体
    if (last.kind === 'user') {
      return [...items.slice(0, -1), { ...last, text: last.text + text }]
    }
    if (last.streaming) {
      return [...items.slice(0, -1), { ...last, text: last.text + text }]
    }
  }

  const sealed = finalize(items)
  if (kind === 'user') {
    return [...sealed, { kind: 'user', id: uid(), text, at: Date.now() }]
  }
  return [
    ...sealed,
    { kind, id: uid(), text, streaming: true, at: Date.now() } as ChatItem
  ]
}

function upsertTool(items: ChatItem[], update: SessionUpdateEnvelope): ChatItem[] {
  const toolCallId = String(update.toolCallId ?? '')
  if (!toolCallId) return items

  const index = items.findIndex((it) => it.kind === 'tool' && it.toolCallId === toolCallId)
  const sealed = index === -1 ? finalize(items) : items

  if (index !== -1) {
    const current = sealed[index]
    if (current.kind !== 'tool') return items
    const merged: ChatItem = {
      ...current,
      title: update.title ?? current.title,
      toolKind: update.kind ?? current.toolKind,
      toolName: update.toolName ?? current.toolName,
      status: update.status ?? current.status,
      input: update.rawInput !== undefined ? update.rawInput : current.input,
      output: update.rawOutput !== undefined ? update.rawOutput : current.output,
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
      output: update.rawOutput,
      locations: update.locations as any,
      at: Date.now()
    }
  ]
}

function upsertPlan(items: ChatItem[], entries: PlanEntry[]): ChatItem[] {
  const index = items.findIndex((it) => it.kind === 'plan')
  if (index !== -1) {
    const current = items[index]
    if (current.kind !== 'plan') return items
    const merged = { ...current, entries, at: Date.now() }
    return [...items.slice(0, index), merged, ...items.slice(index + 1)]
  }
  return [...finalize(items), { kind: 'plan', id: uid(), entries, at: Date.now() }]
}

function reduceUpdate(items: ChatItem[], update: SessionUpdateEnvelope): ChatItem[] {
  switch (update.sessionUpdate) {
    case 'user_message_chunk':
      return appendText(items, 'user', update.content?.text)
    case 'agent_message_chunk':
      return appendText(items, 'assistant', update.content?.text)
    case 'agent_thought_chunk':
      return appendText(items, 'thinking', update.content?.text)
    case 'tool_call':
    case 'tool_call_update':
      return upsertTool(items, update)
    case 'plan':
      return upsertPlan(items, update.entries ?? [])
    default:
      return items
  }
}

/* ------------------------------------------------------------------ *
 *  Store
 * ------------------------------------------------------------------ */

interface PermissionState {
  request: PermissionRequestEvent
}

interface AppState {
  connection: { state: ConnectionState; message?: string }
  sessions: SessionMeta[]
  activeId: string | null
  cwd: string
  autoApprove: boolean
  running: string[]
  permission: PermissionState | null
  logs: string[]
  diagnostics: DiagnosticsReport | null
  showDiagnostics: boolean
  /** 已在当前 agent 进程中创建/加载过的会话（不持久化，agent 重启后失效） */
  loadedSessions: string[]

  setConnection(state: ConnectionState, message?: string): void
  setCwd(cwd: string): void
  setAutoApprove(v: boolean): void
  setDiagnostics(report: DiagnosticsReport | null): void
  toggleDiagnostics(v?: boolean): void

  createSession(meta: { id: string; cwd: string; configOptions?: ConfigOption[] }): void
  selectSession(id: string | null): void
  deleteSession(id: string): void
  renameSession(id: string, title: string): void

  /** 发送前调用：未知会话先清空本地历史，由 session/load 重放重建 */
  beginSessionReload(sessionId: string): void
  markSessionLoaded(sessionId: string): void
  clearLoadedSessions(): void
  /** 追加一条用户消息（支持图片附件） */
  pushUserMessage(sessionId: string, text: string, images?: ImageAttachment[]): void

  applyStream(event: AcpStreamEvent): void
  appendNotice(sessionId: string, text: string, level?: 'info' | 'warn' | 'error'): void
  setRunning(sessionId: string, running: boolean): void
  finalizeSession(sessionId: string): void
  /** 编辑重发：删除指定 item 及其之后的所有内容（UI 层从头开始对话） */
  truncateFrom(sessionId: string, itemId: string): void

  pushLog(line: string): void
  clearLogs(): void

  setPermission(request: PermissionRequestEvent): void
  clearPermission(): void

  activeSession(): SessionMeta | undefined
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      connection: { state: 'idle' },
      sessions: [],
      activeId: null,
      cwd: '',
      autoApprove: true,
      running: [],
      permission: null,
      logs: [],
      diagnostics: null,
      showDiagnostics: false,
      loadedSessions: [],

      setConnection: (state, message) => set({ connection: { state, message } }),
      setCwd: (cwd) => set({ cwd }),
      setAutoApprove: (autoApprove) => set({ autoApprove }),
      setDiagnostics: (diagnostics) => set({ diagnostics }),
      toggleDiagnostics: (v) =>
        set((s) => ({ showDiagnostics: v === undefined ? !s.showDiagnostics : v })),

      createSession: ({ id, cwd, configOptions }) =>
        set((s) => {
          if (s.sessions.some((x) => x.id === id)) {
            return { activeId: id, loadedSessions: s.loadedSessions.includes(id) ? s.loadedSessions : [...s.loadedSessions, id] }
          }
          const session: SessionMeta = {
            id,
            title: '新会话',
            cwd,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            items: [],
            configOptions: configOptions ?? [],
            commands: []
          }
          return {
            sessions: [session, ...s.sessions].slice(0, MAX_SESSIONS),
            activeId: id,
            loadedSessions: [...s.loadedSessions, id]
          }
        }),

      selectSession: (activeId) => set({ activeId }),

      deleteSession: (id) =>
        set((s) => {
          const sessions = s.sessions.filter((x) => x.id !== id)
          return {
            sessions,
            activeId: s.activeId === id ? (sessions[0]?.id ?? null) : s.activeId
          }
        }),

      renameSession: (id, title) =>
        set((s) => ({
          sessions: s.sessions.map((x) => (x.id === id ? { ...x, title, updatedAt: Date.now() } : x))
        })),

      beginSessionReload: (sessionId) =>
        set((s) => ({
          // agent 将通过 session/load 重放完整历史，先清掉本地旧记录避免重复
          sessions: s.sessions.map((x) => (x.id === sessionId ? { ...x, items: [] } : x))
        })),

      markSessionLoaded: (sessionId) =>
        set((s) => ({
          loadedSessions: s.loadedSessions.includes(sessionId)
            ? s.loadedSessions
            : [...s.loadedSessions, sessionId]
        })),

      clearLoadedSessions: () => set({ loadedSessions: [] }),

      pushUserMessage: (sessionId, text, images) =>
        set((s) => ({
          sessions: s.sessions.map((x) =>
            x.id === sessionId
              ? {
                  ...x,
                  items: [
                    ...finalize(x.items),
                    { kind: 'user', id: uid(), text, images, at: Date.now() } as ChatItem
                  ],
                  updatedAt: Date.now()
                }
              : x
          )
        })),

      applyStream: ({ sessionId, update }) =>
        set((s) => {
          const index = s.sessions.findIndex((x) => x.id === sessionId)
          if (index === -1) return {}

          const session = s.sessions[index]
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

          const updated: SessionMeta = {
            ...session,
            items: trimmed,
            title,
            commands,
            configOptions,
            usage,
            updatedAt: Date.now()
          }

          const sessions = [...s.sessions]
          sessions[index] = updated
          return { sessions }
        }),

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
        set((s) => ({
          running: running
            ? s.running.includes(sessionId)
              ? s.running
              : [...s.running, sessionId]
            : s.running.filter((x) => x !== sessionId)
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

      pushLog: (line) => set((s) => ({ logs: [...s.logs, line].slice(-500) })),
      clearLogs: () => set({ logs: [] }),

      setPermission: (request) => set({ permission: { request } }),
      clearPermission: () => set({ permission: null }),

      activeSession: () => {
        const { sessions, activeId } = get()
        return sessions.find((x) => x.id === activeId)
      }
    }),
    {
      name: 'grok-build-desktop',
      partialize: (s) => ({
        sessions: s.sessions.map((x) => ({
          ...x,
          items: x.items.slice(-120)
        })),
        activeId: s.activeId,
        cwd: s.cwd,
        autoApprove: s.autoApprove
      })
    }
  )
)
