/**
 * 屏幕右下角置顶授权浮窗。
 *
 * 应用内 ToastStack 只在主窗口里，最小化后看不见；Electron 33 的系统通知
 * 在 Windows 上又不支持带按钮。所以后台 / 非当前会话的待授权改弹这个独立小窗：
 * 用户可直接点允许/拒绝，无需把主窗口唤回来。
 */

import { app, BrowserWindow, screen } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { MessageKey } from '../shared/i18n'
import { localizePermissionOption, isDenyPermissionOption } from '../shared/permission-labels'
import { t } from './i18n'

/** 浮窗抬头品牌名（对齐 Codex 浮窗的「ChatGPT」） */
const BRAND_NAME = 'Grok Build'

export interface DesktopToastOption {
  optionId: string
  name?: string
  kind?: string
}

export interface DesktopPermToast {
  requestId: number
  sessionId: string
  toolLabel: string
  options: DesktopToastOption[]
}

interface OpenToast {
  win: BrowserWindow
  sessionId: string
}

const MARGIN = 12
/** 卡片内容宽；窗外再留 SHADOW_PAD 给投影，避免被透明窗裁掉 */
const CARD_WIDTH = 420
const SHADOW_PAD = 10
const WIDTH = CARD_WIDTH + SHADOW_PAD * 2
const openToasts = new Map<number, OpenToast>()

let cachedLogoDataUri: string | null = null

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function toastPreloadPath(): string {
  return join(__dirname, '../preload/toast.js')
}

/** 与托盘/窗口同一条 build/ 通道；读成 data URI 嵌进浮窗（CSP 仅放行 img-src data:） */
function toastLogoDataUri(): string {
  if (cachedLogoDataUri) return cachedLogoDataUri
  try {
    const dir = app.isPackaged ? join(process.resourcesPath, 'build') : join(__dirname, '../../build')
    const buf = readFileSync(join(dir, 'icon.png'))
    cachedLogoDataUri = `data:image/png;base64,${buf.toString('base64')}`
  } catch {
    cachedLogoDataUri = ''
  }
  return cachedLogoDataUri
}

function buildHtml(payload: DesktopPermToast): string {
  const badge = escapeHtml(t('prompts.perm.badge'))
  const title = escapeHtml(t('prompts.perm.title'))
  const wantPre = escapeHtml(t('prompts.perm.wantPre'))
  const wantPost = escapeHtml(t('prompts.perm.wantPost'))
  const tool = escapeHtml(payload.toolLabel)
  const openApp = escapeHtml(t('prompts.toast.openApp'))
  const disableToasts = escapeHtml(t('settings.general.desktopPermToast.disableFromToast'))
  const closeLabel = escapeHtml(t('common.close'))
  const brand = escapeHtml(BRAND_NAME)
  const logo = toastLogoDataUri()
  const logoHtml = logo
    ? `<img class="logo" src="${logo}" alt="" width="18" height="18" draggable="false" />`
    : ''

  const hasDeny = payload.options.some((o) => isDenyPermissionOption(o))
  const buttons = [
    ...payload.options.map((opt) => {
      const label = escapeHtml(localizePermissionOption(opt, (k) => t(k as MessageKey)))
      const deny = isDenyPermissionOption(opt)
      const cls = deny ? 'btn ghost' : 'btn primary'
      return `<button type="button" class="${cls}" data-option="${escapeHtml(opt.optionId)}" title="${label}">${label}</button>`
    }),
    // agent 已带拒绝选项时不再叠裸「拒绝」
    ...(hasDeny
      ? []
      : [
          `<button type="button" class="btn ghost" data-option="" title="${escapeHtml(t('prompts.perm.reject'))}">${escapeHtml(t('prompts.perm.reject'))}</button>`
        ])
  ].join('')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:" />
<title>${title}</title>
<style>
  :root {
    color-scheme: light;
    --bg: #ffffff;
    --text: #1a1d23;
    --muted: #6b7280;
    --line: #e5e7eb;
    --warn: #b45309;
    --warn-soft: #fdf4e7;
    --ink: #1f2937;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    background: transparent;
    font: 13px/1.45 -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    color: var(--text);
    overflow: hidden;
    user-select: none;
  }
  body {
    padding: ${SHADOW_PAD}px;
  }
  .card {
    margin: 0;
    padding: 14px 14px 12px;
    width: ${CARD_WIDTH}px;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 10px;
    /* 对齐 Codex：一圈克制软阴影，不要多层重影 */
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }
  .logo {
    flex: 0 0 auto;
    width: 18px;
    height: 18px;
    border-radius: 4px;
    display: block;
  }
  .brand-name {
    flex: 1 1 auto;
    min-width: 0;
    font-weight: 600;
    font-size: 13px;
    color: var(--text);
    letter-spacing: -0.01em;
  }
  .close {
    flex: 0 0 auto;
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    padding: 0;
  }
  .close:hover { background: #f3f4f6; color: var(--text); }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }
  .badge {
    flex: 0 0 auto;
    font-size: 11px;
    font-weight: 600;
    color: var(--warn);
    background: var(--warn-soft);
    padding: 2px 7px;
    border-radius: 999px;
  }
  .title {
    flex: 1 1 auto;
    min-width: 0;
    font-weight: 600;
    font-size: 13px;
  }
  .sub {
    color: var(--muted);
    font-size: 12.5px;
    margin-bottom: 12px;
    word-break: break-word;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .sub strong { color: var(--text); font-weight: 600; }
  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .btn {
    appearance: none;
    border-radius: 8px;
    border: 1px solid transparent;
    padding: 8px 8px;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    line-height: 1.25;
    width: 100%;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .btn.primary {
    background: var(--ink);
    color: #fff;
  }
  .btn.primary:hover { filter: brightness(1.08); }
  .btn.ghost {
    background: #fff;
    border-color: var(--line);
    color: var(--text);
  }
  .btn.ghost:hover { background: #f3f4f6; }
  .btn:disabled { opacity: .55; cursor: default; }
  .footer {
    margin-top: 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .link {
    background: none;
    border: none;
    color: #2563eb;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    padding: 0;
  }
  .link.muted { color: var(--muted); }
  .link:hover { text-decoration: underline; }
  .link:disabled { opacity: .55; cursor: default; text-decoration: none; }
</style>
</head>
<body>
  <div class="card" id="card">
    <div class="brand">
      ${logoHtml}
      <span class="brand-name">${brand}</span>
      <button type="button" class="close" id="closeBtn" title="${closeLabel}" aria-label="${closeLabel}">×</button>
    </div>
    <div class="head">
      <span class="badge">${badge}</span>
      <span class="title">${title}</span>
    </div>
    <div class="sub">${wantPre}<strong>${tool}</strong>${wantPost}</div>
    <div class="actions" id="actions">${buttons}</div>
    <div class="footer">
      <button type="button" class="link muted" id="disableToasts">${disableToasts}</button>
      <button type="button" class="link" id="openApp">${openApp}</button>
    </div>
  </div>
  <script>
    const requestId = ${JSON.stringify(payload.requestId)};
    const sessionId = ${JSON.stringify(payload.sessionId)};
    const actions = document.getElementById('actions');
    const setBusy = () => {
      for (const b of actions.querySelectorAll('button')) b.disabled = true;
      document.getElementById('openApp').disabled = true;
      document.getElementById('disableToasts').disabled = true;
      document.getElementById('closeBtn').disabled = true;
    };
    actions.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-option]');
      if (!btn || !window.grokToast) return;
      setBusy();
      const raw = btn.getAttribute('data-option');
      const optionId = raw === '' || raw == null ? null : raw;
      window.grokToast.decide(requestId, optionId);
    });
    document.getElementById('openApp').addEventListener('click', () => {
      if (!window.grokToast) return;
      window.grokToast.openApp(sessionId);
    });
    document.getElementById('disableToasts').addEventListener('click', () => {
      if (!window.grokToast) return;
      setBusy();
      window.grokToast.disableToasts();
    });
    document.getElementById('closeBtn').addEventListener('click', () => {
      if (!window.grokToast) return;
      window.grokToast.dismiss(requestId);
    });
  </script>
</body>
</html>`
}

function placeWindow(win: BrowserWindow, index: number): void {
  const area = screen.getPrimaryDisplay().workArea
  const [w, h] = win.getSize()
  const x = Math.round(area.x + area.width - w - MARGIN)
  const y = Math.round(area.y + area.height - h - MARGIN - index * (h + 8))
  win.setPosition(x, Math.max(area.y + MARGIN, y))
}

async function fitAndPlace(win: BrowserWindow, stackIndex: number): Promise<void> {
  if (win.isDestroyed()) return
  try {
    // 量 body 总高（含 SHADOW_PAD），阴影才不会被透明窗裁掉
    const height = await win.webContents.executeJavaScript(
      `Math.ceil(document.body.getBoundingClientRect().height)`
    )
    if (typeof height === 'number' && height > 0 && !win.isDestroyed()) {
      win.setContentSize(WIDTH, Math.ceil(height))
    }
  } catch {
    /* 测量失败就用初始高度 */
  }
  if (!win.isDestroyed()) placeWindow(win, stackIndex)
}

/** 弹出（或刷新）某条授权的桌面浮窗 */
export function showDesktopPermToast(payload: DesktopPermToast): void {
  closeDesktopPermToast(payload.requestId)

  // 先给够高，load 完再按内容收紧并贴底——避免按钮被裁切、也避免「窗体虚高」看起来飘在上面
  const win = new BrowserWindow({
    width: WIDTH,
    height: 360,
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    webPreferences: {
      preload: toastPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.setAlwaysOnTop(true, 'pop-up-menu')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  const html = buildHtml(payload)
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

  win.webContents.once('did-finish-load', () => {
    void (async () => {
      if (win.isDestroyed()) return
      const index = [...openToasts.keys()].indexOf(payload.requestId)
      await fitAndPlace(win, Math.max(0, index))
      if (!win.isDestroyed()) win.show()
    })()
  })

  win.on('closed', () => {
    if (openToasts.get(payload.requestId)?.win === win) {
      openToasts.delete(payload.requestId)
    }
    relayoutToasts()
  })

  openToasts.set(payload.requestId, { win, sessionId: payload.sessionId })
}

function relayoutToasts(): void {
  let i = 0
  for (const { win } of openToasts.values()) {
    if (!win.isDestroyed()) {
      placeWindow(win, i)
      i += 1
    }
  }
}

export function closeDesktopPermToast(requestId: number): void {
  const entry = openToasts.get(requestId)
  if (!entry) return
  openToasts.delete(requestId)
  if (!entry.win.isDestroyed()) entry.win.close()
  relayoutToasts()
}

export function closeAllDesktopPermToasts(): void {
  for (const id of [...openToasts.keys()]) closeDesktopPermToast(id)
}

export function listOpenPermToastRequestIdsForSession(sessionId: string): number[] {
  const ids: number[] = []
  for (const [requestId, entry] of openToasts) {
    if (entry.sessionId === sessionId) ids.push(requestId)
  }
  return ids
}
