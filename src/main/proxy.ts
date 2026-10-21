/**
 * 代理探测 —— 扫描本机常见代理客户端的默认监听端口。
 *
 * 只做 TCP 可达性判断（不做协议握手）：够用且不会误触发代理认证弹窗。
 * 协议按端口约定推断（socks 端口给 socks5h，http 端口给 http）。
 */

import { connect } from 'node:net'

import { t } from './i18n'

export interface ProxyCandidate {
  url: string
  label: string
}

/** 常见代理客户端默认端口，按命中概率排序 */
export const PROXY_CANDIDATES: ProxyCandidate[] = [
  { url: 'socks5h://127.0.0.1:10808', label: 'v2rayN / Xray（SOCKS）' },
  { url: 'socks5h://127.0.0.1:7891', label: 'Clash（SOCKS）' },
  { url: 'socks5h://127.0.0.1:7897', label: 'Clash Verge / Mihomo（混合端口）' },
  { url: 'socks5h://127.0.0.1:1080', label: '通用 SOCKS5' },
  { url: 'socks5h://127.0.0.1:2080', label: '通用 SOCKS5' },
  { url: 'http://127.0.0.1:10809', label: 'v2rayN / Xray（HTTP）' },
  { url: 'http://127.0.0.1:7890', label: 'Clash（HTTP）' },
  { url: 'http://127.0.0.1:7897', label: 'Clash Verge / Mihomo（混合端口）' },
  { url: 'http://127.0.0.1:8080', label: '通用 HTTP' },
  { url: 'http://127.0.0.1:8888', label: '通用 HTTP' }
]

export function parseProxy(url: string): { host: string; port: number } | null {
  try {
    const parsed = new URL(url)
    const port = Number(parsed.port)
    if (!parsed.hostname || !port) return null
    return { host: parsed.hostname, port }
  } catch {
    return null
  }
}

/** TCP 连通性检查 */
export function probeTcp(host: string, port: number, timeoutMs = 1200): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port })
    let settled = false
    const finish = (ok: boolean): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

/** 检查指定代理端口是否可达 */
export async function checkProxy(url: string): Promise<{ ok: boolean; detail: string }> {
  const parsed = parseProxy(url)
  if (!parsed) return { ok: false, detail: t('mainErrors.proxy.unparsable', { url }) }
  const ok = await probeTcp(parsed.host, parsed.port)
  const addr = `${parsed.host}:${parsed.port}`
  return {
    ok,
    detail: ok ? t('mainErrors.proxy.reachable', { addr }) : t('mainErrors.proxy.unreachable', { addr })
  }
}

/** 扫描常见端口，返回第一个可用的代理 */
export async function detectProxy(): Promise<ProxyCandidate | null> {
  for (const candidate of PROXY_CANDIDATES) {
    const parsed = parseProxy(candidate.url)
    if (!parsed) continue
    if (await probeTcp(parsed.host, parsed.port)) return candidate
  }
  return null
}

/**
 * 直连探测模型端点。
 * 注意：配了 SOCKS 代理时不应调用此函数（Node 内置 fetch 不支持 SOCKS），
 * 那种情况下用 checkProxy 的端口可达性代表。
 */
export async function probeEndpointDirect(
  url: string,
  timeoutMs = 6000
): Promise<{ ok: boolean; detail: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal })
    return { ok: true, detail: `HTTP ${res.status}` }
  } catch (err) {
    const msg = (err as Error).name === 'AbortError' ? t('mainErrors.proxy.timeout') : (err as Error).message
    return { ok: false, detail: msg }
  } finally {
    clearTimeout(timer)
  }
}
