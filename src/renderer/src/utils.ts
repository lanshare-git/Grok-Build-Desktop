/** 渲染层小工具 */

import type { SessionMeta, WorkspaceMeta } from '@shared/types'
import { t as tShared, type Locale } from '@shared/i18n'

/** 目录规范化：统一分隔符、去掉结尾分隔符（盘符根保留 `C:\`） */
export function normalizeDir(p: string): string {
  const unified = (p ?? '').trim().replace(/[\\/]+/g, '\\')
  const trimmed = unified.replace(/\\+$/, '')
  return /^[a-zA-Z]:$/.test(trimmed) ? `${trimmed}\\` : trimmed
}

export function basename(p: string): string {
  if (!p) return ''
  const parts = p.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || p
}

/** 是否同一处目录（Windows 下大小写、斜杠写法、结尾分隔符都不敏感） */
export function sameDir(a: string, b: string): boolean {
  return !!a && !!b && normalizeDir(a).toLowerCase() === normalizeDir(b).toLowerCase()
}

/**
 * 纯聊天会话是否还处于「只读锁定」态。
 *
 * 锁定它的理由只有一条：**以主目录为根、不绑定任何项目**，所以强制只读（计划模式）防止误写文件。
 * 一旦用户把会话搬到某个项目目录（`actions.moveSessionToWorkspace`），这个理由就不成立了 ——
 * 会话已经绑定项目，就该和普通任务一样能自己选权限模式。
 * 因此判据是「kind 为 chat **且** cwd 仍在主目录下」，不能只看 kind。
 */
export function isLockedChat(
  session: { kind?: string; cwd: string },
  homeDir: string
): boolean {
  return session.kind === 'chat' && !!homeDir && sameDir(session.cwd, homeDir)
}

/** 会话展示标题：用户手动改的名字优先，否则用 grok 自动生成的标题 */
export function sessionDisplayTitle(session: SessionMeta, locale: Locale): string {
  const custom = session.customTitle?.trim()
  return custom || session.title || tShared(locale, 'common.untitledSession')
}

/**
 * 会话的「最后活动时间」——排序与相对时间显示都用它。
 *
 * 优先用 `activityAt`（主进程从磁盘 events.jsonl 读到的**真实回合时间**）。
 * 只有在没有磁盘真值时才回落到 `updatedAt`：后者是客户端边收边记的，
 * grok 在 session/load 与启动时会全量重放历史，重放通知会把 updatedAt 刷成
 * 「现在」，于是「只是点开看一眼」甚至「启动时自动加载」都会显示「刚刚」。
 * 磁盘真值不受重放影响，是这个顽疾的根治办法。
 */
export function sessionActivityAt(session: SessionMeta): number {
  return session.activityAt ?? session.updatedAt
}

/** 侧栏的一个工作目录分组 */
export interface WorkspaceGroup {
  /** 规范小写后的路径，用作 React key 与折叠状态 */
  key: string
  /** 规范化后的路径 */
  path: string
  /** 展示名：别名优先，否则目录名 */
  label: string
  /** label 是否来自用户别名 */
  aliased: boolean
  /** 是否为用户手动登记的目录 */
  manual: boolean
  /**
   * 是否是「聊天」固定组（用户主目录）。
   * 纯聊天会话永远以主目录为根，会全部落在这里 —— 它不是用户登记的项目，
   * 所以侧栏里固定置顶、恒展开、不可改名/移除。
   */
  isHome: boolean
  sessions: SessionMeta[]
  /** 组内最近活动时间，用于排序 */
  latest: number
}

/**
 * 按工作目录把会话分组。
 * 数据来源是「会话自身的 cwd」∪「用户手动登记/改过别名的目录」——
 * 会话的 cwd 由 grok 决定（创建后不可改），这里只做展示层归并。
 */
export function groupSessionsByWorkspace(
  sessions: SessionMeta[],
  workspaces: WorkspaceMeta[],
  homeDir?: string | null,
  locale: Locale = 'zh-CN'
): WorkspaceGroup[] {
  const groups = new Map<string, WorkspaceGroup>()

  const ensure = (path: string): WorkspaceGroup => {
    const normalized = normalizeDir(path)
    const key = normalized.toLowerCase()
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        path: normalized,
        label: basename(normalized) || normalized,
        aliased: false,
        manual: false,
        isHome: Boolean(homeDir) && normalizeDir(homeDir as string).toLowerCase() === key,
        sessions: [],
        latest: 0
      }
      groups.set(key, group)
    }
    return group
  }

  for (const workspace of workspaces) {
    const group = ensure(workspace.path)
    group.manual = true
    if (workspace.alias) {
      group.label = workspace.alias
      group.aliased = true
    }
  }

  for (const session of sessions) ensure(session.cwd).sessions.push(session)

  // 聊天组固定叫「聊天」（用户没手动改过别名时），它代表"非项目"的闲聊归属
  for (const group of groups.values()) {
    if (group.isHome && !group.aliased) group.label = tShared(locale, 'common.chatGroup')
  }

  const list = [...groups.values()]
  for (const group of list) {
    // 组内：最近活动在前（用 sessionActivityAt，磁盘真值优先）。
    // 时间相同（同一秒新建的多个会话）时用创建时间、id 兜底，
    // 保证顺序完全由数据决定 —— 否则 Array.sort 之外再无约束，渲染一次就可能换位。
    group.sessions.sort(
      (a, b) =>
        sessionActivityAt(b) - sessionActivityAt(a) ||
        b.createdAt - a.createdAt ||
        (a.id < b.id ? -1 : 1)
    )
    group.latest = group.sessions[0] ? sessionActivityAt(group.sessions[0]) : 0
  }
  // 聊天组（主目录）永远置顶；其余有会话的目录按最近活动倒序，空目录（手动登记）沉底。
  // 活动时间相同时按路径兜底：分组来自 Map，插入次序会变，
  // 没有兜底键的话「同为最新」的两个目录就会随渲染抖动。
  return list.sort(
    (a, b) =>
      (b.isHome ? 1 : 0) - (a.isHome ? 1 : 0) ||
      b.latest - a.latest ||
      a.key.localeCompare(b.key)
  )
}

export function relativeTime(ts: number, locale: Locale): string {
  const diff = Date.now() - ts
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return tShared(locale, 'common.time.justNow')
  // Intl.RelativeTimeFormat 自带各语言的单位与语序（numeric:'auto' 给「昨天/yesterday」这类自然词）
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const min = Math.floor(sec / 60)
  if (min < 60) return rtf.format(-min, 'minute')
  const hour = Math.floor(min / 60)
  if (hour < 24) return rtf.format(-hour, 'hour')
  const day = Math.floor(hour / 24)
  if (day < 30) return rtf.format(-day, 'day')
  return new Date(ts).toLocaleDateString(locale)
}

export function formatNumber(n?: number): string {
  if (n === undefined || n === null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

/** 把工具输入压成一行摘要，便于在卡片头部展示 */
export function summarizeInput(input: unknown): string {
  if (input === undefined || input === null) return ''
  if (typeof input === 'string') return input.slice(0, 160)
  if (typeof input !== 'object') return String(input)

  const obj = input as Record<string, unknown>
  // 前 7 个是历史顺序，优先级不可调整（改了会改变既有行为）；
  // grok 实际用的 key 大量落在后半段（如 target_directory），追加在尾部保证向后兼容。
  // 缺了它们就会走 JSON.stringify 兜底，在卡片头部挤出一长串 JSON。
  const preferred = [
    // —— 原有，顺序保持不变 ——
    'command',
    'path',
    'file_path',
    'pattern',
    'query',
    'url',
    'cmd',
    // —— 新增：grok 实测参数 key ——
    'target_directory',
    'targetDirectory',
    'target_file',
    'targetFile',
    'directory',
    'dir',
    'folder',
    'cwd',
    'path_glob',
    'glob',
    'name',
    'filename',
    'file',
    'files'
  ]
  for (const key of preferred) {
    const value = obj[key]
    // 用 trim() 过滤纯空白串：否则会渲染出一个看不见但仍占 gap 的幽灵元素
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 160)
  }
  try {
    return JSON.stringify(input).slice(0, 160)
  } catch {
    return ''
  }
}

export function stringifyPretty(value: unknown, limit = 6000): string {
  if (value === undefined || value === null) return ''
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  if (!text) return ''
  return text.length > limit ? `${text.slice(0, limit)}\n…（已截断）` : text
}

/**
 * 从 tool_call / tool_call_update 里提取可展示的输出。
 *
 * ⚠️ ACP 的 ToolCallContent 有两种文本形态：
 *  - `rawOutput`（grok 多数工具的结果走这里）；
 *  - `content: [{ type:'content', content:{ type:'text', text } }]` —— **双层嵌套**。
 *    失败原因就走这条路：实测 exit_plan_mode 失败时 grok 只发
 *    `content:[{type:'content',content:{type:'text',text:'Plan approval could not…'}}]`，
 *    之前只读 rawOutput 会把它整个丢掉，失败卡片只剩「失败」两个字，看不到原因。
 * 只取文本块（diff/terminal 不在此展示）；无文本时返回 undefined，调用方保留旧值。
 */
export function toolCallOutput(update: { rawOutput?: unknown; content?: unknown }): unknown {
  if (update.rawOutput !== undefined) return update.rawOutput
  const contents = update.content
  if (!Array.isArray(contents)) return undefined
  const parts: string[] = []
  for (const raw of contents) {
    if (!raw || typeof raw !== 'object') continue
    const wrapper = raw as { type?: string; content?: { type?: string; text?: string } }
    const block = wrapper.type === 'content' ? wrapper.content : (raw as { type?: string; text?: string })
    if (block && block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
      parts.push(block.text)
    }
  }
  return parts.length > 0 ? parts.join('\n') : undefined
}

export function toolIconName(kind?: string, toolName?: string): 'terminal' | 'file' | 'search' | 'list' {
  const k = (kind ?? '').toLowerCase()
  const n = (toolName ?? '').toLowerCase()
  if (k.includes('terminal') || k.includes('execute') || n.includes('terminal') || n.includes('shell'))
    return 'terminal'
  if (k.includes('search') || k.includes('grep') || n.includes('search') || n.includes('grep'))
    return 'search'
  if (k.includes('list') || n.includes('list_dir')) return 'list'
  return 'file'
}
