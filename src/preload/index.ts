import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

import { CH } from '../shared/channels'
import type { GrokDesktopApi } from '../shared/api'
import type {
  AcpStreamEvent,
  ConnectionEvent,
  NewSessionOptions,
  PermissionRequestEvent
} from '../shared/types'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.off(channel, listener)
  }
}

const api: GrokDesktopApi = {
  start: () => ipcRenderer.invoke(CH.agentStart),
  status: () => ipcRenderer.invoke(CH.agentStatus),
  stop: () => ipcRenderer.invoke(CH.agentStop),

  newSession: (options: NewSessionOptions) => ipcRenderer.invoke(CH.agentNewSession, options),
  loadSession: (sessionId: string, cwd: string) =>
    ipcRenderer.invoke(CH.agentLoadSession, { sessionId, cwd }),
  prompt: (sessionId: string, text: string, images?: Array<{ data: string; mimeType: string; name?: string }>) =>
    ipcRenderer.invoke(CH.agentPrompt, { sessionId, text, images }),
  cancel: (sessionId: string) => ipcRenderer.invoke(CH.agentCancel, { sessionId }),
  ensureSession: (sessionId: string, cwd: string) =>
    ipcRenderer.invoke(CH.agentEnsureSession, { sessionId, cwd }),
  setConfigOption: (sessionId: string, configId: string, value: string) =>
    ipcRenderer.invoke(CH.agentSetConfig, { sessionId, configId, value }),
  respondPermission: (requestId: number, optionId: string | null) =>
    ipcRenderer.invoke(CH.agentPermissionResponse, { requestId, optionId }),

  diagnostics: () => ipcRenderer.invoke(CH.diagnosticsRun),
  pickDirectory: () => ipcRenderer.invoke(CH.pickDirectory),
  appInfo: () => ipcRenderer.invoke(CH.appInfo),
  openExternal: (url: string) => ipcRenderer.invoke(CH.openExternal, url),
  screenshotSnip: () => ipcRenderer.invoke(CH.screenshotSnip),

  getProxy: () => ipcRenderer.invoke(CH.proxyGet),
  setProxy: (proxy: string | null) => ipcRenderer.invoke(CH.proxySet, { proxy }),
  detectProxy: () => ipcRenderer.invoke(CH.proxyDetect),

  onStream: (cb: (event: AcpStreamEvent) => void) => subscribe(CH.pushStream, cb),
  onState: (cb: (event: ConnectionEvent) => void) => subscribe(CH.pushState, cb),
  onPermission: (cb: (event: PermissionRequestEvent) => void) => subscribe(CH.pushPermission, cb),
  onLog: (cb: (line: string) => void) => subscribe(CH.pushLog, cb)
}

contextBridge.exposeInMainWorld('grok', api)
