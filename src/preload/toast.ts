/**
 * 桌面授权浮窗专用 preload：只暴露「点选选项 / 关闭」两个动作。
 * 不走完整 window.grok，避免给浮窗多余能力。
 */

import { contextBridge, ipcRenderer } from 'electron'

import { CH } from '../shared/channels'

contextBridge.exposeInMainWorld('grokToast', {
  decide: (requestId: number, optionId: string | null) =>
    ipcRenderer.invoke(CH.toastPermissionDecide, { requestId, optionId }),
  dismiss: (requestId: number) => ipcRenderer.invoke(CH.toastPermissionDismiss, { requestId }),
  openApp: (sessionId: string) => ipcRenderer.invoke(CH.toastOpenApp, { sessionId }),
  /** 关闭右下角授权浮窗提醒（写入设置 desktopPermToast=off） */
  disableToasts: () => ipcRenderer.invoke(CH.desktopPermToastSet, 'off')
})
