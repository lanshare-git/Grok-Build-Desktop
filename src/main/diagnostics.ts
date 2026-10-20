/**
 * 环境自检 —— 启动前后都能回答「为什么连不上 / 为什么没回复」。
 *
 * 全部为只读检查，不修改任何配置。
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import { resolveGrokBinary, resolveGrokHome } from './acp/service'
import { readConfig } from './config'
import { t } from './i18n'
import { checkProxy, probeEndpointDirect } from './proxy'
import type { ConfigOption, DiagnosticCheck, DiagnosticsReport } from '../shared/types'

function safeReadJson<T>(path: string): T | null {
  try {
    if (!existsSync(path)) return null
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return null
  }
}

const MODEL_ENDPOINT = 'https://cli-chat-proxy.grok.com/v1/models'

/**
 * 冷启动模型目录种子：读 grok 落盘的 models_cache.json（+ settings_cache.json 的
 * default_model），合成 model / reasoning_effort 两个 ConfigOption。
 *
 * 用途：首次使用（或清空应用数据后）还没有任何会话时，真实选项要等第一次
 * session/new 才由 agent 下发，草稿 Header 的模型下拉无数据可画。这份种子只填
 * 这个空窗期 —— 真实 configOptions 到达后按 id 覆盖（mergeConfigCatalog），
 * 不会被种子锁死。缓存不存在或结构不符时返回空数组（= 维持原行为）。
 */
export function readModelConfigSeed(): ConfigOption[] {
  const grokHome = resolveGrokHome()
  interface EffortEntry {
    id?: string
    value?: string
    label?: string
    description?: string
    default?: boolean
  }
  interface ModelEntry {
    info?: {
      id?: string
      name?: string
      hidden?: boolean
      supported_in_api?: boolean
      reasoning_effort?: string | null
      reasoning_efforts?: EffortEntry[]
    }
  }
  const cache = safeReadJson<{ models?: Record<string, ModelEntry> }>(
    join(grokHome, 'models_cache.json')
  )
  const models = cache?.models
  if (!models) return []
  const visible = Object.values(models).filter((m) => {
    const info = m?.info
    if (!info?.id) return false
    return info.hidden !== true && info.supported_in_api !== false
  })
  if (visible.length === 0) return []

  // 默认模型：settings_cache.json 的 settings.default_model（payload 是二次编码的 JSON 字符串）
  let defaultModel: string | null = null
  const settingsCache = safeReadJson<{ payload?: string }>(join(grokHome, 'settings_cache.json'))
  try {
    const payload = settingsCache?.payload
      ? (JSON.parse(settingsCache.payload) as { settings?: { default_model?: unknown } })
      : null
    const dm = payload?.settings?.default_model
    if (typeof dm === 'string' && dm) defaultModel = dm
  } catch {
    /* 忽略：退回第一个可见模型（models_cache 按新到旧排列） */
  }
  const current = visible.find((m) => m.info?.id === defaultModel) ?? visible[0]
  const currentId = current.info?.id
  if (!currentId) return []

  const seed: ConfigOption[] = [
    {
      id: 'model',
      configId: 'model',
      name: 'Model',
      category: 'model',
      currentValue: currentId,
      options: visible.map((m) => ({
        value: m.info?.id ?? '',
        name: m.info?.name ?? m.info?.id
      }))
    }
  ]

  // 推理强度：取当前模型自己声明的档位（不同模型档位可能不同，如 4.5 没有 xhigh）
  const efforts = current.info?.reasoning_efforts ?? []
  const effortOptions = efforts
    .map((e) => ({
      value: e.value ?? e.id ?? '',
      name: e.label ?? e.value ?? e.id,
      description: e.description
    }))
    .filter((o) => o.value)
  if (effortOptions.length > 0) {
    seed.push({
      id: 'reasoning_effort',
      configId: 'reasoning_effort',
      name: 'Reasoning Effort',
      category: 'thought_level',
      currentValue:
        efforts.find((e) => e.default)?.value ?? current.info?.reasoning_effort ?? undefined,
      options: effortOptions
    })
  }
  return seed
}

export async function runDiagnostics(): Promise<DiagnosticsReport> {
  const checks: DiagnosticCheck[] = []
  const grokHome = resolveGrokHome()

  /* 1. 可执行文件 */
  const binary = resolveGrokBinary()
  checks.push(
    binary
      ? { id: 'binary', label: t('diagChecks.binary.label'), level: 'ok', detail: binary }
      : {
          id: 'binary',
          label: t('diagChecks.binary.label'),
          level: 'error',
          detail: t('diagChecks.binary.detailMissing'),
          hint: t('diagChecks.binary.hintMissing')
        }
  )

  /* 2. GROK_HOME */
  const homeExists = existsSync(grokHome)
  checks.push({
    id: 'grok-home',
    label: t('diagChecks.grokHome.label'),
    level: homeExists ? 'ok' : 'error',
    detail: grokHome,
    hint: homeExists ? undefined : t('diagChecks.grokHome.hintMissing')
  })

  /* 3. 版本 */
  const versionJson = safeReadJson<{ version?: string }>(join(grokHome, 'version.json'))
  checks.push({
    id: 'version',
    label: t('diagChecks.version.label'),
    level: versionJson?.version ? 'ok' : 'warn',
    detail: versionJson?.version ?? t('diagChecks.version.detailUnknown')
  })

  /* 4. 登录态 */
  const auth = safeReadJson<Record<string, any>>(join(grokHome, 'auth.json'))
  const authEntry = auth ? (Object.values(auth)[0] as any) : null
  let account: string | null = null
  let tokenExpiresAt: string | null = null

  if (!authEntry) {
    checks.push({
      id: 'auth',
      label: t('diagChecks.auth.label'),
      level: 'error',
      detail: t('diagChecks.auth.detailMissing'),
      hint: t('diagChecks.auth.hintMissing')
    })
  } else {
    account = authEntry.email ?? authEntry.user_id ?? null
    tokenExpiresAt = authEntry.expires_at ?? null
    const expired = tokenExpiresAt ? new Date(tokenExpiresAt).getTime() < Date.now() : false
    checks.push({
      id: 'auth',
      label: t('diagChecks.auth.label'),
      level: expired ? 'warn' : 'ok',
      detail: account
        ? expired
          ? t('diagChecks.auth.detailExpired', { account, expiresAt: tokenExpiresAt ?? '' })
          : t('diagChecks.auth.detailValid', { account, expiresAt: tokenExpiresAt ?? '' })
        : t('diagChecks.auth.detailNoAccount', { expiresAt: tokenExpiresAt ?? '' }),
      hint: expired ? t('diagChecks.auth.hintExpired') : undefined
    })
  }

  /* 5. 模型清单 */
  const modelsCache = safeReadJson<{ models?: Record<string, any> }>(
    join(grokHome, 'models_cache.json')
  )
  const models = modelsCache?.models ? Object.keys(modelsCache.models) : []
  checks.push({
    id: 'models',
    label: t('diagChecks.models.label'),
    level: models.length > 0 ? 'ok' : 'warn',
    detail: models.length > 0 ? models.join(', ') : t('diagChecks.models.detailEmpty')
  })

  /* 6. 代理 */
  const proxy = readConfig().proxy
  let proxyReachable: boolean | null = null
  if (proxy) {
    const check = await checkProxy(proxy)
    proxyReachable = check.ok
    checks.push({
      id: 'proxy',
      label: t('diagChecks.proxy.label'),
      level: check.ok ? 'ok' : 'error',
      detail: t('diagChecks.proxy.detail', { proxy, detail: check.detail }),
      hint: check.ok ? undefined : t('diagChecks.proxy.hintUnreachable')
    })
  } else {
    checks.push({
      id: 'proxy',
      label: t('diagChecks.proxy.label'),
      level: 'warn',
      detail: t('diagChecks.proxy.detailDirect'),
      hint: t('diagChecks.proxy.hintDirect')
    })
  }

  /* 7. 模型服务连通性 */
  if (proxy) {
    // 配了代理时不用内置 fetch 直接探测：Node 的 fetch 不支持 SOCKS，
    // 强行直连只会得到误导性的「超时」。以代理端口可达性作为判据。
    checks.push({
      id: 'network',
      label: t('diagChecks.network.label'),
      level: proxyReachable ? 'ok' : 'error',
      detail: proxyReachable
        ? t('diagChecks.network.detailViaProxy', { proxy })
        : t('diagChecks.network.detailProxyDown'),
      hint: proxyReachable
        ? t('diagChecks.network.hintViaProxy')
        : t('diagChecks.network.hintProxyDown')
    })
  } else {
    const probe = await probeEndpointDirect(MODEL_ENDPOINT)
    checks.push({
      id: 'network',
      label: t('diagChecks.network.label'),
      level: probe.ok ? 'ok' : 'error',
      detail: t('diagChecks.network.detailDirect', { endpoint: MODEL_ENDPOINT, detail: probe.detail }),
      hint: probe.ok
        ? undefined
        : t('diagChecks.network.hintDirectFail')
    })
  }

  return {
    checks,
    grokHome,
    grokBinary: binary,
    version: versionJson?.version ?? null,
    account,
    tokenExpiresAt,
    models,
    proxy,
    at: Date.now()
  }
}
