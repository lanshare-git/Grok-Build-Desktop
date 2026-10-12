/**
 * 应用级配置 —— 只存本应用自己的偏好，与终端版 grok 的配置互不干扰。
 * 落盘位置：userData/config.json
 */

import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface AppConfig {
  /**
   * 代理地址，如 socks5h://127.0.0.1:10808。null 表示直连。
   *
   * 之所以需要它：grok 走的是境外模型端点（cli-chat-proxy.grok.com），
   * 而 Rust 侧只认 HTTP_PROXY / HTTPS_PROXY 这类环境变量，不读 Windows 系统代理设置。
   * 所以由桌面端显式注入。
   */
  proxy: string | null
  /** 该代理是否由自动探测写入（用于界面文案区分） */
  proxyAutoDetected: boolean
}

const DEFAULTS: AppConfig = {
  proxy: null,
  proxyAutoDetected: false
}

function configFile(): string {
  return join(app.getPath('userData'), 'config.json')
}

export function readConfig(): AppConfig {
  try {
    const file = configFile()
    if (!existsSync(file)) return { ...DEFAULTS }
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<AppConfig>
    return { ...DEFAULTS, ...parsed }
  } catch {
    return { ...DEFAULTS }
  }
}

export function writeConfig(patch: Partial<AppConfig>): AppConfig {
  const next = { ...readConfig(), ...patch }
  try {
    const file = configFile()
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(next, null, 2), 'utf8')
  } catch {
    /* 配置写失败不应导致应用崩溃 */
  }
  return next
}

/**
 * 代理 -> 子进程环境变量。
 * 大小写各设一份：不同语言/库读取的变量名不一致（Rust 生态普遍读大写）。
 */
export function proxyEnv(proxy: string | null | undefined): Record<string, string> {
  if (!proxy) return {}
  return {
    HTTP_PROXY: proxy,
    HTTPS_PROXY: proxy,
    ALL_PROXY: proxy,
    http_proxy: proxy,
    https_proxy: proxy,
    all_proxy: proxy
  }
}
