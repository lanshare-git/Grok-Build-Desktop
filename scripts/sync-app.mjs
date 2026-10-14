#!/usr/bin/env node
/**
 * 同步免安装绿版到 app/
 *
 * 拷贝内容：
 *  1. dist/win-unpacked/resources/app.asar  应用代码
 *  2. dist/win-unpacked/Grok Build Desktop.exe  主程序（内嵌 asar 完整性哈希，必须与 asar 成对）
 *  3. dist/win-unpacked/resources/build/*  图标与托盘图（asar 之外的资源，由 gen:icons 生成，
 *     内容会变；漏同步会导致窗口图标陈旧、托盘图标缺失）
 *
 * 等价于之前手敲的几行 cp，但多了：运行态检测、目录创建、成对大小校验。
 * 用法：node scripts/sync-app.mjs   （或 npm run sync-app / npm run deploy）
 */
import { existsSync, copyFileSync, statSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const SRC_EXE = resolve(root, 'dist/win-unpacked/Grok Build Desktop.exe')
const SRC_ASAR = resolve(root, 'dist/win-unpacked/resources/app.asar')
const DST_EXE = resolve(root, 'app/Grok Build Desktop.exe')
const DST_ASAR = resolve(root, 'app/resources/app.asar')
/** asar 之外的图标资源（extraResources 把 build/ 拷到 resources/build/） */
const SRC_BUILD = resolve(root, 'dist/win-unpacked/resources/build')
const DST_BUILD = resolve(root, 'app/resources/build')

function fail(msg) {
  console.error('✖ ' + msg)
  process.exit(1)
}

// 1. 源必须存在（先 npm run pack / dist）
if (!existsSync(SRC_EXE)) {
  fail('找不到打包产物：\n  ' + SRC_EXE + '\n  请先运行 npm run pack（或 npm run dist）')
}
if (!existsSync(SRC_ASAR)) {
  fail('找不到 app.asar：\n  ' + SRC_ASAR + '\n  请先运行 npm run pack')
}

// 2. 运行态检测：app 正运行时文件被占用，拷贝必失败，先提醒关闭
if (process.platform === 'win32') {
  const out = spawnSync('tasklist', ['/FI', 'IMAGENAME eq Grok Build Desktop.exe'], { encoding: 'utf8' })
  if (out.stdout && /Grok Build Desktop\.exe/i.test(out.stdout)) {
    fail('应用正在运行，app/ 文件被占用无法覆盖。\n  请先关闭「Grok Build Desktop」后再执行（tasklist 已检测到进程）。')
  }
}

// 3. 创建目标目录（app/ 可能不存在）
mkdirSync(dirname(DST_EXE), { recursive: true })
mkdirSync(dirname(DST_ASAR), { recursive: true })

// 4. 成对拷贝
//    ⚠️ 不要用 mtime 判断成败：Windows 上 copyFileSync 走 CopyFileW，会把**源文件的 mtime**
//    带过去，复制后目标 mtime 可能比复制前更旧（曾因此误报「icon 拷贝失败」并中断后续同步）。
//    改为校验大小，小文件再比一次内容哈希。
const sha1 = (p) => createHash('sha1').update(readFileSync(p)).digest('hex')
function copy(label, src, dst) {
  copyFileSync(src, dst)
  const s = statSync(src)
  const d = statSync(dst)
  if (s.size !== d.size) fail(`${label} 拷贝后大小不一致（${s.size} ≠ ${d.size}）：${dst}`)
  if (s.size <= 4 * 1024 * 1024 && sha1(src) !== sha1(dst)) fail(label + ' 拷贝后内容不一致：' + dst)
  console.log('✔ ' + label + '  →  ' + dst)
}
copy('exe ', SRC_EXE, DST_EXE)
copy('asar', SRC_ASAR, DST_ASAR)

// 5. 同步 asar 之外的图标资源（窗口图标 + 托盘三态图）。
//    历史上只拷 exe + asar，导致 gen:icons 重新生成图标后 app/ 里仍是旧 icon.ico、
//    托盘图整个缺失（托盘显示为空）。只要 build/ 有产物就同步，并逐个校验大小。
if (existsSync(SRC_BUILD)) {
  mkdirSync(DST_BUILD, { recursive: true })
  const files = readdirSync(SRC_BUILD).filter((f) => statSync(join(SRC_BUILD, f)).isFile())
  for (const f of files) {
    copy('asset', join(SRC_BUILD, f), join(DST_BUILD, f))
  }
  console.log('✔ 图标资源  →  ' + DST_BUILD + '（' + files.length + ' 个文件）')
} else {
  console.log('· 跳过图标资源同步（dist 中没有 ' + SRC_BUILD + '）')
}

// 6. 完整性校验：目标与源大小一致
const sExe = statSync(SRC_EXE).size
const dExe = statSync(DST_EXE).size
const sAsar = statSync(SRC_ASAR).size
const dAsar = statSync(DST_ASAR).size
if (sExe !== dExe || sAsar !== dAsar) {
  fail('拷贝后大小不一致，同步不完整（exe ' + sExe + '≠' + dExe + ' / asar ' + sAsar + '≠' + dAsar + '）')
}
console.log(
  '✔ 校验通过  exe ' + (sExe / 1024 / 1024).toFixed(1) + 'MB  ·  asar ' + (sAsar / 1024 / 1024).toFixed(1) + 'MB'
)
console.log('完成：免安装绿版已更新到 app/')
