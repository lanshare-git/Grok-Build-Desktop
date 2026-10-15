import type { Messages } from './zh-cn'
import { common } from './en/common'
import { chat } from './en/chat'
import { tray } from './en/tray'
import { permissionMode } from './en/permissionMode'
import { density } from './en/density'
import { sidebar } from './en/sidebar'
import { welcome } from './en/welcome'
import { sessionTools } from './en/sessionTools'
import { composer } from './en/composer'
import { header } from './en/header'
import { prompts } from './en/prompts'
import { settings } from './en/settings'
import { accountMenu } from './en/accountMenu'
import { dialogs } from './en/dialogs'
import { panels } from './en/panels'
import { tool } from './en/tool'
import { plan } from './en/plan'
import { diagChecks } from './en/diagChecks'
import { mainErrors } from './en/mainErrors'

/** 英文字典：`: Messages` 强制与 zh-CN 键对齐，缺键即编译错 */
export const en: Messages = {
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
