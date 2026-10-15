/**
 * 渲染进程 i18n 入口。
 *
 * useT() 绑定 store.locale：语言切换时 store.setLocale 触发重渲染，
 * 所有使用 useT 的组件随之换新文案，无需重启。
 */

import { useCallback } from 'react'

import {
  LOCALE_OPTIONS,
  resolveLocale,
  t as tShared,
  type Locale,
  type MessageKey,
  type MessageVars
} from '@shared/i18n'
import { useStore } from './store'

export { LOCALE_OPTIONS, resolveLocale }
export type { Locale, MessageKey, MessageVars }

export function useLocale(): Locale {
  return useStore((s) => s.locale)
}

/** 绑定当前语言的 t() 翻译函数 */
export function useT(): (key: MessageKey, vars?: MessageVars) => string {
  const locale = useStore((s) => s.locale)
  return useCallback((key, vars) => tShared(locale, key, vars), [locale])
}
