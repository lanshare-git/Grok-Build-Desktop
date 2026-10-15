/**
 * 应用级配置 —— 只存本应用自己的偏好，与终端版 grok 的配置互不干扰。
 * 落盘位置：userData/config.json
 */

import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { CloseAction } from '../shared/types'
import type { Locale } from '../shared/i18n/types'

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
  /**
   * 点击窗口关闭按钮时的行为：
   *  - 'tray'：隐藏到托盘（不退出，托盘可重新打开）
   *  - 'quit'：直接退出应用
   *  - null：未配置，首次点关闭时弹窗询问并记住选择
   */
  closeAction: CloseAction | null
  /**
   * 侧栏删除会话时，确认弹窗里的「同时删除磁盘文件」是否**默认勾选**。
   *  - true（默认）：弹窗一出来就勾上，等同历史行为；
   *  - false：默认只从列表移除，要连磁盘一起删得自己勾。
   * 会话数据一旦删除，只能去回收站找回，所以给用户一个改默认值的入口。
   */
  deleteDiskFilesByDefault: boolean
  /**
   * 界面语言：'zh-CN' | 'en' | 'ja'；null = 跟随系统（启动时按 app.getLocale() 归一）。
   * 语言的唯一事实源在这里；渲染进程 store.locale 只是它的缓存。
   */
  locale: Locale | null
}

const DEFAULTS: AppConfig = {
  proxy: null,
  proxyAutoDetected: false,
  closeAction: null,
  deleteDiskFilesByDefault: true,
  locale: null
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
