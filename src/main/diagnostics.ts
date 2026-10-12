/**
 * 环境自检 —— 启动前后都能回答「为什么连不上 / 为什么没回复」。
 *
 * 全部为只读检查，不修改任何配置。
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import { resolveGrokBinary, resolveGrokHome } from './acp/service'
import { readConfig } from './config'
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
      ? { id: 'binary', label: 'grok 可执行文件', level: 'ok', detail: binary }
      : {
          id: 'binary',
          label: 'grok 可执行文件',
          level: 'error',
          detail: '未找到',
          hint: '请确认已安装 Grok Build；或设置环境变量 GROK_BIN 指向 grok 可执行文件。'
        }
  )

  /* 2. GROK_HOME */
  const homeExists = existsSync(grokHome)
  checks.push({
    id: 'grok-home',
    label: '配置目录',
    level: homeExists ? 'ok' : 'error',
    detail: grokHome,
    hint: homeExists ? undefined : '该目录不存在，Grok Build 可能尚未安装或未初始化。'
  })

  /* 3. 版本 */
  const versionJson = safeReadJson<{ version?: string }>(join(grokHome, 'version.json'))
  checks.push({
    id: 'version',
    label: 'Grok Build 版本',
    level: versionJson?.version ? 'ok' : 'warn',
    detail: versionJson?.version ?? '未知'
  })

  /* 4. 登录态 */
  const auth = safeReadJson<Record<string, any>>(join(grokHome, 'auth.json'))
  const authEntry = auth ? (Object.values(auth)[0] as any) : null
  let account: string | null = null
  let tokenExpiresAt: string | null = null

  if (!authEntry) {
    checks.push({
      id: 'auth',
      label: '登录态',
      level: 'error',
      detail: '未找到 auth.json',
      hint: '请在终端执行 `grok login` 完成登录，桌面端会自动复用。'
    })
  } else {
    account = authEntry.email ?? authEntry.user_id ?? null
    tokenExpiresAt = authEntry.expires_at ?? null
    const expired = tokenExpiresAt ? new Date(tokenExpiresAt).getTime() < Date.now() : false
    checks.push({
      id: 'auth',
      label: '登录态',
      level: expired ? 'warn' : 'ok',
      detail: account
        ? `${account}（令牌${expired ? '已过期，将自动刷新' : '有效'}，至 ${tokenExpiresAt}）`
        : `已登录，至 ${tokenExpiresAt}`,
      hint: expired ? '令牌过期后由 grok 自动用 refresh_token 续期；若失败请在终端重新登录。' : undefined
    })
  }

  /* 5. 模型清单 */
  const modelsCache = safeReadJson<{ models?: Record<string, any> }>(
    join(grokHome, 'models_cache.json')
  )
  const models = modelsCache?.models ? Object.keys(modelsCache.models) : []
  checks.push({
    id: 'models',
    label: '可用模型',
    level: models.length > 0 ? 'ok' : 'warn',
    detail: models.length > 0 ? models.join(', ') : '未读到模型缓存'
  })

  /* 6. 代理 */
  const proxy = readConfig().proxy
  let proxyReachable: boolean | null = null
  if (proxy) {
    const check = await checkProxy(proxy)
    proxyReachable = check.ok
    checks.push({
      id: 'proxy',
      label: '网络代理',
      level: check.ok ? 'ok' : 'error',
      detail: `${proxy}（${check.detail}）`,
      hint: check.ok ? undefined : '代理端口不可达。请确认代理客户端已启动，或改用「自动探测代理」。'
    })
  } else {
    checks.push({
      id: 'proxy',
      label: '网络代理',
      level: 'warn',
      detail: '未配置，直连',
      hint: '模型服务在境外，若直连超时请在下方配置代理（可一键自动探测）。'
    })
  }

  /* 7. 模型服务连通性 */
  if (proxy) {
    // 配了代理时不用内置 fetch 直接探测：Node 的 fetch 不支持 SOCKS，
    // 强行直连只会得到误导性的「超时」。以代理端口可达性作为判据。
    checks.push({
      id: 'network',
      label: '模型服务连通性',
      level: proxyReachable ? 'ok' : 'error',
      detail: proxyReachable ? `经 ${proxy} 转发` : '代理不可达，无法访问模型服务',
      hint: proxyReachable
        ? '实际连通性以对话结果为准。'
        : '请先让代理可用，再重新检查。'
    })
  } else {
    const probe = await probeEndpointDirect(MODEL_ENDPOINT)
    checks.push({
      id: 'network',
      label: '模型服务连通性',
      level: probe.ok ? 'ok' : 'error',
      detail: `${MODEL_ENDPOINT} → ${probe.detail}`,
      hint: probe.ok
        ? undefined
        : '无法直连模型服务。若本机有代理客户端，请在下方配置或点击「自动探测代理」。'
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
