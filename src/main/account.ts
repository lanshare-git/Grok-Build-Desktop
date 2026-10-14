/**
 * 账号管理 —— 读取并清除 ~/.grok/auth.json 中的登录态。
 *
 * 桌面端通过 ACP 复用终端版 grok 的全部状态，登录态也不例外：
 * 两者共用同一份 `~/.grok/auth.json`。因此「管理终端版登录态」即操作此文件。
 *
 * 仅提取非敏感字段（email / 姓名 / team 等）用于界面展示；
 * refresh_token / key / expires_at 等凭据绝不暴露给渲染进程。
 */

import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { proxyEnv, readConfig } from './config'
import { resolveGrokBinary } from './acp/service'
import type { GrokAccount } from '../shared/types'

const execFileAsync = promisify(execFile)

/** ~/.grok/auth.json 的真实路径（尊重 GROK_HOME 环境变量） */
function authJsonPath(): string {
  const home = process.env.GROK_HOME || join(homedir(), '.grok')
  return join(home, 'auth.json')
}

/** 传给 grok 的环境变量：复用主进程环境 + 代理 + 关闭自动更新 */
function grokEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...proxyEnv(readConfig().proxy),
    GROK_DISABLE_AUTOUPDATER: '1'
  }
}

/**
 * 读取当前登录账户的非敏感信息；未登录（无 auth.json 或解析失败）返回 null。
 */
export function getAccountInfo(): GrokAccount | null {
  const path = authJsonPath()
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, Record<string, unknown>>
    // auth.json 以 "https://auth.x.ai::<uuid>" 为键存放单个（或多）账户
    const accountKey = Object.keys(raw).find((k) => /auth\.x\.ai/.test(k))
    if (!accountKey) return null
    const a = raw[accountKey] ?? {}
    const str = (k: string): string | undefined => {
      const v = a[k]
      return typeof v === 'string' && v.length > 0 ? v : undefined
    }
    return {
      email: str('email'),
      firstName: str('first_name'),
      lastName: str('last_name'),
      userId: str('user_id'),
      teamId: str('team_id'),
      principalType: str('principal_type'),
      authMode: str('auth_mode')
    }
  } catch {
    return null
  }
}

/**
 * 退出登录：调用 `grok logout` 清除缓存凭据。
 * 与代理/MCP 改动同理，调用方应在其之后重启 agent 让会话失效并已重连。
 */
export async function logoutAccount(): Promise<void> {
  const binary = resolveGrokBinary()
  if (!binary) {
    throw new Error('未找到 grok 可执行文件。请确认已安装 Grok Build，或设置环境变量 GROK_BIN。')
  }
  try {
    await execFileAsync(binary, ['logout'], {
      env: grokEnv(),
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30_000
    })
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    const msg = (e.stdout || e.stderr || e.message || '退出登录失败').toString().trim()
    throw new Error(msg || 'grok logout 执行失败')
  }
}
