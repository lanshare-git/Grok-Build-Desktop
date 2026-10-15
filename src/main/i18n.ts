/**
 * 主进程 i18n：模块级当前语言 + 绑定它的 t()。
 *
 * 生命周期：index.ts 在 app ready 后调 initLocale()（读 config.json，
 * null = 跟随系统，用 app.getLocale() 归一）；切换语言时 ipc.ts 的
 * localeSet handler 调 setCurrentLocale() 并联动托盘重建。
 */

import { app } from 'electron'

import {
  resolveLocale,
  t as tShared,
  type Locale,
  type MessageKey,
  type MessageVars
} from '../shared/i18n'
import { readConfig } from './config'

let current: Locale = 'zh-CN'

export function initLocale(): Locale {
  current = readConfig().locale ?? resolveLocale(app.getLocale())
  return current
}

/** 切换语言；传 null 表示「跟随系统」，返回归一后的实际语言 */
export function setCurrentLocale(locale: Locale | null): Locale {
  current = locale ?? resolveLocale(app.getLocale())
  return current
}

export function getCurrentLocale(): Locale {
  return current
}

export function t(key: MessageKey, vars?: MessageVars): string {
  return tShared(current, key, vars)
}
