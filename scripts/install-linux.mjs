/**
 * 把 dist/*.deb 安装到本机（系统级），并刷新桌面数据库。
 *
 *   npm run dist:linux && npm run install:linux
 *
 * 需要 sudo（会提示输入密码）。卸载：sudo apt remove grok-build-desktop
 */
import { execFileSync, execSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')

function findDeb() {
  if (!existsSync(DIST)) {
    throw new Error(`未找到 ${DIST}，请先运行：npm run dist:linux`)
  }
  const deb = readdirSync(DIST)
    .filter((f) => f.endsWith('.deb'))
    .sort()
    .at(-1)
  if (!deb) throw new Error(`dist/ 下没有 .deb，请先运行：npm run dist:linux`)
  return join(DIST, deb)
}

const deb = findDeb()
console.log(`安装：${deb}`)

/** 无 TTY 时用 pkexec（弹图形密码框）；有 TTY 用 sudo */
function runRoot(args) {
  const usePkexec = !process.stdin.isTTY
  const bin = usePkexec ? 'pkexec' : 'sudo'
  execFileSync(bin, args, { stdio: 'inherit' })
}

runRoot(['dpkg', '-i', deb])

// 保险：afterInstall 未生效时补 SUID + /usr/bin 入口
const prefix = '/opt/GrokBuildDesktop'
const sandbox = `${prefix}/chrome-sandbox`
const bin = `${prefix}/grok-build-desktop`
try {
  runRoot([
    'bash',
    '-c',
    `chown root:root '${sandbox}' && chmod 4755 '${sandbox}' && ln -sfn '${bin}' /usr/bin/grok-build-desktop`
  ])
} catch {
  console.warn('警告：未能完成沙箱/快捷命令配置，可手动执行：')
  console.warn(`  sudo chown root:root '${sandbox}' && sudo chmod 4755 '${sandbox}'`)
  console.warn(`  sudo ln -sfn '${bin}' /usr/bin/grok-build-desktop`)
}

try {
  runRoot(['apt-get', 'install', '-f', '-y'])
} catch {
  /* 依赖已齐时可能非零，忽略 */
}

try {
  runRoot(['update-desktop-database', '/usr/share/applications'])
} catch {
  /* 忽略 */
}

console.log(`
✓ 已安装 grok-build-desktop

启动方式：
  · 应用菜单搜索「Grok Build Desktop」
  · 或命令行：grok-build-desktop

卸载：sudo apt remove grok-build-desktop
`)
