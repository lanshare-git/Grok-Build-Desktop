/** 渲染层小工具 */

export function basename(p: string): string {
  if (!p) return ''
  const parts = p.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || p
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return '刚刚'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day} 天前`
  return new Date(ts).toLocaleDateString('zh-CN')
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
  const preferred = ['command', 'path', 'file_path', 'pattern', 'query', 'url', 'cmd']
  for (const key of preferred) {
    const value = obj[key]
    if (typeof value === 'string' && value) return value.slice(0, 160)
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
