/**
 * 删除会话在磁盘上的落盘数据。
 *
 * 背景（2026-10-13）：此前「删除会话」只是从应用列表里移除，`~/.grok/sessions`
 * 下的目录原封不动，界面上再也找不到它 —— 用户的原话是「不能直接删除文件吗」。
 * 这里补上真正落盘的删除。
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
 *  - grok 正占用该会话（有 `*.lock` 句柄）时两级都会失败 → 如实返回错误，
 *    由界面提示用户，不做「删一半」的兜底 —— 半删的会话目录比不删更糟。
 */
import { cpSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

import { app, shell } from 'electron'

import { resolveGrokHome } from './acp/service'
import { encodeSessionDirVariants } from './session-activity'

export type DeleteMethod = 'trash' | 'quarantine'

export interface DeleteSessionDataResult {
  /** 是否真的把磁盘目录从原位移走了 */
  ok: boolean
  /** 被删掉的原始目录绝对路径 */
  path?: string
  /** 走的是哪一级删除 */
  method?: DeleteMethod
  /** method='quarantine' 时的落点，供界面提示用户去哪里找回 */
  quarantinePath?: string
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
 * 把目标目录移入应用内回收站。
 * 同盘时 `rename` 是原子的（不复制数据）；跨盘会 EXDEV，退化为「复制 + 删源」。
 * 导出是为了让 `.workbuddy/tmp/delete-e2e.js` 能单独验证这条兜底路径。
 */
export function quarantine(target: string, sessionId: string): string {
  const root = quarantineRoot()
  mkdirSync(root, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dest = join(root, `${stamp}_${sessionId}`)
  try {
    renameSync(target, dest)
  } catch {
    cpSync(target, dest, { recursive: true })
    rmSync(target, { recursive: true, force: true })
  }
  return dest
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
      if (!existsSync(target)) return { ok: true, path: target, method: 'trash' }
      // 二级：应用内回收站（仅当文件确实还在时才走）
    }

    try {
      const dest = quarantine(target, sessionId)
      return { ok: true, path: target, method: 'quarantine', quarantinePath: dest }
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
