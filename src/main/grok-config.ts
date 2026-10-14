/**
 * `~/.grok/config.toml` 的定向读写 —— 目前只用于一项设置：
 * 工具调用展示密度 `ui.tool_call_density`（终端 `/density` 的落盘位置）。
 *
 * 为什么不引 TOML 库：这份文件是用户与 grok 共同维护的（带注释、有数组、有多段），
 * 解析再序列化必然丢注释、丢格式。更稳的做法是**行级定点编辑**：
 * 找到目标段与目标键，只替换那一行；不存在则在段末尾追加；连段都没有则在文件末尾建段。
 *
 * 明确不做的事：不碰任何其它键，不重排文件，不做「配置迁移」。
 */

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { resolveGrokHome } from './acp/service'
import type { ToolCallDensity } from '../shared/types'

/** grok 1.0.52 的五档（顺序即从详细到紧凑） */
export const DENSITY_VALUES: ToolCallDensity[] = [
  'detailed',
  'compact-shells',
  'compact-ungrouped',
  'compact-grouped',
  'compact-all-grouped'
]

export function configPath(): string {
  return join(resolveGrokHome(), 'config.toml')
}

/** 解析 `[ui]` 段里的 `tool_call_density`；顺便报出是否在用已废弃的旧键 */
export async function readToolCallDensity(): Promise<{
  value: ToolCallDensity
  /** true = 值来自旧键（group_tool_verbs / collapsed_edit_blocks）的推断 */
  migrated: boolean
  explicit: boolean
}> {
  let text = ''
  try {
    text = await readFile(configPath(), 'utf8')
  } catch {
    return { value: 'compact-ungrouped', migrated: false, explicit: false }
  }

  const section = readUiSection(text)
  const raw = section.keys['tool_call_density']
  if (raw && isDensity(raw)) return { value: raw, migrated: false, explicit: true }

  // 旧键 → 起始档的映射（grok 的迁移规则：group_tool_verbs/collapsed_edit_blocks 只决定起始档）
  const grouped = truthy(section.keys['group_tool_verbs'])
  const collapsedEdits = truthy(section.keys['collapsed_edit_blocks'])
  if (grouped || collapsedEdits) {
    return { value: grouped ? 'compact-grouped' : 'compact-shells', migrated: true, explicit: false }
  }
  // 1.0.52 的默认值：折叠成一行行、不分组
  return { value: 'compact-ungrouped', migrated: false, explicit: false }
}

function isDensity(v: string): v is ToolCallDensity {
  return (DENSITY_VALUES as string[]).includes(v)
}

function truthy(v?: string): boolean {
  return v === 'true' || v === '1'
}

/** 取出 `[ui]` 段的键值（仅处理段内形如 `key = value` 的行，忽略注释与子段） */
function readUiSection(text: string): { keys: Record<string, string> } {
  const keys: Record<string, string> = {}
  let inUi = false
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.startsWith('[')) {
      // 只认顶层 [ui]；[ui.xxx] 之类的子段直接结束当前段
      inUi = line === '[ui]'
      continue
    }
    if (!inUi || !line || line.startsWith('#')) continue
    const m = /^([A-Za-z0-9_-]+)\s*=\s*(.+?)\s*$/.exec(line)
    if (m) keys[m[1]] = stripQuotes(m[2])
  }
  return { keys }
}

function stripQuotes(v: string): string {
  const t = v.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1)
  }
  return t
}

/**
 * 写入 `ui.tool_call_density`。
 * - 已有该键 → 就地替换那一行（保留缩进与行尾注释）
 * - 有 `[ui]` 段但无该键 → 追加到段末
 * - 没有 `[ui]` 段 → 在文件末尾新建一段
 */
export async function writeToolCallDensity(value: ToolCallDensity): Promise<void> {
  if (!isDensity(value)) throw new Error(`未知的展示密度：${value}`)
  const path = configPath()

  let text = ''
  try {
    text = await readFile(path, 'utf8')
  } catch {
    text = ''
  }

  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.length > 0 ? text.split(/\r?\n/) : []

  const newLine = `tool_call_density = "${value}"`
  let replaced = false
  let uiStart = -1
  let uiEnd = -1

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (t.startsWith('[')) {
      if (uiStart >= 0 && uiEnd < 0) {
        uiEnd = i
        break
      }
      if (t === '[ui]') uiStart = i
      continue
    }
    if (uiStart >= 0 && uiEnd < 0) {
      const m = /^(\s*)([A-Za-z0-9_-]+)(\s*=\s*)(.+?)(\s*(?:#.*)?)$/.exec(lines[i])
      if (m && m[2] === 'tool_call_density') {
        lines[i] = `${m[1]}${m[2]}${m[3]}"${value}"${m[5]}`
        replaced = true
        break
      }
    }
  }
  if (uiStart >= 0 && uiEnd < 0) uiEnd = lines.length

  if (!replaced) {
    if (uiStart >= 0) {
      // 插到段末（uiEnd 是下一个段头或文件末尾）
      lines.splice(uiEnd, 0, newLine)
    } else {
      if (lines.length > 0 && lines[lines.length - 1].trim() !== '') lines.push('')
      lines.push('[ui]', newLine)
    }
  }

  await writeFile(path, lines.join(eol), 'utf8')
}