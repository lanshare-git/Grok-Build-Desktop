/**
 * 生成应用图标：build/icon.ico + build/icon.png + build/tray-*.png（托盘三态）
 *
 *   用法：node scripts/gen-icons.mjs            重新生成（含托盘三态）
 *         node scripts/gen-icons.mjs --check    校验磁盘文件与生成器一致（CI/构建前用）
 *
 * ★ 为什么用代码画图标，而不用设计工具 ★
 * 把 build/ 从「手工二进制资源」变成「确定性脚本产物」：
 *   · 源在代码里 —— 任何人重跑脚本即可复现，不依赖设计工具
 *   · 无随机、无时间戳，两次运行字节完全一致，提交进仓库不会漂移
 *   · `--check` 让「改了生成器却忘了重新生成」在构建期暴露，
 *     而不是等用户看到旧图标才发现
 *
 * 产物：
 *   build/icon.ico              256×256（PNG-in-ICO，Vista+ 与 electron-builder 均支持）
 *   build/icon.png              512×512（Linux 窗口图标 / electron-builder 入口）
 *   build/icons/{size}x{size}.png  Linux deb 桌面图标集（16…512）
 *   build/tray-*.png            32×32 托盘三态（ok 绿 / attention 黄 / error 红）
 *   build/taskbar-badge-*.png   16×16 任务栏角标（unread 蓝 / pending 橙，对齐 Cursor）
 *
 * ⚠️ 这些文件是「生成物」，但必须提交进仓库：
 *   dev 模式（npm run dev）不走打包，src/main/index.ts / src/main/tray.ts 开发态直接读
 *   build/ 下的文件 —— 不提交的话新克隆仓库连图标都没有。
 *
 * ★ 图标内容的来源（重要）★
 * 白色标志（断口环 + 月牙斜划）是 Grok 官方 logo 的有机形状，
 * 参数化逼近只能「神似」——原版斜划下缘有手工设计的钩状内凹，
 * 调参数永远差口气。所以这里直接从设计稿描摹：
 *   scripts/icon-outline.json = 原版 512px PNG 阈值化后的轮廓多边形
 *  （opencv findContours 提取 + approxPolyDP 简化，坐标归一化 0..1）。
 * 填充用 even-odd：所有环一起做射线测试，奇数次命中为内部，
 * 因此外环与洞环无需区分方向。
 * 想换图标 → 换 icon-outline.json（trace-outline 工具链见项目记忆），别手改坐标。
 *
 * ★ 托盘图标设计 ★
 * 迷你应用图标（品牌可辨）+ 右下角状态色 badge（绿/黄/红）。
 * 纯状态圆点在托盘里辨识不出属于哪个应用，所以用 logo 做底。
 * badge 必须带深色描边：Windows 任务栏有深浅两种主题，
 * 没有描边的纯色圆点在浅色主题下几乎看不见。
 */

import { deflateSync } from 'node:zlib'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

// ─────────────────────── PNG 编码 ───────────────────────

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

/** 把 RGBA 像素缓冲编码成 PNG（8 位真彩 + Alpha，无交错） */
function encodePng(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type = RGBA
  const stride = size * 4
  const raw = Buffer.alloc(size * (stride + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filter type 0 (None)
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

/** ICO 容器：Vista 起支持直接内嵌 PNG，electron-builder 也接受 */
function encodeIco(pngBuffer, size) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type = icon
  header.writeUInt16LE(1, 4) // image count

  const entry = Buffer.alloc(16)
  entry[0] = size >= 256 ? 0 : size // 0 表示 256
  entry[1] = size >= 256 ? 0 : size
  entry[2] = 0 // 调色板颜色数（真彩写 0）
  entry[3] = 0 // reserved
  entry.writeUInt16LE(1, 4) // color planes
  entry.writeUInt16LE(32, 6) // bits per pixel
  entry.writeUInt32LE(pngBuffer.length, 8)
  entry.writeUInt32LE(header.length + entry.length, 12)

  return Buffer.concat([header, entry, pngBuffer])
}

// ─────────────────────── 绘制 ───────────────────────

const BG = [8, 9, 11] // 圆角方底色（近黑）
const MARK = [246, 246, 248] // 标志色（近白）
const CORNER = 0.225 // 圆角半径（归一化）

// 描摹轮廓（归一化坐标，even-odd 填充）
const OUTLINE = JSON.parse(readFileSync(join(HERE, 'icon-outline.json'), 'utf8'))

/** 射线法：点是否在多边形内 */
function pointInPoly(px, py, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0]
    const yi = poly[i][1]
    const xj = poly[j][0]
    const yj = poly[j][1]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/**
 * 应用图标：圆角方底 + 描摹标志（even-odd 填充）。
 * SS×SS 超采样做抗锯齿。
 */
function drawAppIcon(size) {
  const SS = 4
  // 预缩放到目标尺寸 + 预计算包围盒（快筛）
  const polys = OUTLINE.polys.map((p) => {
    const scaled = p.map(([x, y]) => [x * size, y * size])
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const [x, y] of scaled) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
    return { poly: scaled, minX, minY, maxX, maxY }
  })

  const out = Buffer.alloc(size * size * 4)

  const inRoundedSquare = (px, py) => {
    // ★ 必须相对中心 c 计算 ★
    // 直接写 Math.abs(px) 会把左上角当成圆角判断的原点，
    // 结果整张图只剩左上角一小块非透明 —— 看起来像「图标只画了一半」。
    const c = size / 2
    const r = CORNER * size
    const dx = Math.max(Math.abs(px - c) - (c - r), 0)
    const dy = Math.max(Math.abs(py - c) - (c - r), 0)
    return Math.hypot(dx, dy) <= r
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let aBg = 0
      let aMark = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS
          const py = y + (sy + 0.5) / SS
          if (!inRoundedSquare(px, py)) continue
          aBg++

          // even-odd：奇数次多边形命中 = 标志内部
          let hits = 0
          for (const b of polys) {
            if (px < b.minX || px > b.maxX || py < b.minY || py > b.maxY) continue
            if (pointInPoly(px, py, b.poly)) hits++
          }
          if (hits & 1) aMark++
        }
      }
      const n = SS * SS
      const bgA = aBg / n
      if (bgA === 0) continue
      const markA = aMark / n
      const o = (y * size + x) * 4
      out[o] = Math.round(BG[0] * (1 - markA) + MARK[0] * markA)
      out[o + 1] = Math.round(BG[1] * (1 - markA) + MARK[1] * markA)
      out[o + 2] = Math.round(BG[2] * (1 - markA) + MARK[2] * markA)
      out[o + 3] = Math.round(bgA * 255)
    }
  }
  return out
}

/**
 * 托盘图标：迷你应用图标（品牌可辨）+ 右下角状态色 badge（深色描边）。
 *
 * badge 描边不是装饰。Windows 任务栏有深浅两种主题，
 * 没有描边的纯色圆点在浅色主题下几乎看不见 ——
 * 「看不见图标」正是托盘图标最常见的问题。
 */
function drawTrayIcon(size, rgb) {
  const base = drawAppIcon(size)
  const SS = 4
  const cx = size * 0.72 - 0.5
  const cy = size * 0.72 - 0.5
  const rFill = size * 0.185
  const rRing = size * 0.25
  const ring = [26, 28, 33]
  const out = Buffer.from(base)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 快筛：像素远离 badge 区域则跳过
      if (Math.hypot(x - cx, y - cy) > rRing + 2) continue
      let f = 0
      let r = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS - 0.5
          const py = y + (sy + 0.5) / SS - 0.5
          const d = Math.hypot(px - cx, py - cx)
          if (d <= rFill) f++
          else if (d <= rRing) r++
        }
      }
      const n = SS * SS
      const cover = (f + r) / n
      if (cover === 0) continue
      const o = (y * size + x) * 4
      // badge 色彩：填充区 = 状态色，描边区 = 深色
      const bw = f + r
      const bR = (f * rgb[0] + r * ring[0]) / bw
      const bG = (f * rgb[1] + r * ring[1]) / bw
      const bB = (f * rgb[2] + r * ring[2]) / bw
      out[o] = Math.round(bR * cover + out[o] * (1 - cover))
      out[o + 1] = Math.round(bG * cover + out[o + 1] * (1 - cover))
      out[o + 2] = Math.round(bB * cover + out[o + 2] * (1 - cover))
      out[o + 3] = Math.round(255 * Math.max(out[o + 3] / 255, cover))
    }
  }
  return out
}

// ─────────────────────── 输出 ───────────────────────

const ICON_SIZE = 256 // ico 内嵌尺寸（electron-builder 要求 ≥256）
const ICON_PNG_SIZE = 512 // Linux 窗口图标 / electron-builder 入口
const LINUX_ICON_SIZES = [16, 32, 48, 64, 128, 256, 512]
const TRAY_SIZE = 32

// 托盘状态角标：就绪态不加绿点（正常即默认外观）；黄/红才打点提醒
const TRAY_BADGE_STATES = {
  attention: [245, 165, 36], // 黄 · 启动中 / 空闲 / 已停止
  error: [229, 72, 77] // 红 · 错误
}

function iconOutputs() {
  return [
    [join(ROOT, 'build', 'icon.ico'), encodeIco(encodePng(ICON_SIZE, drawAppIcon(ICON_SIZE)), ICON_SIZE)],
    [join(ROOT, 'build', 'icon.png'), encodePng(ICON_PNG_SIZE, drawAppIcon(ICON_PNG_SIZE))],
    ...LINUX_ICON_SIZES.map((size) => [
      join(ROOT, 'build', 'icons', `${size}x${size}.png`),
      encodePng(size, drawAppIcon(size))
    ])
  ]
}

function trayOutputs() {
  return [
    // ok：纯品牌图标，不带绿点
    [join(ROOT, 'build', 'tray-ok.png'), encodePng(TRAY_SIZE, drawAppIcon(TRAY_SIZE))],
    ...Object.entries(TRAY_BADGE_STATES).map(([state, rgb]) => [
      join(ROOT, 'build', `tray-${state}.png`),
      encodePng(TRAY_SIZE, drawTrayIcon(TRAY_SIZE, rgb))
    ])
  ]
}

/**
 * 任务栏 overlay 角标：透明底 + 带深色描边的实心圆。
 * Windows `setOverlayIcon` 常用 16×16；描边保证浅色任务栏上也能看见。
 */
function drawOverlayBadge(size, rgb) {
  const SS = 4
  const cx = size / 2 - 0.5
  const cy = size / 2 - 0.5
  const rFill = size * 0.34
  const rRing = size * 0.42
  const ring = [26, 28, 33]
  const out = Buffer.alloc(size * size * 4)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (Math.hypot(x - cx, y - cy) > rRing + 1.5) continue
      let f = 0
      let r = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS - 0.5
          const py = y + (sy + 0.5) / SS - 0.5
          const d = Math.hypot(px - cx, py - cy)
          if (d <= rFill) f++
          else if (d <= rRing) r++
        }
      }
      const n = SS * SS
      const cover = (f + r) / n
      if (cover === 0) continue
      const bw = f + r
      const o = (y * size + x) * 4
      out[o] = Math.round((f * rgb[0] + r * ring[0]) / bw)
      out[o + 1] = Math.round((f * rgb[1] + r * ring[1]) / bw)
      out[o + 2] = Math.round((f * rgb[2] + r * ring[2]) / bw)
      out[o + 3] = Math.round(255 * cover)
    }
  }
  return out
}

// 与侧栏色点一致：蓝=做完未读，橙=要你处理
const BADGE_STATES = {
  unread: [47, 111, 237],
  pending: [180, 83, 9]
}
const BADGE_SIZE = 16

function badgeOutputs() {
  return Object.entries(BADGE_STATES).map(([state, rgb]) => [
    join(ROOT, 'build', `taskbar-badge-${state}.png`),
    encodePng(BADGE_SIZE, drawOverlayBadge(BADGE_SIZE, rgb))
  ])
}

function allOutputs() {
  return [...iconOutputs(), ...trayOutputs(), ...badgeOutputs()]
}

if (process.argv.includes('--check')) {
  const stale = []
  const missing = []
  for (const [file, expect] of allOutputs()) {
    let actual
    try {
      actual = readFileSync(file)
    } catch {
      missing.push(file)
      continue
    }
    if (!actual.equals(expect)) stale.push(file)
  }
  if (missing.length === 0 && stale.length === 0) {
    console.log('图标检查通过：与生成器完全一致。')
    process.exit(0)
  }
  console.error('\n✗ 图标与生成器不一致：\n')
  for (const f of missing) console.error(`  缺失：${f}`)
  for (const f of stale) console.error(`  内容不同：${f}`)
  console.error('\n  修复：node scripts/gen-icons.mjs\n')
  process.exit(1)
}

mkdirSync(join(ROOT, 'build', 'icons'), { recursive: true })
for (const [file, bytes] of allOutputs()) {
  writeFileSync(file, bytes)
  console.log('生成 →', file)
}
