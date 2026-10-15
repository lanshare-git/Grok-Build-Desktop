import { common } from './zh-cn/common'
import { chat } from './zh-cn/chat'
import { tray } from './zh-cn/tray'
import { permissionMode } from './zh-cn/permissionMode'
import { density } from './zh-cn/density'
import { sidebar } from './zh-cn/sidebar'
import { welcome } from './zh-cn/welcome'
import { sessionTools } from './zh-cn/sessionTools'
import { composer } from './zh-cn/composer'
import { header } from './zh-cn/header'
import { prompts } from './zh-cn/prompts'
import { settings } from './zh-cn/settings'
import { accountMenu } from './zh-cn/accountMenu'
import { dialogs } from './zh-cn/dialogs'
import { panels } from './zh-cn/panels'
import { tool } from './zh-cn/tool'
import { plan } from './zh-cn/plan'
import { diagChecks } from './zh-cn/diagChecks'
import { mainErrors } from './zh-cn/mainErrors'

/** 中文主字典 —— 类型契约源；en/ja 以 `Messages` 约束键对齐 */
export const zhCN = {
  common,
  chat,
  tray,
  permissionMode,
  density,
  sidebar,
  welcome,
  sessionTools,
  composer,
  header,
  prompts,
  settings,
  accountMenu,
  dialogs,
  panels,
  tool,
  plan,
  diagChecks,
  mainErrors
}

export type Messages = typeof zhCN
