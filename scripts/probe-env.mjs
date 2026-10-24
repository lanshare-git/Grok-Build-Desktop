/**
 * Probe 脚本共用：解析 grok 可执行文件与工作目录，避免硬编码本机路径。
 *
 * 环境变量：
 *   GROK_BIN   — grok 可执行文件（优先）
 *   GROK_HOME  — 配置目录（默认 ~/.grok）
 *   PROBE_CWD  — 探测用工作目录（默认 process.cwd()）
 */
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function resolveGrokHome() {
  return process.env.GROK_HOME || join(homedir(), '.grok')
}

/** @returns {string} */
export function resolveGrokBin() {
  if (process.env.GROK_BIN?.trim()) return process.env.GROK_BIN.trim()
  const home = resolveGrokHome()
  const win = process.platform === 'win32'
  const candidates = win
    ? [join(home, 'bin', 'grok.exe'), join(home, 'bin', 'grok')]
    : [join(home, 'bin', 'grok'), join(home, 'bin', 'grok.exe')]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  // 回落到 PATH 上的命令名；spawn 时由系统解析
  return win ? 'grok.exe' : 'grok'
}

/** @returns {string} */
export function resolveProbeCwd() {
  return process.env.PROBE_CWD?.trim() || process.cwd()
}
