/**
 * MCP 服务器管理 —— 直接驱动 `grok mcp` 子命令。
 *
 * grok CLI 自带完整的 MCP 管理能力，配置落地在 ~/.grok/config.toml（user 作用域）。
 * 桌面端只操作 user 作用域，等价于「为当前账户配置、对所有项目生效」，
 * 与桌面 agent 读取配置的位置一致（agent 以用户主目录为 cwd 启动）。
 *
 * 注意：`grok mcp list --json` 只回传 command/args/enabled/name/scope，
 * 远程服务器的 url、env、headers 不回传，因此「编辑」时这些字段需用户重新填写。
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { readConfig, proxyEnv } from './config'
import { resolveGrokBinary } from './acp/service'
import { t } from './i18n'
import type { McpServer, McpServerInput, McpTransport } from '../shared/types'

const execFileAsync = promisify(execFile)

/** 传给 grok 的环境变量：复用主进程环境 + 代理（远程 MCP 探测需要）+ 关闭自动更新 */
function grokEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...proxyEnv(readConfig().proxy),
    GROK_DISABLE_AUTOUPDATER: '1'
  }
}

interface RawMcpServer {
  name: string
  scope?: string
  enabled?: boolean
  command?: string
  args?: string[]
  url?: string
}

function normalize(raw: RawMcpServer): McpServer {
  const isStdio = !!raw.command || (raw.args?.length ?? 0) > 0
  const transport: McpTransport = isStdio ? 'stdio' : raw.url ? 'http' : 'stdio'
  return {
    name: raw.name,
    scope: raw.scope === 'project' ? 'project' : 'user',
    enabled: raw.enabled ?? true,
    transport,
    command: raw.command,
    args: raw.args,
    url: raw.url
  }
}

/** 轻量 shell 分词：支持双引号/单引号包裹含空格的片段 */
function tokenize(input: string): string[] {
  const tokens: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(input))) {
    tokens.push(m[1] ?? m[2] ?? m[3])
  }
  return tokens
}

async function runGrok(args: string[], opts: { timeout?: number } = {}): Promise<{ stdout: string; stderr: string }> {
  const binary = resolveGrokBinary()
  if (!binary) {
    throw new Error(t('mainErrors.grokCli.binaryMissing'))
  }
  try {
    return await execFileAsync(binary, args, {
      env: grokEnv(),
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
      timeout: opts.timeout
    })
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    const msg = (e.stdout || e.stderr || e.message || t('mainErrors.grokCli.operationFailed'))
      .toString()
      .trim()
    throw new Error(msg || t('mainErrors.grokCli.operationFailed'))
  }
}

/** 读取当前已配置的 MCP 服务器列表 */
export async function listMcpServers(): Promise<McpServer[]> {
  const { stdout } = await runGrok(['mcp', 'list', '--json'])
  try {
    const parsed = JSON.parse(stdout || '[]') as RawMcpServer[]
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalize)
  } catch {
    // 空配置时 grok 可能直接输出提示文本而非 JSON，视为无服务器
    return []
  }
}

/** 新增或按同名更新一个服务器，返回最新列表 */
export async function addMcpServer(input: McpServerInput): Promise<McpServer[]> {
  const name = input.name.trim()
  if (!name) throw new Error(t('mainErrors.grokCli.serverNameRequired'))

  const args: string[] = ['mcp', 'add', name, '--scope', 'user']

  if (input.transport !== 'stdio') {
    args.push('--transport', input.transport)
  }
  for (const e of input.env ?? []) {
    if (e.trim()) args.push('-e', e.trim())
  }
  for (const h of input.headers ?? []) {
    if (h.trim()) args.push('-H', h.trim())
  }

  if (input.transport === 'stdio') {
    const tokens = tokenize(input.commandLine ?? '')
    if (tokens.length === 0) throw new Error(t('mainErrors.grokCli.stdioCommandRequired'))
    args.push('--', ...tokens)
  } else {
    if (!input.url?.trim()) throw new Error(t('mainErrors.grokCli.remoteUrlRequired'))
    args.push(input.url.trim())
  }

  await runGrok(args)
  return listMcpServers()
}

/** 删除服务器，返回最新列表 */
export async function removeMcpServer(name: string): Promise<McpServer[]> {
  // 不指定 --scope：grok 会在所有作用域里查找并删除
  await runGrok(['mcp', 'remove', name])
  return listMcpServers()
}

/** 启用/禁用服务器，返回最新列表 */
export async function setMcpEnabled(name: string, enabled: boolean): Promise<McpServer[]> {
  await runGrok(['mcp', enabled ? 'enable' : 'disable', name])
  return listMcpServers()
}

/** 诊断单个服务器或全局配置，返回人类可读文本 */
export async function runMcpDoctor(name: string | null): Promise<string> {
  const args = name ? ['mcp', 'doctor', name] : ['mcp', 'doctor']
  try {
    const { stdout, stderr } = await runGrok(args, { timeout: 30_000 })
    const text = (stdout || stderr || '').trim()
    return text || t('mainErrors.grokCli.diagDoneNoOutput')
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    const text = (e.stdout || e.stderr || e.message || '').toString().trim()
    if (text) return text
    throw err
  }
}
