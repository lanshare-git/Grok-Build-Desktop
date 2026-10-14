/**
 * 删除会话在磁盘上的落盘数据。
 *
 * 背景（2026-10-13）：此前「删除会话」只是从应用列表里移除，`~/.grok/sessions`
 * 下的目录原封不动，界面上再也找不到它 —— 用户的原话是「不能直接删除文件吗」。
 * 这里补上真正落盘的删除。
 *
 * 背景（2026-10-14）—— 线上事故：会话文件被删了，侧栏条目却还在，点开报
 * `session/load 失败: Path not found`。根因两条，本文件修掉第一条，第二条在渲染层：
 *
 *  1. **成败判定错位**（本文件）：二级删除退化成「复制 + 删源」时，复制已成功、
 *     删源却抛错（grok 仍持有句柄，或目录本身删不掉）。旧代码直接返回 `ok:false`
 *     → 界面提示「磁盘文件没能删掉」并**保留列表条目**，可磁盘上的真数据其实已经被
 *     搬进回收站了 —— 用户看到的与事实相反，之后点开必然 Path not found。
 *     现在一律以「原路径还有没有真数据」定性（`hasSessionData`），异常只作提示。
 *  2. **删除前不卸载会话**（渲染层 Sidebar.runRemoveSession）：grok agent 还持有该
 *     会话时，目录 rename 会被占用拦下；删完 grok 还会把会话目录**重建为空壳**，
 *     留下「看着在、点开报错」的死条目。所以删除前先 `session/close` + 忘记已加载。
 *
 * 两级删除，**都不做不可逆直删**：
 *  1. 首选 `shell.trashItem()` → 系统回收站，用户能在资源管理器里还原。
 *     ⚠️ 它在本机会**假失败**（已成功移入回收站却仍 reject `Operation was aborted`）——
 *     必须按「复查目标是否还在」判断成败，不能只看异常。详见下面的注释。
 *  2. 兜底：移入**应用内回收站** `userData/session-trash/`（同盘 rename，原子、秒完成）。
 *     仅当一级删完目标**确实还在**时才会走到这里（该会话正被 grok 占用等）。
 *
 * 安全策略：
 *  - **路径必须落在 `~/.grok/sessions` 之内**：sessionId 先做 UUID 形态校验（禁止分隔符），
 *    目标路径再用 `relative()` 复核，杜绝 `../` 越界。
 *  - **只删会话目录本身**（`<编码cwd>/<sessionId>`），不碰同级其它会话，
 *    也不动 `session_search.sqlite`（grok 的搜索索引，改它风险大于收益，
 *    留一条失效索引条目对功能无影响）。
 *  - **只清理空壳**：原路径残留的目录只有在「不含任何真数据」时才会被顺手删掉
 *    （`cleanupShell` 只认空目录 / 只剩锁文件的壳，永远不递归删有内容的目录）。
 */
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

import { app, shell } from 'electron'

import { resolveGrokHome } from './acp/service'
import { encodeSessionDirVariants } from './session-activity'

export type DeleteMethod = 'trash' | 'quarantine'

export interface DeleteSessionDataResult {
  /** 是否真的把会话数据从原位移走了（判定口径 = 原路径已无真数据，见 hasSessionData） */
  ok: boolean
  /** 被删掉的原始目录绝对路径 */
  path?: string
  /** 走的是哪一级删除 */
  method?: DeleteMethod
  /** method='quarantine' 时的落点，供界面提示用户去哪里找回 */
  quarantinePath?: string
  /**
   * ok=true 但原路径仍留着一个**不含会话数据**的空壳目录（grok 占用导致目录本身删不掉）。
   * 界面可据此如实提示「已删除，原目录有残留空壳」，而不是含糊其辞。
   */
  staleShell?: string
  /** ok=false 时的原因，可直接展示给用户 */
  error?: string
}

/** 会话 id 只允许 UUID 形态：16 进制 + 连字符。任何含分隔符的输入直接拒掉 */
function isSafeSessionId(id: string): boolean {
  return /^[0-9a-fA-F][0-9a-fA-F-]{7,63}$/.test(id)
}

/** 应用内回收站的根目录（与 ~/.grok 无关，避免污染 grok 自己的目录扫描） */
export function quarantineRoot(): string {
  return join(app.getPath('userData'), 'session-trash')
}

/**
 * 目录里是否还留着**真正的会话数据**。
 *
 * 这是删除成败的唯一判据：会话数据哪怕只剩一个非空文件，也算「没删掉」；
 * 反之只有锁文件 / 空目录 / 都不存在，就算「已删掉」——
 * 之前用「有没有抛异常」判断，才出现「文件已搬走却报删除失败」的反向提示。
 */
function hasSessionData(dir: string): boolean {
  const dataFiles = [
    'chat_history.jsonl',
    'updates.jsonl',
    'events.jsonl',
    'summary.json',
    'prompt_context.json',
    'plan.md',
    'plan.json',
    'compaction'
  ]
  for (const f of dataFiles) {
    try {
      const p = join(dir, f)
      if (!existsSync(p)) continue
      const st = statSync(p)
      if (st.isDirectory()) {
        if (readdirSync(p).length > 0) return true
      } else if (st.size > 0) {
        return true
      }
    } catch {
      // 读不到就当作没有（占用中的文件不该让判定挂掉）
    }
  }
  return false
}

/**
 * 尽力清掉删除后残留的空壳目录。
 *
 * ⚠️ 只处理「不含会话数据」的目录：里面只剩 `*.lock` 之类的碎屑才删，只要发现
 * 任何一个真数据文件就原样留下 —— 这个函数永远不会变成「递归删有内容的目录」。
 */
function cleanupShell(dir: string): boolean {
  try {
    if (!existsSync(dir)) return true
    if (hasSessionData(dir)) return false
    rmSync(dir, { recursive: true, force: true })
    return !existsSync(dir)
  } catch {
    return false
  }
}

/**
 * 把目标目录移入应用内回收站。
 * 同盘时 `rename` 是原子的（不复制数据）；跨盘会 EXDEV，退化为「复制 + 删源」。
 *
 * ⚠️ 退化路径里 **复制成功即视为数据已安全入站**：删源失败只说明原路径还有残留，
 * 由调用方用 `hasSessionData` 定性，绝不再因为「删源抛异常」就整体报失败。
 *
 * 导出是为了让 `.workbuddy/tmp/delete-e2e.js` 能单独验证这条兜底路径。
 */
export function quarantine(
  target: string,
  sessionId: string
): { dest: string; leftover?: string } {
  const root = quarantineRoot()
  mkdirSync(root, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dest = join(root, `${stamp}_${sessionId}`)
  try {
    renameSync(target, dest)
    return { dest }
  } catch {
    cpSync(target, dest, { recursive: true })
    try {
      rmSync(target, { recursive: true, force: true })
    } catch {
      // 数据已在 dest，删源失败只留残留（多半被 grok 占用）——交给调用方定性
    }
    return { dest, leftover: existsSync(target) ? target : undefined }
  }
}

export async function deleteSessionData(
  cwd: string,
  sessionId: string
): Promise<DeleteSessionDataResult> {
  if (!cwd || typeof cwd !== 'string') return { ok: false, error: '会话缺少工作目录' }
  if (!sessionId || !isSafeSessionId(sessionId)) {
    return { ok: false, error: '会话 ID 不合法，已拒绝删除' }
  }

  const sessionsRoot = resolve(join(resolveGrokHome(), 'sessions'))

  for (const dirName of encodeSessionDirVariants(cwd)) {
    const target = resolve(join(sessionsRoot, dirName, sessionId))

    // 越界防护：目标必须是 sessionsRoot 之内的直接子目录
    const rel = relative(sessionsRoot, target)
    if (!rel || rel.startsWith('..') || isAbsolute(rel) || rel.includes('..')) continue
    if (!existsSync(target)) continue
    if (!statSync(target).isDirectory()) continue

    // 一级：系统回收站
    try {
      await shell.trashItem(target)
      return { ok: true, path: target, method: 'trash' }
    } catch {
      // ⚠️ 本机实测（2026-10-13，Electron 33 / Win 10.0.26300）：trashItem
      // **已经把文件移入回收站了，却仍然 reject `Operation was aborted`** —— 假失败。
      // 实测证据：删除后 `~/.grok` 原位置消失，且能在 `C:\$Recycle.Bin\<SID>\` 里
      // 按文件内容搜到对应的 `$R…` 条目。
      // 所以抛错后**必须复查目标是否真的还在**，只看异常会把成功当失败，
      // 从而误落二级兜底（此时 rename 必然 ENOENT，用户会看到「删除失败」但文件已经没了）。
      // 判定同样以「有没有真数据」为准：残留空壳不算没删掉。
      if (!existsSync(target) || !hasSessionData(target)) {
        const staleShell = existsSync(target) ? target : undefined
        if (staleShell) cleanupShell(target)
        return { ok: true, path: target, method: 'trash', staleShell }
      }
      // 二级：应用内回收站（仅当文件确实还在时才走）
    }

    try {
      const { dest, leftover } = quarantine(target, sessionId)
      // 成败只看「原路径还有没有真数据」，不看抛没抛异常
      if (!existsSync(target) || !hasSessionData(target)) {
        const staleShell = cleanupShell(target) ? undefined : leftover ?? target
        return {
          ok: true,
          path: target,
          method: 'quarantine',
          quarantinePath: dest,
          staleShell
        }
      }
      // 真数据仍留在原处（复制件同时已进回收站，没有丢失风险）——这才叫没删掉
      return {
        ok: false,
        path: target,
        error: `删除失败（该会话可能正被 grok 占用）：原目录仍有会话数据。数据副本已存于应用内回收站：${dest}`
      }
    } catch (err) {
      return {
        ok: false,
        path: target,
        error: `删除失败（该会话可能正被 grok 占用）：${err instanceof Error ? err.message : String(err)}`
      }
    }
  }

  // 磁盘上没有对应目录：草稿会话、或已经被删过 —— 不算失败
  return { ok: false, error: 'not-found' }
}
