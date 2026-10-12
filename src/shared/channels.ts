/** IPC 通道名常量 —— 三端共用，避免字符串漂移 */

export const CH = {
  /* renderer -> main（invoke，有返回值） */
  agentStart: 'agent:start',
  agentStatus: 'agent:status',
  agentNewSession: 'agent:new-session',
  agentLoadSession: 'agent:load-session',
  agentPrompt: 'agent:prompt',
  agentCancel: 'agent:cancel',
  agentEnsureSession: 'agent:ensure-session',
  agentSetConfig: 'agent:set-config',
  agentPermissionResponse: 'agent:permission-response',
  agentStop: 'agent:stop',

  diagnosticsRun: 'diagnostics:run',
  proxyGet: 'proxy:get',
  proxySet: 'proxy:set',
  proxyDetect: 'proxy:detect',
  pickDirectory: 'dialog:pick-directory',
  appInfo: 'app:info',
  openExternal: 'app:open-external',
  screenshotSnip: 'app:screenshot-snip',

  /* main -> renderer（send，单向推送） */
  pushStream: 'push:stream',
  pushState: 'push:state',
  pushPermission: 'push:permission',
  pushLog: 'push:log'
} as const
