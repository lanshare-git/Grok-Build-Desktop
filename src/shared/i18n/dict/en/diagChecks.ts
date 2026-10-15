import type { diagChecks as zh } from '../zh-cn/diagChecks'

export const diagChecks: typeof zh = {
  binary: {
    label: 'grok executable',
    detailMissing: 'Not found',
    hintMissing:
      'Make sure Grok Build is installed, or set the GROK_BIN environment variable to the grok executable.'
  },
  grokHome: {
    label: 'Config directory',
    hintMissing: 'This directory does not exist. Grok Build may not be installed or initialized yet.'
  },
  version: {
    label: 'Grok Build version',
    detailUnknown: 'Unknown'
  },
  auth: {
    label: 'Sign-in status',
    detailMissing: 'auth.json not found',
    hintMissing: 'Run `grok login` in a terminal to sign in; the desktop app reuses it automatically.',
    detailValid: (vars) => `${vars.account} (token valid until ${vars.expiresAt})`,
    detailExpired: (vars) =>
      `${vars.account} (token expired, will auto-refresh; until ${vars.expiresAt})`,
    detailNoAccount: (vars) => `Signed in until ${vars.expiresAt}`,
    hintExpired:
      'Expired tokens are renewed automatically by grok via refresh_token; if that fails, sign in again in a terminal.'
  },
  models: {
    label: 'Available models',
    detailEmpty: 'No model cache found'
  },
  proxy: {
    label: 'Network proxy',
    detail: (vars) => `${vars.proxy} (${vars.detail})`,
    hintUnreachable:
      'The proxy port is unreachable. Make sure the proxy client is running, or use "Auto-detect proxy".',
    detailDirect: 'Not configured, direct connection',
    hintDirect:
      'The model service is overseas. If direct connections time out, configure a proxy below (one-click auto-detect available).'
  },
  network: {
    label: 'Model service connectivity',
    detailViaProxy: (vars) => `Forwarded via ${vars.proxy}`,
    detailProxyDown: 'Proxy unreachable; cannot access the model service',
    hintViaProxy: 'Actual connectivity is confirmed by chat results.',
    hintProxyDown: 'Make the proxy available first, then re-run the check.',
    detailDirect: (vars) => `${vars.endpoint} → ${vars.detail}`,
    hintDirectFail:
      'Cannot reach the model service directly. If you have a proxy client, configure it below or click "Auto-detect proxy".'
  }
}
