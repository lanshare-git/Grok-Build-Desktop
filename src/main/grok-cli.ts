/**
 * grok CLI 调用层 —— 把终端版 grok 的「非对话能力」收进桌面端。
 *
 * 桌面端本身通过 ACP（`grok agent stdio`）与 agent 通信，但插件市场、存储占用、
 * 版本更新、跨会话记忆、git worktree、配置自检、会话导出这些能力 **ACP 没有暴露**，
 * 只能直接驱动 CLI 子命令。它们与 agent 共用同一份 `~/.grok`（登录态、配置、缓存），
 * 所以这里看到的状态就是终端里看到的状态，不存在两套配置。
 *
 * 与 main/mcp.ts 的约定一致：
 * - 注入代理（远程市场/更新需要联网）与 GROK_DISABLE_AUTOUPDATER（更新交给显式入口）
 * - 只调 grok 自己的子命令，绝不碰磁盘文件，避免与 agent 的写入竞争
 */

import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'

import { resolveGrokBinary } from './acp/service'
import { readConfig, proxyEnv } from './config'
import { t } from './i18n'
import type {
  DiskUsageReport,
  GrokEnvInfo,
  GrokUpdateInfo,
  GrokVersionInfo,
  MemoryClearScope,
  PluginInfo,
  WorktreeInfo
} from '../shared/types'

const execFileAsync = promisify(execFile)

function grokEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...proxyEnv(readConfig().proxy),
    GROK_DISABLE_AUTOUPDATER: '1'
  }
}

export interface GrokCliOptions {
  /** 超时（ms）。默认 60s；网络类操作（更新/市场）可单独放宽 */
  timeout?: number
  /** 工作目录，`grok inspect` 等命令按 cwd 解析配置，必须显式传 */
  cwd?: string
}

/**
 * 同步取 grok 可执行文件路径。仅用于启动前的快速探测（如 About 面板显示版本），
 * 其余一律走 runGrokCli —— 同步 spawn 会阻塞主进程。
 */
export function grokBinarySync(): string | null {
  try {
    return resolveGrokBinary()
  } catch {
    return null
  }
}

async function runGrokCli(
  args: string[],
  opts: GrokCliOptions = {}
): Promise<{ stdout: string; stderr: string }> {
  const binary = resolveGrokBinary()
  if (!binary) {
    throw new Error(t('mainErrors.grokCli.binaryMissing'))
  }
  try {
    return await execFileAsync(binary, args, {
      env: grokEnv(),
      cwd: opts.cwd,
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024,
      timeout: opts.timeout ?? 60_000
    })
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    const msg = (e.stdout || e.stderr || e.message || t('mainErrors.grokCli.operationFailed'))
      .toString()
      .trim()
    throw new Error(msg || t('mainErrors.grokCli.commandFailed', { command: args.join(' ') }))
  }
}

/** 对外暴露的 CLI 调用入口（session-export 等模块复用同一套环境与错误语义） */
export { runGrokCli }

/** 跑一条会输出 JSON 的命令；解析失败返回 null（grok 偶尔会先打印人话提示） */
async function runGrokJson<T>(args: string[], opts: GrokCliOptions = {}): Promise<T | null> {
  const { stdout } = await runGrokCli(args, opts)
  const text = stdout.trim()
  if (!text) return null
  try {
    return JSON.parse(text) as T
  } catch {
    // 有些子命令把 JSON 混在提示文本里，取第一个 [ 或 { 开头的片段再试一次
    const start = text.search(/[[{]/)
    if (start > 0) {
      try {
        return JSON.parse(text.slice(start)) as T
      } catch {
        return null
      }
    }
    return null
  }
}

/* ------------------------------------------------------------------ *
 *  插件与插件市场
 * ------------------------------------------------------------------ */

interface RawPlugin {
  name?: string
  version?: string
  enabled?: boolean
  description?: string
  source?: unknown
  path?: string
  [key: string]: unknown
}

function normalizePlugin(raw: RawPlugin): PluginInfo {
  const source = raw.source as { type?: string; url?: string; path?: string } | string | undefined
  return {
    name: raw.name ?? t('mainErrors.grokCli.pluginUnnamed'),
    version: raw.version ?? '',
    // grok 未显式给 enabled 时默认视为启用（与 mcp list 的处理一致）
    enabled: raw.enabled ?? true,
    description: raw.description ?? '',
    source:
      typeof source === 'string' ? source : (source?.url ?? source?.path ?? source?.type ?? ''),
    path: raw.path ?? ''
  }
}

/** 已安装插件列表 */
export async function listPlugins(cwd?: string): Promise<PluginInfo[]> {
  const parsed = await runGrokJson<RawPlugin[]>(['plugin', 'list', '--json'], { cwd })
  if (!Array.isArray(parsed)) return []
  return parsed.map(normalizePlugin)
}

/** 从 git URL / GitHub 简写 / 本地路径安装插件，返回最新列表 */
export async function installPlugin(source: string, cwd?: string): Promise<PluginInfo[]> {
  const src = source.trim()
  if (!src) throw new Error(t('mainErrors.grokCli.pluginSourceRequired'))
  // --trust：桌面端没有可交互的确认 TUI，不加会卡在确认提示上
  await runGrokCli(['plugin', 'install', src, '--trust'], { timeout: 180_000, cwd })
  return listPlugins(cwd)
}

export async function uninstallPlugin(name: string, cwd?: string): Promise<PluginInfo[]> {
  await runGrokCli(['plugin', 'uninstall', name], { timeout: 120_000, cwd })
  return listPlugins(cwd)
}

export async function setPluginEnabled(
  name: string,
  enabled: boolean,
  cwd?: string
): Promise<PluginInfo[]> {
  await runGrokCli(['plugin', enabled ? 'enable' : 'disable', name], { cwd })
  return listPlugins(cwd)
}

/** 插件组件清单（hook / MCP / skill 等），返回 grok 打印的原始文本 */
export async function pluginDetails(name: string, cwd?: string): Promise<string> {
  const { stdout, stderr } = await runGrokCli(['plugin', 'details', name], { cwd })
  return (stdout || stderr || t('mainErrors.grokCli.noOutput')).trim()
}

/** 已配置的插件市场源 */
export async function listMarketplaces(cwd?: string): Promise<{ name: string; git: string }[]> {
  const parsed = await runGrokJson<
    Array<{ name?: string; kind?: string; source?: { url?: string; path?: string } }> | Record<
      string,
      string
    >
  >(['plugin', 'marketplace', 'list', '--json'], { cwd })
  if (Array.isArray(parsed)) {
    return parsed.map((m) => ({
      name: m.name ?? '',
      git: m.source?.url ?? m.source?.path ?? ''
    }))
  }
  if (parsed && typeof parsed === 'object') {
    return Object.entries(parsed).map(([name, git]) => ({ name, git: String(git) }))
  }
  return []
}

export async function addMarketplace(source: string, cwd?: string): Promise<string> {
  const src = source.trim()
  if (!src) throw new Error(t('mainErrors.grokCli.marketplaceSourceRequired'))
  const { stdout, stderr } = await runGrokCli(['plugin', 'marketplace', 'add', src], {
    timeout: 180_000,
    cwd
  })
  return (stdout || stderr || t('mainErrors.grokCli.marketplaceAdded')).trim()
}

export async function removeMarketplace(name: string, cwd?: string): Promise<string> {
  const { stdout, stderr } = await runGrokCli(['plugin', 'marketplace', 'remove', name], { cwd })
  return (stdout || stderr || t('mainErrors.grokCli.marketplaceRemoved')).trim()
}

/** 刷新市场缓存（拉取远端插件清单） */
export async function updateMarketplaces(cwd?: string): Promise<string> {
  const { stdout, stderr } = await runGrokCli(['plugin', 'marketplace', 'update'], {
    timeout: 180_000,
    cwd
  })
  return (stdout || stderr || t('mainErrors.grokCli.marketplaceUpdated')).trim()
}

/* ------------------------------------------------------------------ *
 *  存储占用 / 版本与更新 / 记忆 / 配置自检
 * ------------------------------------------------------------------ */

interface RawDuDir {
  name?: string
  bytes?: number
}

interface RawDuWorktree {
  id?: string
  path?: string
  label?: string
  size_bytes?: number
  age_days?: number
}

/** `grok du --json`：~/.grok 各目录占用 + worktree 明细 */
export async function diskUsage(cwd?: string): Promise<DiskUsageReport> {
  const parsed = await runGrokJson<{
    grok_home?: string
    total_bytes?: number
    top_level_dirs?: RawDuDir[]
    worktrees?: RawDuWorktree[]
    registry_path?: string
  }>(['du', '--json'], { timeout: 120_000, cwd })

  return {
    grokHome: parsed?.grok_home ?? '',
    totalBytes: parsed?.total_bytes ?? 0,
    dirs: (parsed?.top_level_dirs ?? [])
      .map((d) => ({ name: d.name ?? '', bytes: d.bytes ?? 0 }))
      .sort((a, b) => b.bytes - a.bytes),
    worktrees: (parsed?.worktrees ?? []).map((w) => ({
      id: w.id ?? '',
      path: w.path ?? '',
      label: w.label ?? '',
      bytes: w.size_bytes ?? 0
    })),
    registryPath: parsed?.registry_path ?? ''
  }
}

/** grok 自身版本（`grok version` 首行形如 `grok 1.0.50 (c58f321264ba)`） */
export async function grokVersion(cwd?: string): Promise<GrokVersionInfo> {
  try {
    const { stdout } = await runGrokCli(['version'], { timeout: 15_000, cwd })
    const line = stdout.trim().split(/\r?\n/)[0] ?? ''
    const m = /(\d+\.\d+\.\d+([-.][0-9A-Za-z.]+)?)/.exec(line)
    return { version: m?.[1] ?? line.trim(), raw: line.trim() }
  } catch (err) {
    return { version: '', raw: '', error: (err as Error).message }
  }
}

/** 检查更新（不安装） */
export async function checkGrokUpdate(cwd?: string): Promise<GrokUpdateInfo> {
  const parsed = await runGrokJson<{
    currentVersion?: string
    latestVersion?: string
    updateAvailable?: boolean
    installer?: string
    channel?: string
    autoUpdate?: boolean
    error?: string | null
  }>(['update', '--check', '--json'], { timeout: 90_000, cwd })

  return {
    currentVersion: parsed?.currentVersion ?? '',
    latestVersion: parsed?.latestVersion ?? '',
    updateAvailable: parsed?.updateAvailable ?? false,
    installer: parsed?.installer ?? '',
    channel: parsed?.channel ?? '',
    autoUpdate: parsed?.autoUpdate ?? false,
    error: parsed?.error ?? ''
  }
}

/**
 * 执行更新安装；返回 grok 的输出文本（可能较长）。
 *
 * 三个必须知道的现实（2026-10-14 实测）：
 *  1. **要下载整个 agent（约 170MB）**，走代理实测耗时 **3 分半**，中途还会重试 ——
 *     绝不能因为「暂时没输出」就当成失败或无响应（用户点过一次就以为按钮坏了）。
 *  2. 桌面端 agent 在运行时也能替换成功（Windows 的占用问题由 grok 自己的更新流程处理），
 *     不需要提前停 agent；替换完需要重启 agent 才生效（grok 也会打印 Please restart Grok）。
 *  3. 超时给到 15 分钟，给慢速代理留足余量。
 */
export async function installGrokUpdate(
  opts: { version?: string; alpha?: boolean } = {}
): Promise<string> {
  const args = ['update']
  if (opts.version) args.push('--version', opts.version)
  if (opts.alpha) args.push('--alpha')
  try {
    const { stdout, stderr } = await runGrokCli(args, { timeout: 900_000 })
    const text = (stdout || stderr || '').trim()
    if (!text) {
      return t('mainErrors.grokCli.updateNoOutput')
    }
    return text
  } catch (err) {
    const msg = (err as Error).message
    throw new Error(t('mainErrors.grokCli.updateFailedHint', { message: msg }))
  }
}

/** 清空跨会话记忆：workspace（默认）/ global / all */
export async function clearMemory(scope: MemoryClearScope, cwd?: string): Promise<string> {
  const args = ['memory', 'clear', '-y']
  if (scope === 'global') args.push('--global')
  if (scope === 'all') args.push('--all')
  const { stdout, stderr } = await runGrokCli(args, { cwd })
  return (stdout || stderr || t('mainErrors.grokCli.memoryCleared')).trim()
}

interface RawInspectSkill {
  name?: string
  description?: string
  userInvocable?: boolean
  source?: { type?: string; path?: string }
}

interface RawInspectAgent {
  name?: string
  description?: string
  source?: { type?: string }
}

/**
 * `grok inspect --json`：grok 为某个目录解析出的完整配置视图。
 * 桌面端目前只消费 skills / agents / plugins / mcpServers 四项：
 * 前两者用于补全命令面板（终端 TUI 会列出全部内置 skill，ACP 只上报 7 条运行时命令），
 * 后两者用于与 MCP、插件面板交叉核对。
 */
export async function inspectEnvironment(cwd: string): Promise<GrokEnvInfo> {
  const parsed = await runGrokJson<{
    grokVersion?: string
    channel?: string
    cwd?: string
    projectRoot?: string | null
    projectTrusted?: boolean
    skills?: RawInspectSkill[]
    agents?: RawInspectAgent[]
    plugins?: Array<{ name?: string }>
    mcpServers?: Array<{ name?: string }>
    configSources?: Record<string, unknown>
  }>(['inspect', '--json'], { timeout: 60_000, cwd })

  return {
    grokVersion: parsed?.grokVersion ?? '',
    channel: parsed?.channel ?? '',
    cwd: parsed?.cwd ?? cwd,
    projectRoot: parsed?.projectRoot ?? '',
    projectTrusted: parsed?.projectTrusted ?? false,
    skills: (parsed?.skills ?? [])
      .filter((s) => s.userInvocable !== false)
      .map((s) => ({
        name: s.name ?? '',
        description: s.description ?? '',
        source: s.source?.type ?? ''
      }))
      .filter((s) => s.name !== ''),
    agents: (parsed?.agents ?? []).map((a) => ({
      name: a.name ?? '',
      description: a.description ?? '',
      source: a.source?.type ?? ''
    })),
    pluginCount: parsed?.plugins?.length ?? 0,
    mcpServerCount: parsed?.mcpServers?.length ?? 0
  }
}

/* ------------------------------------------------------------------ *
 *  git worktree（终端 `grok -w` / `grok worktree *`）
 * ------------------------------------------------------------------ */

interface RawWorktree {
  id?: string
  path?: string
  source_repo?: string
  repo_name?: string
  kind?: string
  git_ref?: string
  created_at?: number
  last_accessed_at?: number | null
  status?: string
  metadata?: { label?: string }
}

function normalizeWorktree(raw: RawWorktree): WorktreeInfo {
  return {
    id: raw.id ?? '',
    path: raw.path ?? '',
    label: raw.metadata?.label ?? '',
    repoName: raw.repo_name ?? '',
    sourceRepo: raw.source_repo ?? '',
    kind: raw.kind ?? '',
    branch: raw.git_ref ?? '',
    status: raw.status ?? '',
    createdAt: raw.created_at ? raw.created_at * 1000 : 0,
    lastAccessedAt: raw.last_accessed_at ? raw.last_accessed_at * 1000 : 0
  }
}

export async function listWorktrees(cwd?: string): Promise<WorktreeInfo[]> {
  const parsed = await runGrokJson<RawWorktree[]>(['worktree', 'list', '--json'], { cwd })
  if (!Array.isArray(parsed)) return []
  return parsed.map(normalizeWorktree)
}

/** 创建一个 worktree（等价 `grok -w`），返回新 worktree 的绝对路径（grok 打到 stdout） */
export async function createWorktree(
  input: { cwd: string; name?: string; ref?: string }
): Promise<WorktreeInfo> {
  const args = ['worktree', 'create']
  if (input.name?.trim()) args.push(input.name.trim())
  if (input.ref?.trim()) args.push('--ref', input.ref.trim())
  const { stdout, stderr } = await runGrokCli(args, { timeout: 180_000, cwd: input.cwd })
  const path = (stdout || '').trim().split(/\r?\n/).pop()?.trim() ?? ''
  if (!path) throw new Error((stderr || t('mainErrors.grokCli.worktreeNoPath')).trim())
  const list = await listWorktrees(input.cwd)
  return (
    list.find((w) => w.path.toLowerCase() === path.toLowerCase()) ?? {
      id: '',
      path,
      label: input.name?.trim() ?? '',
      repoName: '',
      sourceRepo: input.cwd,
      kind: 'fork',
      branch: input.ref?.trim() ?? '',
      status: 'alive',
      createdAt: Date.now(),
      lastAccessedAt: 0
    }
  )
}

export async function removeWorktree(
  input: { id: string; force?: boolean; cwd?: string }
): Promise<string> {
  const args = ['worktree', 'rm']
  if (input.force) args.push('--force')
  args.push(input.id)
  const { stdout, stderr } = await runGrokCli(args, { timeout: 120_000, cwd: input.cwd })
  return (stdout || stderr || t('mainErrors.grokCli.worktreeRemoved')).trim()
}

/** gc 预览 / 执行；不传 maxAge 时 grok 不会过期任何 worktree（只做安全清理） */
export async function gcWorktrees(
  input: { maxAge?: string; dryRun?: boolean; cwd?: string } = {}
): Promise<string> {
  const args = ['worktree', 'gc']
  if (input.dryRun) args.push('--dry-run')
  if (input.maxAge?.trim()) args.push('--max-age', input.maxAge.trim())
  const { stdout, stderr } = await runGrokCli(args, { timeout: 180_000, cwd: input.cwd })
  return (stdout || stderr || t('mainErrors.grokCli.noOutput')).trim()
}

/* ------------------------------------------------------------------ *
 *  登录（终端 `grok login`）
 * ------------------------------------------------------------------ */

/**
 * 触发 grok 登录流程。
 * `-y` 不存在，因此这是**交互式**命令：无 TTY 时 grok 会自行走设备码/浏览器流程，
 * 超时或失败都由调用方把原文展示给用户（提示回终端执行 `grok login`）。
 */
export async function grokLogin(opts: { oauth?: boolean; timeout?: number } = {}): Promise<string> {
  const args = ['login']
  if (opts.oauth !== false) args.push('--oauth')
  const { stdout, stderr } = await runGrokCli(args, { timeout: opts.timeout ?? 120_000 })
  return (stdout || stderr || t('mainErrors.grokCli.loginFinished')).trim()
}

/** 同步版本号读取（About/诊断面板用，避免为一个字符串等一次异步 spawn） */
export function grokVersionSync(): string {
  const binary = grokBinarySync()
  if (!binary) return ''
  try {
    const out = execFileSync(binary, ['version'], {
      env: grokEnv(),
      windowsHide: true,
      timeout: 10_000,
      encoding: 'utf8'
    })
    const m = /(\d+\.\d+\.\d+([-.][0-9A-Za-z.]+)?)/.exec(out)
    return m?.[1] ?? ''
  } catch {
    return ''
  }
}