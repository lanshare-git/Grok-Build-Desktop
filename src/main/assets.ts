/**
 * 媒体资源桥接：把 grok 下发的媒体地址（file://、本地绝对路径、http(s)、data:）
 * 归一化为渲染进程可加载的 URL，并由 `grok-asset://` 协议处理器在本地磁盘读取文件。
 *
 * 为什么需要它：渲染进程（web 上下文）受 Electron 安全策略限制，无法直接加载
 * `file://` 或本地绝对路径。我们把本地路径编码进 `grok-asset://<base64url>` 这类私有
 * 协议，主进程按 Range 流式读出文件并返回，既能播放视频、也能支持拖动进度条。
 *
 * http(s) 也走主进程拉取：内网 TFS 附件等需要 NTLM/系统凭证，渲染进程直链会 CORS/401
 * 留下空图框；主进程用 Chromium `net.fetch`（可走系统凭证）拉到临时文件再转 grok-asset。
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { net, protocol } from 'electron'

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

const REMOTE_MAX_BYTES = 25 * 1024 * 1024
/** url → 已缓存的 grok-asset://（进程内复用，避免同一张图反复拉） */
const remoteCache = new Map<string, string>()
/** 同 URL 并发合并为一次拉取 */
const remoteInflight = new Map<string, Promise<string>>()

function sniffMediaMime(buf: Buffer): string | null {
  if (buf.length < 12) return null
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif'
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
    return 'image/webp'
  }
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return 'video/mp4'
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'video/webm'
  // HTML / 登录页 → 不算媒体
  const head = buf.subarray(0, Math.min(64, buf.length)).toString('utf8').trimStart().toLowerCase()
  if (head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('<?xml')) return null
  return null
}

function extForMime(mime: string, url: string): string {
  for (const [ext, m] of Object.entries(MIME)) {
    if (m === mime) return ext
  }
  const fromUrl = /\.(mp4|webm|mov|m4v|ogv|png|jpe?g|gif|webp|avif|bmp|svg)(?:\?|#|$)/i.exec(url)
  if (fromUrl) return `.${fromUrl[1].toLowerCase().replace('jpeg', 'jpg')}`
  return '.bin'
}

function localPathToAsset(p: string): string {
  try {
    if (!existsSync(p) || !statSync(p).isFile()) return ''
  } catch {
    return ''
  }
  return `grok-asset://${Buffer.from(p, 'utf8').toString('base64url')}`
}

/** 把任意原始地址归一化为可加载的 URL（本地路径同步；http 请用 resolveAssetUriAsync） */
export function resolveAssetUri(rawUri: string): string {
  if (!rawUri) return ''
  // data / 已编码协议：原样；http(s) 留给 async 拉（这里原样返回仅作兜底）
  if (/^(data:|grok-asset:)/i.test(rawUri)) return rawUri
  if (/^https?:/i.test(rawUri)) return rawUri

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

  // 本地文件不存在时返回空：渲染层据此不画空占位框（破图框看起来像异常）
  return localPathToAsset(p)
}

async function fetchRemoteMedia(url: string): Promise<string> {
  const cached = remoteCache.get(url)
  if (cached) return cached
  const inflight = remoteInflight.get(url)
  if (inflight) return inflight

  const job = (async (): Promise<string> => {
    try {
      const res = await net.fetch(url, { bypassCustomProtocolHandlers: true })
      if (!res.ok) return ''
      const lenHeader = res.headers.get('content-length')
      if (lenHeader && Number(lenHeader) > REMOTE_MAX_BYTES) return ''

      const buf = Buffer.from(await res.arrayBuffer())
      if (!buf.length || buf.length > REMOTE_MAX_BYTES) return ''

      const headerMime = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
      let mime =
        headerMime.startsWith('image/') || headerMime.startsWith('video/')
          ? headerMime
          : sniffMediaMime(buf)
      // TFS 附件常是 application/octet-stream，靠魔数 / URL 后缀判定
      if (!mime && (headerMime === 'application/octet-stream' || !headerMime)) {
        mime = sniffMediaMime(buf)
      }
      if (!mime) return ''

      const dir = join(tmpdir(), 'grok-build-media')
      mkdirSync(dir, { recursive: true })
      const hash = createHash('sha1').update(url).digest('hex').slice(0, 20)
      const file = join(dir, `${hash}${extForMime(mime, url)}`)
      writeFileSync(file, buf)
      const asset = localPathToAsset(file)
      if (asset) remoteCache.set(url, asset)
      return asset
    } catch {
      return ''
    } finally {
      remoteInflight.delete(url)
    }
  })()

  remoteInflight.set(url, job)
  return job
}

/**
 * 异步归一化：本地路径同 resolveAssetUri；http(s) 由主进程拉取后缓存为 grok-asset://。
 * 拉失败返回空串（渲染层不画空框）。
 */
export async function resolveAssetUriAsync(rawUri: string): Promise<string> {
  if (!rawUri) return ''
  if (/^(data:|grok-asset:)/i.test(rawUri)) return rawUri
  if (/^https?:/i.test(rawUri)) return fetchRemoteMedia(rawUri)
  return resolveAssetUri(rawUri)
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
