/**
 * 把 agent 返回的授权选项名映射为界面语言文案。
 * 主进程桌面浮窗与渲染层 PermissionPanel 共用，避免两套规则漂移。
 */

export interface PermissionOptionLike {
  name?: string
  kind?: string
}

export function localizePermissionOption(
  opt: PermissionOptionLike,
  t: (key: string) => string
): string {
  const name = opt.name ?? ''
  const kind = (opt.kind ?? '').toLowerCase()
  if (kind === 'allow_once') return t('prompts.perm.allowOnce')
  if (kind === 'allow_always') return t('prompts.perm.allowAlways')
  if (kind === 'reject_once') return t('prompts.perm.rejectOnce')
  if (kind === 'reject_always') return t('prompts.perm.rejectAlways')
  const n = name.toLowerCase()
  if (/don'?t ask again for bash/.test(n)) return t('prompts.perm.allowSameBash')
  if (/tell grok|do differently/.test(n)) return t('prompts.perm.rejectTellGrok')
  if (/don'?t ask again/.test(n)) return t('prompts.perm.rejectNoAsk')
  if (/^(yes|allow|proceed|approve)/.test(n)) return t('prompts.perm.allow')
  if (/^(no|deny|reject)/.test(n)) return t('prompts.perm.reject')
  return name || opt.kind || '—'
}

export function isDenyPermissionOption(opt: PermissionOptionLike): boolean {
  return /deny|reject|no/i.test(opt.kind ?? opt.name ?? '')
}
