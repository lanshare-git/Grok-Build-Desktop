/**
 * 把会话在磁盘上的落盘目录搬到另一个工作目录下，实现「任务换工作目录」。
 *
 * ## 为什么需要自己搬磁盘目录
 *
 * grok / ACP **没有**任何「改会话工作目录」的接口，实测（2026-10-14）：
 *  - `grok sessions` 只有 list / search / delete，没有 move；
 *  - `grok --resume` 的「按标题匹配」只作用于**当前目录**；
 *  - 关键实证：把同一 sessionId 用**另一个 cwd** 调 ACP `session/load`，grok 直接返回
 *    `-32603 Path not found (FS_NOT_FOUND)` —— 它是按 `<grok_home>/sessions/<编码cwd>/<sessionId>`
 *    拼路径定位的，**不是全局按 ID 查**。所以光改 cwd 加载是行不通的。
 *
 * 但把目录**物理搬到**目标 cwd 的编码目录下之后，同一 cwd 加载就成功了，并且：
 *  - `sessionDetail.cwd` 报的是**新目录**（grok 以加载参数为准，不看 summary.json 里的旧值）；
 *  - 该会话随后一个真实回合的 `prompt_context.json.working_directory` 也是**新目录** ——
 *    即「后续以新工作目录为工作区」是真的成立，不是只改了显示。
 *
 * 因此本模块只做一件 grok 不提供的搬运：`<编码旧cwd>/<sid>` → `<编码新cwd>/<sid>`。
 *
 * ## 安全与边界
 *  - sessionId 先做 UUID 形态校验（禁分隔符），源/目标路径都用 `relative()` 复核
 *    必须落在 `~/.grok/sessions` 之内，杜绝 `../` 越界。
 *  - **目标已存在同名会话目录时拒绝**，绝不覆盖（同 ID 冲突理论上是 UUID 冲突，宁可失败）。
 *  - 同盘用 `rename`（原子、不复制数据）；跨盘 EXDEV 才退化为「复制 + 删源」。
 *  - 搬完顺手把 `summary.json` 的 `info.cwd`、`prompt_context.json` 的 `working_directory`
 *    改成新目录（best-effort）。grok 自己不会改这两个字段（实测：搬完再跑一回合，
 *    summary.json 的 cwd 仍写着旧路径），留着会让 `grok export` / 会话搜索显示错目录。
 *  - 不碰 `session_search.sqlite`（grok 自有索引，桌面端的搜索是自己扫盘的，不依赖它）。
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

import { resolveGrokHome } from './acp/service'
import { t } from './i18n'
import { encodeSessionDir, encodeSessionDirVariants } from './session-activity'

export interface MoveSessionDataResult {
  ok: boolean
  /** 原目录（会话搬走前的位置） */
  fromDir?: string
  /** 新目录 */
  toDir?: string
  /** 为什么没搬成（ok=false 时） */
  reason?: 'invalid-id' | 'not-found' | 'target-missing' | 'same-dir' | 'collision' | 'error'
  /** 可直接展示给用户的补充说明 */
  detail?: string
}

/** 会话 id 只允许 UUID 形态：16 进制 + 连字符。任何含分隔符的输入直接拒掉 */
function isSafeSessionId(id: string): boolean {
  return /^[0-9a-fA-F][0-9a-fA-F-]{7,63}$/.test(id)
}

/** 目标路径必须落在 sessionsRoot 之内（防 `../` 越界） */
function insideRoot(root: string, target: string): boolean {
  const rel = relative(root, target)
  return !!rel && !rel.startsWith('..') && !isAbsolute(rel) && !rel.includes('..')
}

/**
 * 目标工作目录用哪个编码目录名：
 * 若该目录已经有 grok 建的编码目录（可能来自另一种分隔符写法），沿用它的；
 * 否则用标准编码命名。这样同目录下不会分裂出两个编码目录。
 */
function pickTargetDirName(sessionsRoot: string, toCwd: string): string {
  const variants = encodeSessionDirVariants(toCwd)
  for (const v of variants) {
    if (existsSync(join(sessionsRoot, v))) return v
  }
  return encodeSessionDir(toCwd)
}

/** best-effort 改写会话元数据里记录的 cwd，让磁盘上的记录与新目录一致 */
function patchRecordedCwd(sessionDir: string, toCwd: string): void {
  // summary.json: { info: { cwd } , ... }
  try {
    const p = join(sessionDir, 'summary.json')
    if (existsSync(p)) {
      const raw = JSON.parse(readFileSync(p, 'utf8')) as { info?: { cwd?: string } }
      if (raw?.info && typeof raw.info === 'object') {
        raw.info.cwd = toCwd
        writeFileSync(p, JSON.stringify(raw, null, 2), 'utf8')
      }
    }
  } catch {
    // 解析/写入失败不影响搬移结果，忽略
  }
  // prompt_context.json: { working_directory }（每回合会被 grok 重写，这里只是保持一致）
  try {
    const p = join(sessionDir, 'prompt_context.json')
    if (existsSync(p)) {
      const raw = JSON.parse(readFileSync(p, 'utf8')) as { working_directory?: string }
      if (raw && typeof raw === 'object') {
        raw.working_directory = toCwd
        writeFileSync(p, JSON.stringify(raw, null, 2), 'utf8')
      }
    }
  } catch {
    // 同上
  }
}

export async function moveSessionData(args: {
  sessionId: string
  fromCwd: string
  toCwd: string
}): Promise<MoveSessionDataResult> {
  const { sessionId, fromCwd, toCwd } = args ?? ({} as never)
  if (!sessionId || !isSafeSessionId(sessionId)) {
    return { ok: false, reason: 'invalid-id', detail: t('mainErrors.sessionMove.invalidId') }
  }
  if (!fromCwd || !toCwd) {
    return { ok: false, reason: 'error', detail: t('mainErrors.sessionMove.missingCwd') }
  }
  if (resolve(fromCwd) === resolve(toCwd)) {
    return { ok: false, reason: 'same-dir', detail: t('mainErrors.sessionMove.sameDir') }
  }

  // 目标目录必须真实存在：否则 grok 后续加载会直接 FS_NOT_FOUND
  try {
    if (!statSync(toCwd).isDirectory()) {
      return {
        ok: false,
        reason: 'target-missing',
        detail: t('mainErrors.sessionMove.targetNotDir', { path: toCwd })
      }
    }
  } catch {
    return {
      ok: false,
      reason: 'target-missing',
      detail: t('mainErrors.sessionMove.targetMissing', { path: toCwd })
    }
  }

  const sessionsRoot = resolve(join(resolveGrokHome(), 'sessions'))

  // 找源码目录：cwd 的分隔符写法可能有多种，逐个试探
  let fromDir: string | null = null
  let fromDirName = ''
  for (const dirName of encodeSessionDirVariants(fromCwd)) {
    const candidate = resolve(join(sessionsRoot, dirName, sessionId))
    if (!insideRoot(sessionsRoot, candidate)) continue
    if (existsSync(candidate) && statSync(candidate).isDirectory()) {
      fromDir = candidate
      fromDirName = dirName
      break
    }
  }
  if (!fromDir) {
    return {
      ok: false,
      reason: 'not-found',
      detail: t('mainErrors.sessionMove.notFound')
    }
  }

  const toDir = resolve(join(sessionsRoot, pickTargetDirName(sessionsRoot, toCwd), sessionId))
  if (!insideRoot(sessionsRoot, toDir)) {
    return { ok: false, reason: 'error', detail: t('mainErrors.sessionMove.outOfBounds') }
  }
  if (resolve(fromDir) === resolve(toDir)) {
    return { ok: true, fromDir, toDir, detail: 'already' }
  }
  // 绝不覆盖：同名会话已在目标目录下（理论上是 UUID 冲突）
  if (existsSync(toDir)) {
    return {
      ok: false,
      reason: 'collision',
      detail: t('mainErrors.sessionMove.collision', { path: toDir })
    }
  }

  try {
    mkdirSync(resolve(join(sessionsRoot, pickTargetDirName(sessionsRoot, toCwd))), { recursive: true })
    try {
      renameSync(fromDir, toDir)
    } catch {
      // 跨盘（EXDEV）才走复制 + 删源
      cpSync(fromDir, toDir, { recursive: true })
      rmSync(fromDir, { recursive: true, force: true })
    }
  } catch (err) {
    return {
      ok: false,
      reason: 'error',
      detail: t('mainErrors.sessionMove.failed', {
        message: err instanceof Error ? err.message : String(err)
      })
    }
  }

  // 搬移成功后，原编码目录若已空则顺手清掉（避免会话列表里残留空的临时工作目录）。
  // ⚠️ 只删**空目录**：grok 会在编码目录下放 permission.toml / prompt_history.jsonl，
  //    有这些文件的目录不是空的，绝不能删。
  try {
    const fromParent = resolve(join(sessionsRoot, fromDirName))
    if (insideRoot(sessionsRoot, fromParent) && existsSync(fromParent)) {
      if (readdirSync(fromParent).length === 0) rmSync(fromParent, { recursive: false, force: true })
    }
  } catch {
    // 清理失败不影响搬移结果
  }

  patchRecordedCwd(toDir, toCwd)
  return { ok: true, fromDir, toDir }
}
