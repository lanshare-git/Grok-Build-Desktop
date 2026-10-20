import type { Messages } from './zh-cn'
import { common } from './ja/common'
import { chat } from './ja/chat'
import { tray } from './ja/tray'
import { permissionMode } from './ja/permissionMode'
import { density } from './ja/density'
import { sidebar } from './ja/sidebar'
import { welcome } from './ja/welcome'
import { sessionTools } from './ja/sessionTools'
import { composer } from './ja/composer'
import { bgTasks } from './ja/bgTasks'
import { header } from './ja/header'
import { prompts } from './ja/prompts'
import { settings } from './ja/settings'
import { accountMenu } from './ja/accountMenu'
import { dialogs } from './ja/dialogs'
import { panels } from './ja/panels'
import { tool } from './ja/tool'
import { plan } from './ja/plan'
import { diagChecks } from './ja/diagChecks'
import { mainErrors } from './ja/mainErrors'

/** 日文字典：`: Messages` 强制与 zh-CN 键对齐，缺键即编译错 */
export const ja: Messages = {
  common,
  chat,
  tray,
  permissionMode,
  density,
  sidebar,
  welcome,
  sessionTools,
  composer,
  bgTasks,
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
