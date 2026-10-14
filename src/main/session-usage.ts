/**
 * 用量读取 —— 对齐终端 `grok usage <SESSION_ID>`，并在此之上补一个跨会话累计。
 *
 * 为什么优先读磁盘而不是每次都调 CLI：
 * - `usage.json` 的内容与 `grok usage` 的输出**完全一致**（同一份数据），读文件是纯本地 IO；
 * - 累计视图要扫几十个会话，逐个 spawn CLI 的话几十秒起步，读文件是毫秒级；
 * - 该文件**不受 session/load 重放影响**（重放只刷 mtime），数值可信。
 *
 * 两条单位/口径约定（写错就会算错钱，务必保留）：
 * - `costUsdTicks` 是 1e-9 美元（十亿美元分之一），要除以 1e9；
 * - `inputTokens` **包含** `cachedReadTokens`（缓存命中是它的子集），展示时要写「其中」。
 */

import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { resolveGrokHome } from './acp/service'
import { runGrokCli } from './grok-cli'
import { encodeSessionDirVariants } from './session-activity'
import type {
  GlobalUsageReport,
  SessionUsageReport,
  TurnUsageRecord,
  UsageTotals
} from '../shared/types'

/** ticks → 美元 */
const TICKS_PER_USD = 1e9

interface RawSlice {
  inputTokens?: number
  outputTokens?: number
  cachedReadTokens?: number
  cacheCreationTokens?: number
  reasoningTokens?: number
  totalTokens?: number
  modelCalls?: number
  costUsdTicks?: number
  turnCount?: number
  primaryModelId?: string
  modelUsage?: Record<string, RawSlice>
}

interface RawUsage {
  sessionId?: string
  updatedAt?: string
  session?: RawSlice
  turns?: Array<RawSlice & { turnNumber?: number; endedAt?: string }>
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function toTotals(raw: RawSlice | undefined): UsageTotals {
  return {
    inputTokens: num(raw?.inputTokens),
    outputTokens: num(raw?.outputTokens),
    cachedReadTokens: num(raw?.cachedReadTokens),
    cacheCreationTokens: num(raw?.cacheCreationTokens),
    reasoningTokens: num(raw?.reasoningTokens),
    totalTokens: num(raw?.totalTokens),
    modelCalls: num(raw?.modelCalls),
    costUsd: num(raw?.costUsdTicks) / TICKS_PER_USD,
    turnCount: num(raw?.turnCount),
    primaryModelId: raw?.primaryModelId
  }
}

function toModelSlices(raw: RawSlice | undefined): Array<{ modelId: string } & UsageTotals> {
  const map = raw?.modelUsage
  if (!map || typeof map !== 'object') return []
  return Object.entries(map).map(([modelId, slice]) => ({ modelId, ...toTotals(slice) }))
}

function parseUsage(text: string, fallbackId: string, fromDisk: boolean): SessionUsageReport | null {
  let raw: RawUsage
  try {
    raw = JSON.parse(text) as RawUsage
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object' || !raw.session) return null

  const totals = toTotals(raw.session)
  const turns: TurnUsageRecord[] = (raw.turns ?? [])
    .filter((t) => t && typeof t === 'object')
    .map((t) => ({
      ...toTotals(t),
      turnNumber: num(t.turnNumber),
      endedAt: typeof t.endedAt === 'string' ? t.endedAt : undefined
    }))
    .sort((a, b) => a.turnNumber - b.turnNumber)

  return {
    sessionId: raw.sessionId || fallbackId,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
    totals,
    byModel: toModelSlices(raw.session),
    turns,
    fromDisk
  }
}

/** 会话目录候选（编码目录有多个历史变体，逐个试探，规则见 session-activity.ts） */
function usageFileCandidates(cwd: string, sessionId: string): string[] {
  const root = join(resolveGrokHome(), 'sessions')
  return encodeSessionDirVariants(cwd)
    .filter(Boolean)
    .map((variant) => join(root, variant, sessionId, 'usage.json'))
}

async function readUsageFile(path: string): Promise<string | null> {
  try {
    const st = await stat(path)
    // usage.json 通常几十 KB；给个上限避免个别异常文件拖垮扫描
    if (st.size > 8 * 1024 * 1024) return null
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

/** 读单个会话的用量：磁盘优先，读不到再回退 `grok usage` */
export async function readSessionUsage(input: {
  sessionId: string
  cwd: string
}): Promise<SessionUsageReport | null> {
  for (const path of usageFileCandidates(input.cwd, input.sessionId)) {
    const text = await readUsageFile(path)
    if (!text) continue
    const parsed = parseUsage(text, input.sessionId, true)
    if (parsed) return parsed
  }

  try {
    const { stdout } = await runGrokCli(['usage', input.sessionId], {
      cwd: input.cwd,
      timeout: 30_000
    })
    return parseUsage(stdout, input.sessionId, false)
  } catch {
    return null
  }
}

function addTotals(target: UsageTotals, add: UsageTotals): void {
  target.inputTokens += add.inputTokens
  target.outputTokens += add.outputTokens
  target.cachedReadTokens += add.cachedReadTokens
  target.cacheCreationTokens += add.cacheCreationTokens
  target.reasoningTokens += add.reasoningTokens
  target.totalTokens += add.totalTokens
  target.modelCalls += add.modelCalls
  target.costUsd += add.costUsd
  target.turnCount += add.turnCount
}

function emptyTotals(): UsageTotals {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cachedReadTokens: 0,
    cacheCreationTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    modelCalls: 0,
    costUsd: 0,
    turnCount: 0
  }
}

export interface UsageCandidate {
  sessionId: string
  cwd: string
  title: string
}

/**
 * 跨会话累计。逐个读 usage.json（并发 8），**不做 CLI 兜底** ——
 * 几十个会话各 spawn 一次 grok 会让这个面板卡住几十秒，而没有 usage.json
 * 本来就意味着「这个会话没有可结算的消耗」。
 */
export async function aggregateUsage(
  candidates: UsageCandidate[]
): Promise<GlobalUsageReport> {
  const totals = emptyTotals()
  const modelMap = new Map<string, { modelId: string } & UsageTotals>()
  const topSessions: GlobalUsageReport['topSessions'] = []
  let sessionCount = 0
  let missingCount = 0

  const list = candidates.slice(0, 200)
  let cursor = 0

  const worker = async (): Promise<void> => {
    while (cursor < list.length) {
      const item = list[cursor++]
      let text: string | null = null
      for (const path of usageFileCandidates(item.cwd, item.sessionId)) {
        text = await readUsageFile(path)
        if (text) break
      }
      const parsed = text ? parseUsage(text, item.sessionId, true) : null
      if (!parsed) {
        missingCount++
        continue
      }
      sessionCount++
      addTotals(totals, parsed.totals)
      for (const slice of parsed.byModel) {
        const prev = modelMap.get(slice.modelId)
        if (prev) addTotals(prev, slice)
        else modelMap.set(slice.modelId, { ...slice })
      }
      topSessions.push({
        sessionId: item.sessionId,
        title: item.title,
        cwd: item.cwd,
        costUsd: parsed.totals.costUsd,
        totalTokens: parsed.totals.totalTokens,
        turnCount: parsed.totals.turnCount,
        updatedAt: parsed.updatedAt
      })
    }
  }

  await Promise.all(Array.from({ length: Math.min(8, Math.max(1, list.length)) }, () => worker()))

  return {
    totals,
    sessionCount,
    missingCount,
    byModel: [...modelMap.values()].sort((a, b) => b.costUsd - a.costUsd),
    topSessions: topSessions.sort((a, b) => b.costUsd - a.costUsd).slice(0, 10)
  }
}