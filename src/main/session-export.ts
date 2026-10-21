/**
 * 会话导出 —— 补齐终端的 `grok export`（Markdown 记录）与 `grok trace`（诊断包）。
 *
 * 两条路径：
 * - `grok export <id>` 直接吐 Markdown，最保真（含工具调用与结构化块）；
 * - 拿不到时用磁盘上的 chat_history.jsonl 自己渲染（草稿会话、未落盘会话也能导）。
 *
 * trace 只落本地（--local）：诊断包可能含提示词与文件路径，不应默认上传。
 */

import { runGrokCli } from './grok-cli'
import { t } from './i18n'
import { readSessionMessages } from './session-search'

export interface ExportMarkdownResult {
  markdown: string
  /** grok = 用了终端同款导出；local = 客户端按对话历史兜底渲染 */
  source: 'grok' | 'local'
}

function fmtDate(ms: number): string {
  const d = new Date(ms)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes()
  )}`
}

/** 导出单个会话为 Markdown 文本 */
export async function exportSessionMarkdown(input: {
  sessionId: string
  cwd: string
  title: string
}): Promise<ExportMarkdownResult> {
  try {
    const { stdout } = await runGrokCli(['export', input.sessionId], {
      cwd: input.cwd,
      timeout: 60_000
    })
    const text = stdout.trim()
    if (text.length > 0) return { markdown: text, source: 'grok' }
  } catch {
    /* 落到本地渲染 */
  }

  const messages = await readSessionMessages(input.cwd, input.sessionId)
  if (messages.length === 0) {
    throw new Error(t('mainErrors.exportMarkdown.nothingToExport'))
  }
  const lines: string[] = [
    `# ${input.title}`,
    '',
    t('mainErrors.exportMarkdown.metaSessionId', { id: input.sessionId }),
    t('mainErrors.exportMarkdown.metaCwd', { cwd: input.cwd }),
    ''
  ]
  for (const m of messages) {
    lines.push(
      m.role === 'user' ? `## ${t('mainErrors.exportMarkdown.roleMe')}` : '## Grok',
      '',
      m.text,
      ''
    )
  }
  lines.push(`> ${t('mainErrors.exportMarkdown.footerLocal', { at: fmtDate(Date.now()) })}`, '')
  return { markdown: lines.join('\n'), source: 'local' }
}

/** 导出诊断包（trace），只落本地 */
export async function exportSessionTrace(input: {
  sessionId: string
  cwd?: string
}): Promise<{ ok: boolean; path: string; detail: string }> {
  try {
    const { stdout, stderr } = await runGrokCli(['trace', input.sessionId, '--local', '--json'], {
      cwd: input.cwd,
      timeout: 120_000
    })
    const text = (stdout || stderr || '').trim()
    let path = ''
    try {
      // grok trace --json 当前字段是 local_path；兼容 path / output
      const parsed = JSON.parse(text) as {
        path?: string
        output?: string
        local_path?: string
        status?: string
      }
      path = parsed.local_path ?? parsed.path ?? parsed.output ?? ''
      // 已导出但字段名再变时，仍从原文捞 .tar.gz 路径
      if (!path && parsed.status === 'exported') {
        const m = /([A-Za-z]:\\[^\s"]+\.tar\.gz|\/[^\s"]+\.tar\.gz)/.exec(text)
        path = m?.[1] ?? ''
      }
    } catch {
      /* 不是 JSON 就从文本里捞第一个像路径的片段 */
      const m = /([A-Za-z]:\\[^\s"]+\.tar\.gz|\/[^\s"]+\.tar\.gz)/.exec(text)
      path = m?.[1] ?? ''
    }
    return { ok: Boolean(path), path, detail: text }
  } catch (err) {
    return { ok: false, path: '', detail: (err as Error).message }
  }
}