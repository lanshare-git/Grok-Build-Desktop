/**
 * 账号额度（每周用量百分比）—— 对应终端 TUI 里 `/usage` 弹窗的「Usage limit」页。
 *
 * 数据来源（**非 ACP**）：ACP 没有暴露任何计费方法（x.ai/billing / x.ai/session/usage
 * 在 agent stdio 上都返回 Method not found，那是 TUI 内部扩展）。真正能给数据的是
 * 聊天代理的 REST 端点：
 *
 *   GET https://cli-chat-proxy.grok.com/v1/billing?format=credits
 *   Authorization: Bearer <~/.grok/auth.json 里的 key>
 *
 * 返回形如 { config: { creditUsagePercent, currentPeriod, productUsage, … } }：
 * creditUsagePercent = 本计费周期内**已用**百分比（不是剩余），周期默认每周重置。
 *
 * 为什么用 curl.exe 而不是 fetch：grok（Rust）只认代理环境变量，本项目配置的是
 * **SOCKS5** 代理，而 Node 内置 fetch 不支持 SOCKS —— 直连必然超时并给出误导性的失败。
 * curl 原生支持 socks5h/HTTP 代理，因此「配了代理走 curl，没配走 fetch」。
 *
 *缓存 60 秒：账号菜单每次打开都会读，额度没必要秒级新鲜。
 */

import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { resolveGrokHome } from './acp/service'
import { readConfig } from './config'
import { t } from './i18n'
import type { BillingQuota, BillingProductUsage } from '../shared/types'

const execFileAsync = promisify(execFile)

const BILLING_ENDPOINT = 'https://cli-chat-proxy.grok.com/v1/billing?format=credits'
const CACHE_TTL_MS = 60_000

interface RawBilling {
  config?: {
    creditUsagePercent?: number
    currentPeriod?: { type?: string; start?: string; end?: string }
    billingPeriodStart?: string
    billingPeriodEnd?: string
    productUsage?: Array<{ product?: string; usagePercent?: number }>
    isUnifiedBillingUser?: boolean
    prepaidBalance?: { val?: number }
    onDemandCap?: { val?: number }
    onDemandUsed?: { val?: number }
    topUpMethod?: string
  }
  // 也可能直接平铺（不带 config 包装），两种形状都兼容
  creditUsagePercent?: number
  productUsage?: Array<{ product?: string; usagePercent?: number }>
  [key: string]: unknown
}

let cache: { at: number; value: BillingQuota | null; error?: string } | null = null

/** 取登录令牌（auth.json 里第一个条目的 key）。拿不到就返回 null，不抛。 */
async function readToken(): Promise<string | null> {
  try {
    const raw = await readFile(join(resolveGrokHome(), 'auth.json'), 'utf8')
    const parsed = JSON.parse(raw) as Record<string, { key?: string }>
    const entry = Object.values(parsed)[0]
    return entry?.key ?? null
  } catch {
    return null
  }
}

function normalize(raw: RawBilling): BillingQuota | null {
  const cfg = (raw?.config ?? raw) as NonNullable<RawBilling['config']> & RawBilling
  if (!cfg || typeof cfg.creditUsagePercent !== 'number') return null

  const products: BillingProductUsage[] = (cfg.productUsage ?? [])
    .filter((p) => p && typeof p.product === 'string')
    .map((p) => ({
      product: String(p.product),
      usagePercent: typeof p.usagePercent === 'number' ? p.usagePercent : 0
    }))
    .sort((a, b) => b.usagePercent - a.usagePercent)

  const num = (v?: { val?: number }): number => (typeof v?.val === 'number' ? v.val : 0)

  return {
    /** 已用百分比（0-100），注意不是剩余 */
    usedPercent: cfg.creditUsagePercent,
    remainingPercent: Math.max(0, 100 - cfg.creditUsagePercent),
    periodType: cfg.currentPeriod?.type ?? '',
    periodStart: cfg.currentPeriod?.start ?? cfg.billingPeriodStart ?? '',
    periodEnd: cfg.currentPeriod?.end ?? cfg.billingPeriodEnd ?? '',
    products,
    prepaidBalance: num(cfg.prepaidBalance),
    onDemandCap: num(cfg.onDemandCap),
    onDemandUsed: num(cfg.onDemandUsed),
    isUnifiedBillingUser: cfg.isUnifiedBillingUser ?? false,
    /** 单位毫秒；null = 尚未取到 */
    fetchedAt: Date.now()
  }
}

/** 经代理发起 GET（走 curl，兼容 socks5h / http 代理） */
async function getViaCurl(token: string, proxy: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'curl.exe',
    ['-sS', '--max-time', '20', '--proxy', proxy, '-H', `Authorization: Bearer ${token}`, BILLING_ENDPOINT],
    { windowsHide: true, timeout: 30_000, maxBuffer: 4 * 1024 * 1024 }
  )
  return stdout
}

/** 无代理时直接 fetch（走系统 DNS/直连） */
async function getViaFetch(token: string): Promise<string> {
  const res = await fetch(BILLING_ENDPOINT, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.text()
}

/**
 * 读取账号额度。返回 null 表示「拿不到」（未登录 / 网络不通 / 服务端没给），
 * 调用方要能在 UI 上区分「额度为 0」与「读不到」。
 */
export async function fetchBillingQuota(force = false): Promise<BillingQuota | null> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value

  const token = await readToken()
  if (!token) {
    cache = { at: Date.now(), value: null, error: t('mainErrors.billing.notLoggedIn') }
    return null
  }

  const proxy = readConfig().proxy
  let body: string
  try {
    body = proxy ? await getViaCurl(token, proxy) : await getViaFetch(token)
  } catch (err) {
    cache = { at: Date.now(), value: null, error: (err as Error).message }
    return null
  }

  let value: BillingQuota | null = null
  try {
    value = normalize(JSON.parse(body) as RawBilling)
  } catch {
    value = null
  }
  cache = { at: Date.now(), value }
  return value
}

/**
 * 供界面/设置展示：连同失败原因一起返回。
 * 必须区分「额度为 0」与「读不到」——前者是事实，后者是没取到，不能混为一谈。
 */
export async function fetchBillingQuotaDetailed(): Promise<{
  quota: BillingQuota | null
  error: string
}> {
  const quota = await fetchBillingQuota(true)
  return { quota, error: quota ? '' : (cache?.error ?? t('mainErrors.billing.unavailable')) }
}