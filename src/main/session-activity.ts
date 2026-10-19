/**
 * 从磁盘读取会话的**真实活动时间**。
 *
 * 背景（2026-10-13 实证）：侧栏排序用 `updatedAt`，此前由渲染层自己在收到
 * `session/update` 时刷成 `Date.now()`。但 grok 在 `session/load` 与应用启动时
 * 会**全量重放历史**，重放通知被误判成「新活动」，于是「只是点开看一眼」甚至
 * 「启动时自动加载」都会把时间刷成「刚刚」。前几轮修法是加「静默窗口」，
 * 属于客户端猜测，永远有漏网的分片。
 *
 * 根治办法：不再猜，直接读 grok 自己写下的时间。落盘结构：
 *   ~/.grok/sessions/<encodeURIComponent(cwd)>/<sessionId>/events.jsonl
 * 每条事件形如 `{"ts":"2026-10-12T08:26:57.768Z","type":"turn_ended",...}`，
 * 取最后一条**回合类**事件的 `ts`。
 *
 * ⚠️ 绝对不要退化成用文件 mtime：重放/启动时 grok 会重写 chat_history.jsonl，
 *    mtime 会变成「现在」（实测重放后 mtime = 当前时刻），正是要修的那个 bug。
 *
 * ⚠️ 也不能取「文件末条任意事件」：`session/load` 会把 MCP 启停写进同一文件
 *   （`mcp_server_starting` / `mcp_init_completed` 等），末条 ts 就是「刚才点开的时间」
 *   （2026-10-19 实证：一串会话侧栏同时显示「36 分钟前」——只是批量点开看过）。
 *   只认 `turn_started` / `turn_ended`。
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { resolveGrokHome } from './acp/service'

/**
 * grok 的会话目录编码规则：**百分号编码，保留 unreserved 字符**。
 *
 * 实测（2026-10-13，磁盘真值）：
 *   D:\需求分析         → D%3A%5C%E9%9C%80%E6%B1%82%E5%88%86%E6%9E%90
 *   D:\项目\Grok Build  → D%3A%5C%E9%A1%B9%E7%9B%AE%5CGrok%20Build
 * 即 `\`→%5C、`:`→%3A、空格→%20、中文按 UTF-8 字节逐个转义 —— 与
 * `encodeURIComponent` 一致（差异仅在 `!'()*` 四个字符，见下）。
 *
 * ⚠️ 踩过的坑：一度以为「grok 的编码 ≠ encodeURIComponent」，实为验证脚本
 *    经 shell 传参时反斜杠被吞成斜杠导致的假象。**别再据此改编码规则。**
 */
export function encodeSessionDirVariants(cwd: string): string[] {
  return [
    ...new Set([
      encodeSessionDir(cwd),
      encodeURIComponent(cwd),
      // 分隔符方向不一致时的兜底：调用方给的 cwd 可能是 `D:/x`，
      // 而 grok 落盘用的是它自己解析出的 `D:\x`（或反之）——两个方向都试。
      encodeSessionDir(cwd.replace(/\\/g, '/')),
      encodeSessionDir(cwd.replace(/\//g, '\\'))
    ])
  ]
}

/**
 * grok 实际使用的编码：保留 `A-Za-z0-9-._~`，其余按 UTF-8 字节百分号转义。
 * 比 `encodeURIComponent` 更严格（后者会保留 `!'()*`），两者互为兜底。
 */
export function encodeSessionDir(cwd: string): string {
  return encodeURIComponent(cwd).replace(
    /[!'()*]/g,
    (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')
  )
}

/**
 * 读取文件末尾至多 256KB，从中取最后一条**回合类**事件的 ts —— 避免整文件读取。
 * 256KB：频繁点开会在末尾堆 mcp_*，64KB 偶发把更早的 turn_* 挤出窗口。
 */
const TAIL_BYTES = 256 * 1024

/** 只有这些才算「真有会话活动」；打开/重连写的 mcp_*、phase_changed 等一律忽略 */
const ACTIVITY_TYPES = new Set(['turn_ended', 'turn_started'])

const LINE_TS_RE = /"ts"\s*:\s*"([^"]+)"/
const LINE_TYPE_RE = /"type"\s*:\s*"([^"]+)"/

/**
 * 取 events.jsonl 尾部最后一条回合事件时间。
 * 返回 ms 时间戳；文件不存在、为空或没有回合事件时返回 0。
 */
async function readLastEventTs(eventsPath: string): Promise<number> {
  try {
    const size = statSync(eventsPath).size
    if (size === 0) return 0
    const start = Math.max(0, size - TAIL_BYTES)
    const chunks: Buffer[] = []
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(eventsPath, { start, end: size - 1 })
      stream.on('data', (c) => chunks.push(c as Buffer))
      stream.on('end', () => resolve())
      stream.on('error', reject)
    })
    let text = Buffer.concat(chunks).toString('utf8')
    // 从尾部切片时首行可能是半条记录，直接丢掉
    if (start > 0) {
      const nl = text.indexOf('\n')
      if (nl !== -1) text = text.slice(nl + 1)
    }
    // 从后往前找：末尾常是 mcp_init_*（点开写的），真正的回合在它们前面
    const lines = text.split('\n')
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]
      if (!line) continue
      const typeM = LINE_TYPE_RE.exec(line)
      if (!typeM || !ACTIVITY_TYPES.has(typeM[1])) continue
      const tsM = LINE_TS_RE.exec(line)
      if (!tsM) continue
      const t = Date.parse(tsM[1])
      if (!Number.isNaN(t)) return t
    }
    return 0
  } catch {
    return 0
  }
}

/**
 * 批量查询会话的真实活动时间。
 * @param items 会话列表（sessionId + cwd）
 * @returns { [sessionId]: ms时间戳 } —— 查不到（草稿会话、文件缺失等）的直接不出现
 */
export async function readSessionActivity(
  items: Array<{ sessionId: string; cwd: string }>
): Promise<Record<string, number>> {
  const root = join(resolveGrokHome(), 'sessions')
  const out: Record<string, number> = {}
  await Promise.all(
    items.map(async ({ sessionId, cwd }) => {
      if (!sessionId || !cwd || sessionId.startsWith('draft:')) return
      for (const dirName of encodeSessionDirVariants(cwd)) {
        const events = join(root, dirName, sessionId, 'events.jsonl')
        if (!existsSync(events)) continue
        const ts = await readLastEventTs(events)
        if (ts > 0) {
          out[sessionId] = ts
          return
        }
      }
    })
  )
  return out
}
