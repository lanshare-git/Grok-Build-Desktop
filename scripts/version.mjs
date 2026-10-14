#!/usr/bin/env node
/**
 * 版本管理脚本 —— 本项目唯一的版本号升降入口。
 *
 * 用法：
 *   node scripts/version.mjs                    查看当前版本与最近变更
 *   node scripts/version.mjs patch "修复了xxx"   修订号 +1（0.1.0 → 0.1.1）
 *   node scripts/version.mjs minor "新增了xxx"   次版本号 +1（0.1.0 → 0.2.0）
 *   node scripts/version.mjs major "重构了xxx"   主版本号 +1（0.1.0 → 1.0.0）
 *   node scripts/version.mjs set 1.2.3 "说明"    直接指定版本号
 *
 * 附加选项：
 *   --commit        升完版本自动 git commit（提交信息用「v<版本号>：<说明>」）
 *   --tag           升完版本自动打 git tag v<版本号>
 *   --dry-run       只打印将要发生的改动，不落盘
 *
 * 会同时更新 package.json 与 package-lock.json 的 version 字段，
 * 并在 CHANGELOG.md 顶部插入（或更新）一条记录。
 *
 * 约定：每改动一次功能就要先跑一次本脚本升版本号，再提交 / 打包。
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PKG_PATH = resolve(ROOT, 'package.json')
const LOCK_PATH = resolve(ROOT, 'package-lock.json')
const CHANGELOG_PATH = resolve(ROOT, 'CHANGELOG.md')

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/

/* ---------------------------------- 工具 ---------------------------------- */

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/** 保留原文件的缩进与换行风格，避免升个版本号整个文件都变 diff */
function writeJson(path, data) {
  const raw = readFileSync(path, 'utf8')
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  const indent = raw.match(/\n([ \t]+)"/)?.[1] ?? '  '
  writeFileSync(path, JSON.stringify(data, null, indent) + eol, 'utf8')
}

function bump(version, level) {
  const m = version.match(SEMVER_RE)
  if (!m) throw new Error(`无法解析版本号 "${version}"，期望形如 1.2.3 的三段式数字`)
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (level === 'major') return `${major + 1}.0.0`
  if (level === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

function today() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function git(args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }).trim()
  } catch (err) {
    if (allowFail) return ''
    throw new Error(`git ${args.join(' ')} 失败：${err instanceof Error ? err.message : err}`)
  }
}

const LEVEL_LABEL = { patch: '修订', minor: '新增功能', major: '不兼容改动', set: '指定版本' }

/* ------------------------------- CHANGELOG -------------------------------- */

const CHANGELOG_HEADER = `# 更新日志

本文件记录 Grok Build Desktop 的版本变更，由 \`node scripts/version.mjs\` 自动维护，请勿手工编辑。

版本号语义：**主版本.次版本.修订号**

| 级别 | 含义 |
| --- | --- |
| 修订号 +1（patch） | 修 bug、小调整，用户基本无感 |
| 次版本号 +1（minor） | 新增功能 |
| 主版本号 +1（major） | 不兼容改动 / 大重构 |
`

function upsertChangelog(version, level, note) {
  const heading = `## ${version} - ${today()}`
  const entry = `${heading}\n\n**${LEVEL_LABEL[level] ?? level}**　${note}\n`

  if (!existsSync(CHANGELOG_PATH)) {
    writeFileSync(CHANGELOG_PATH, `${CHANGELOG_HEADER}\n${entry}`, 'utf8')
    return
  }

  let text = readFileSync(CHANGELOG_PATH, 'utf8')
  if (!text.includes('# 更新日志')) {
    text = `${CHANGELOG_HEADER}\n${text.replace(/^\s+/, '')}`
  }

  // 同一版本号只保留一条：重复执行脚本时替换而不是堆叠
  const existing = new RegExp(`^## ${version.replace(/\./g, '\\.')} - \\d{4}-\\d{2}-\\d{2}\\n[\\s\\S]*?(?=^## |$)`, 'm')
  if (existing.test(text)) {
    text = text.replace(existing, `${entry}\n`)
  } else {
    const idx = text.search(/^## /m)
    text = idx === -1 ? `${text.replace(/\s*$/, '')}\n\n${entry}` : `${text.slice(0, idx)}${entry}\n${text.slice(idx)}`
  }

  writeFileSync(CHANGELOG_PATH, text.replace(/\n{3,}/g, '\n\n'), 'utf8')
}

/* --------------------------------- 主流程 --------------------------------- */

function show() {
  const pkg = readJson(PKG_PATH)
  console.log(`当前版本：${pkg.version}　（${pkg.name}）`)
  if (existsSync(CHANGELOG_PATH)) {
    const recent = readFileSync(CHANGELOG_PATH, 'utf8').match(/^## .+$/gm) ?? []
    if (recent.length) {
      console.log('\n最近版本：')
      for (const line of recent.slice(0, 5)) console.log(`  ${line.replace(/^## /, '')}`)
    }
  }
  console.log('\n升版本：node scripts/version.mjs <patch|minor|major|set 版本号> "变更说明" [--commit] [--tag]')
}

/** 拆出位置参数（去掉 --flag 及其后可能跟随的布尔值） */
function parseArgs(argv) {
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) continue
    positional.push(a)
  }
  return positional
}

function main() {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes('--dry-run')
  const wantCommit = argv.includes('--commit')
  const wantTag = argv.includes('--tag')
  const args = parseArgs(argv)

  if (args.length === 0) {
    show()
    return
  }

  const [level, ...rest] = args
  const pkg = readJson(PKG_PATH)
  const current = pkg.version

  let next
  if (level === 'set') {
    next = rest[0]
    if (!next) throw new Error('用法：node scripts/version.mjs set 1.2.3 "变更说明"')
    if (!SEMVER_RE.test(next)) throw new Error(`"${next}" 不是合法的三段式版本号（应形如 1.2.3）`)
    if (next === current) {
      console.log(`版本号已经是 ${current}，无需变更。`)
      return
    }
  } else if (['patch', 'minor', 'major'].includes(level)) {
    next = bump(current, level)
  } else {
    throw new Error(`未知操作 "${level}"，可用：patch / minor / major / set`)
  }

  const note = rest[level === 'set' ? 1 : 0] ?? '（未填写变更说明）'

  console.log(`版本号：${current} → ${next}（${level}）`)
  console.log(`变更说明：${note}`)

  if (dryRun) {
    console.log('\n[dry-run] 未写入任何文件')
    return
  }

  pkg.version = next
  writeJson(PKG_PATH, pkg)

  if (existsSync(LOCK_PATH)) {
    const lock = readJson(LOCK_PATH)
    if (lock.version === current) {
      lock.version = next
      writeJson(LOCK_PATH, lock)
    }
  }

  upsertChangelog(next, level, note)
  console.log('\n✓ 已更新 package.json / package-lock.json / CHANGELOG.md')

  const msg = `v${next}：${note}`
  if (wantCommit) {
    git(['add', 'package.json', 'package-lock.json', 'CHANGELOG.md'])
    git(['commit', '-m', msg])
    console.log(`✓ 已提交：${msg}`)
  }
  if (wantTag) {
    git(['tag', '-a', `v${next}`, '-m', msg])
    console.log(`✓ 已打标签：v${next}`)
  }

  console.log('\n下一步：npm run pack（免安装版）或 npm run dist（安装包）')
}

try {
  main()
} catch (err) {
  console.error(`版本操作失败：${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}