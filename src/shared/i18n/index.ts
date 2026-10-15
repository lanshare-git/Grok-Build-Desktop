/**
 * i18n 核心：字典 + t() + resolveLocale() + 类型级键检查。
 *
 * MessageKey 为所有叶子路径的联合类型；拼错/路径到中间节点 → TypeScript 报错。
 */

import { zhCN } from './dict/zh-cn'
import type { Messages } from './dict/zh-cn'
import { en } from './dict/en'
import { ja } from './dict/ja'
import type { Locale, MessageVars } from './types'

export type { Locale, MessageVars } from './types'
export type { Messages } from './dict/zh-cn'

const DICTS: Record<Locale, Messages> = { 'zh-CN': zhCN, en, ja }

/* ------------------------------------------------------------------ *
 *  MessageKey：递归遍历 Messages 到叶子，生成点路径联合。
 *  用 MessageLeaf 先截断函数和字符串，避免进入 function 的原型链属性。
 * ------------------------------------------------------------------ */

type Leaf = string | ((vars: any) => string)

type Paths<T> = T extends Leaf
  ? never
  : {
      [K in keyof T & string]: T[K] extends Leaf
        ? K
        : `${K}.${Paths<T[K]>}`
    }[keyof T & string]

export type MessageKey = Paths<Messages>

/* ------------------------------------------------------------------ *
 *  resolveLocale：把任意 locale 字符串归一到三档。
 * ------------------------------------------------------------------ */

export function resolveLocale(raw: string | null | undefined): Locale {
  const v = (raw ?? '').toLowerCase()
  if (v.startsWith('zh')) return 'zh-CN'
  if (v.startsWith('ja')) return 'ja'
  return 'en'
}

/** 语言选项（label 用自称） */
export const LOCALE_OPTIONS: ReadonlyArray<{ value: Locale; label: string }> = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' }
]

/* ------------------------------------------------------------------ *
 *  t()：点路径取值 → {var} 插值 → 函数值调用 → 回退 zh-CN → 回退 key 本身。
 * ------------------------------------------------------------------ */

function lookup(dict: unknown, key: string): unknown {
  let cur: unknown = dict
  for (const seg of key.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[seg]
  }
  return cur
}

export function t(locale: Locale, key: MessageKey, vars?: MessageVars): string {
  const raw = lookup(DICTS[locale] ?? zhCN, key) ?? lookup(zhCN, key)
  if (typeof raw === 'function') return (raw as (v: MessageVars) => string)(vars ?? {})
  if (typeof raw === 'string') {
    return vars ? raw.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : raw
  }
  return key
}
