/**
 * 会话全文搜索 —— 对齐终端的 `grok sessions search`（只搜摘要与首条 prompt），
 * 这里做得更宽：标题 + 整段对话正文都参与匹配。
 *
 * 为什么自己扫盘而不是调 CLI：
 * - `grok sessions search` **没有 --json**，只能拿到给人看的表格文本，解析脆弱；
 * - 它的索引在 `session_search.sqlite`（grok 自有格式，schema 会变），主进程引 SQLite 依赖不划算；
 * - 我们要的召回面（整段历史）本来就比它大。
 *
 * 数据源固定为 `~/.grok/sessions/<编码cwd>/<sessionId>/chat_history.jsonl`，
 * 只读、逐行流式扫描，不会把大文件整个读进内存。
 */

import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

import { encodeSessionDirVariants } from './session-activity'
import { resolveGrokHome } from './acp/service'

export interface SessionSearchCandidate {
  sessionId: string
  cwd: string
  /** 渲染层已有的显示名（grok 自动标题或用户改名），先做一次快速匹配 */
  title: string
}

export interface SessionSearchHit {
  sessionId: string
  cwd: string
  /** 命中位置：标题 or 正文 */
  where: 'title' | 'content'
  /** 正文命中时返回带上下文的片段（已裁剪） */
  snippet: string
}

export interface SessionSearchOptions {
  /** 最多扫描多少个会话（按传入顺序，即侧栏已排序好的顺序） */
  maxScan?: number
  /** 最多返回多少条命中 */
  maxHits?: number
  /** 同时打开的文件数 */
  concurrency?: number
  /** 单个会话文件超过该大小则跳过（MB），避免个别超大历史拖慢输入响应 */
  maxFileMb?: number
}

const SNIPPET_PAD = 48

/**
 * 去掉注入到用户消息里的系统噪声，否则搜索会命中技能清单这类与用户无关的文本。
 * 只做保守裁剪，不解析嵌套结构。
 */
function stripNoise(text: string): string {
  return text
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, ' ')
    .replace(/<system-memories>[\s\S]*?<\/system-memories>/g, ' ')
    .replace(/<user_query>|<\/user_query>/g, ' ')
    .replace(/<skills>[\s\S]*?<\/skills>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface HistoryLine {
  type: string
  text: string
}

/** 解析一行 chat_history.jsonl；不是消息行或结构不符时返回 null */
function parseHistoryLine(line: string): HistoryLine | null {
  if (!line || line.charCodeAt(0) !== 123 /* '{' */) return null
  let obj: {
    type?: string
    content?: unknown
  }
  try {
    obj = JSON.parse(line) as { type?: string; content?: unknown }
  } catch {
    return null
  }
  if (!obj?.type || obj.type === 'system' || obj.type === 'tool') return null
  const content = obj.content
  if (typeof content === 'string') return { type: obj.type, text: content }
  if (!Array.isArray(content)) return null
  const parts: string[] = []
  for (const block of content) {
    const b = block as { type?: string; text?: string }
    if (b?.type === 'text' && typeof b.text === 'string') parts.push(b.text)
  }
  const text = stripNoise(parts.join('\n'))
  return text ? { type: obj.type, text } : null
}

function snippetAround(text: string, needle: string): string {
  const idx = text.toLowerCase().indexOf(needle)
  if (idx < 0) return ''
  const start = Math.max(0, idx - SNIPPET_PAD)
  const end = Math.min(text.length, idx + needle.length + SNIPPET_PAD)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}

/** 在单个会话的对话历史里找第一处命中；dir 不存在或文件缺失返回 null */
async function searchOne(
  dir: string,
  needleLower: string,
  maxBytes: number
): Promise<string | null> {
  const file = join(dir, 'chat_history.jsonl')
  try {
    const st = await stat(file)
    if (st.size > maxBytes) return null
  } catch {
    return null
  }

  let stream: ReturnType<typeof createReadStream> | null = null
  try {
    stream = createReadStream(file, { encoding: 'utf8' })
    const rl = createInterface({ input: stream, crlfDelay: Infinity })
    for await (const raw of rl) {
      const parsed = parseHistoryLine(raw)
      if (!parsed) continue
      if (parsed.text.toLowerCase().includes(needleLower)) {
        rl.close()
        return snippetAround(parsed.text, needleLower)
      }
    }
  } catch {
    return null
  } finally {
    stream?.destroy()
  }
  return null
}

/**
 * 把候选会话映射到磁盘目录候选列表。
 * 编码规则（encodeURIComponent 逐字符 + 转义 !'()*）有多个历史变体，
 * grok 实际用的是其中一种 —— 详见 session-activity.ts，这里按顺序逐个试探。
 */
function candidateDirs(cwd: string, sessionId: string): string[] {
  const root = join(resolveGrokHome(), 'sessions')
  return encodeSessionDirVariants(cwd)
    .filter(Boolean)
    .map((variant) => join(root, variant, sessionId))
}

/**
 * 搜索会话。返回按传入顺序排列的命中列表。
 * query 为空时返回空数组（调用方应直接走全量展示，不做扫描）。
 */
export async function searchSessions(
  query: string,
  candidates: SessionSearchCandidate[],
  opts: SessionSearchOptions = {}
): Promise<SessionSearchHit[]> {
  const needle = query.trim()
  if (!needle) return []
  const maxScan = opts.maxScan ?? 200
  const maxHits = opts.maxHits ?? 50
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 8, 16))
  const maxBytes = (opts.maxFileMb ?? 12) * 1024 * 1024
  const needleLower = needle.toLowerCase()

  const list = candidates.slice(0, maxScan)
  const hits: SessionSearchHit[] = []
  let cursor = 0

  const worker = async (): Promise<void> => {
    while (cursor < list.length && hits.length < maxHits) {
      const item = list[cursor++]
      if (item.title && item.title.toLowerCase().includes(needleLower)) {
        hits.push({ sessionId: item.sessionId, cwd: item.cwd, where: 'title', snippet: item.title })
        continue
      }
      const dirs = candidateDirs(item.cwd, item.sessionId)
      if (dirs.length === 0) continue
      for (const dir of dirs) {
        const snippet = await searchOne(dir, needleLower, maxBytes)
        if (snippet !== null) {
          hits.push({ sessionId: item.sessionId, cwd: item.cwd, where: 'content', snippet })
          break
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, () => worker()))
  return hits
}

/**
 * 读取会话的对话正文（已去掉注入噪声），供「导出 Markdown」在 grok export 不可用时兜底。
 * 返回按时间顺序排列的消息，role 已归一为 user / assistant。
 */
export async function readSessionMessages(
  cwd: string,
  sessionId: string
): Promise<Array<{ role: 'user' | 'assistant'; text: string }>> {
  const out: Array<{ role: 'user' | 'assistant'; text: string }> = []
  for (const dir of candidateDirs(cwd, sessionId)) {
    let found = false
    try {
      const stream = createReadStream(join(dir, 'chat_history.jsonl'), { encoding: 'utf8' })
      const rl = createInterface({ input: stream, crlfDelay: Infinity })
      for await (const raw of rl) {
        const parsed = parseHistoryLine(raw)
        if (!parsed) continue
        if (parsed.type !== 'user' && parsed.type !== 'assistant') continue
        out.push({ role: parsed.type, text: parsed.text })
        found = true
      }
      stream.destroy()
    } catch {
      /* 该变体不存在或读失败，试下一个 */
    }
    if (found || out.length > 0) break
  }
  return out
}

/** 供自检/探针使用：列出磁盘上 grok 认得的会话目录数量 */
export async function countSessionDirs(): Promise<number> {
  try {
    const root = join(resolveGrokHome(), 'sessions')
    const encDirs = await readdir(root, { withFileTypes: true })
    let n = 0
    for (const d of encDirs) {
      if (!d.isDirectory()) continue
      try {
        n += (await readdir(join(root, d.name), { withFileTypes: true })).filter((x) => x.isDirectory())
          .length
      } catch {
        /* 单个目录读不到就跳过 */
      }
    }
    return n
  } catch {
    return 0
  }
}