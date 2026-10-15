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
import type { DiagnosticCheck, DiagnosticsReport } from '../shared/types'

function safeReadJson<T>(path: string): T | null {
  try {
    if (!existsSync(path)) return null
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return null
  }
}

const MODEL_ENDPOINT = 'https://cli-chat-proxy.grok.com/v1/models'

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
