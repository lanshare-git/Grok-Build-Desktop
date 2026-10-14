/**
 * 媒体资源桥接：把 grok 下发的媒体地址（file://、本地绝对路径、http(s)、data:）
 * 归一化为渲染进程可加载的 URL，并由 `grok-asset://` 协议处理器在本地磁盘读取文件。
 *
 * 为什么需要它：渲染进程（web 上下文）受 Electron 安全策略限制，无法直接加载
 * `file://` 或本地绝对路径。我们把本地路径编码进 `grok-asset://<base64url>` 这类私有
 * 协议，主进程按 Range 流式读出文件并返回，既能播放视频、也能支持拖动进度条。
 */

import { open } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import { protocol } from 'electron'

/** 扩展名 -> MIME（覆盖 grok 视频/图片生成常见格式） */
const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4',
  '.ogv': 'video/ogg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml'
}

/** 把任意原始地址归一化为可加载的 URL（纯字符串变换，不读文件） */
export function resolveAssetUri(rawUri: string): string {
  if (!rawUri) return ''
  // 这些前缀已可直接加载，原样返回（含自身协议，保证幂等）
  if (/^(https?:|data:|grok-asset:)/i.test(rawUri)) return rawUri

  let p = rawUri
  // 去掉 file:// 前缀（兼容 file:///C:/... 与 file://C:/...）
  if (/^file:\/\//i.test(p)) p = p.slice(p.indexOf('://') + 3)
  // 还原百分号编码（路径里可能含中文/空格）
  try {
    p = decodeURI(p)
  } catch {
    /* 已解码或含非法序列则保持原样 */
  }
  // 统一为正斜杠后再转回 Windows 反斜杠
  p = p.replace(/\//g, '\\')
  // 把 /C:/ 这类形式修正为 C:\
  p = p.replace(/^\\([a-zA-Z]):\\/, '$1:\\')

  return `grok-asset://${Buffer.from(p, 'utf8').toString('base64url')}`
}

/** 注册 `grok-asset://` 协议，按请求 Range 流式读取本地媒体文件 */
export function registerAssetProtocol(): void {
  protocol.handle('grok-asset', async (request) => {
    try {
      const url = new URL(request.url)
      // 主机部分即 base64url 编码的绝对路径（base64url 不含 /，故整段落在 host）
      const path = Buffer.from(url.host, 'base64url').toString('utf8')
      if (!path || !existsSync(path) || !statSync(path).isFile()) {
        return new Response('Not found', { status: 404 })
      }

      const ext = path.slice(path.lastIndexOf('.')).toLowerCase()
      const mime = MIME[ext] || 'application/octet-stream'
      const total = statSync(path).size

      // 解析 Range，支持视频拖动进度
      let start = 0
      let end = total - 1
      const range = request.headers.get('range')
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range)
        if (m) {
          if (m[1]) start = Math.min(parseInt(m[1], 10), total - 1)
          if (m[2]) end = Math.min(parseInt(m[2], 10), total - 1)
        }
      }
      start = Math.max(0, start)
      end = Math.min(end, total - 1)
      const len = end - start + 1

      const fd = await open(path, 'r')
      const buf = Buffer.alloc(len)
      try {
        await fd.read(buf, 0, len, start)
      } finally {
        await fd.close()
      }

      const headers: Record<string, string> = {
        'Content-Type': mime,
        'Content-Length': String(len),
        'Accept-Ranges': 'bytes'
      }
      if (range) {
        headers['Content-Range'] = `bytes ${start}-${end}/${total}`
        return new Response(buf, { status: 206, headers })
      }
      return new Response(buf, { status: 200, headers })
    } catch (err) {
      return new Response(`Asset error: ${(err as Error).message}`, { status: 500 })
    }
  })
}
