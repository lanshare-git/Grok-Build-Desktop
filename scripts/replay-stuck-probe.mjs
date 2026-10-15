#!/usr/bin/env node
/**
 * 兜底逻辑离线验证：用**磁盘真值**跑一遍渲染层的工具卡还原 + markStuckTools，
 * 回答「这次重放之后，到底有几张卡会卡住、它们会不会被标成 interrupted」。
 *
 * 为什么需要：运行时状态读不到（Electron 的 Local Storage 是压缩的 leveldb，
 * grep 不到；渲染进程也没有开调试端口）。但 `updates.jsonl` 就是 `session/load`
 * 重放的**唯一输入**，渲染层的还原是它的纯函数，所以离线重算得到的终态
 * 与线上一致——除非时序上「卡」在 finishSessionReplay 之后才到（那属于另一类 bug）。
 *
 * 用法：
 *   node scripts/replay-stuck-probe.mjs <sessionDir>
 *   例：node scripts/replay-stuck-probe.mjs \
 *         "$HOME/.grok/sessions/D%3A%5C%E9%9C%80%E6%B1%82%E5%88%86%E6%9E%90/01a13e0e-8c6f-74d0-a92c-0242942d6452"
 *
 * 复刻的是 store.ts 的 upsertTool（新建分支用 `update.status ?? 'in_progress'` 兜底，
 * 因为 grok 的 tool_call 事件常把状态只写在 _meta.updateParams 里、顶层没有 status）
 * 与 markStuckToolsIn（in_progress / pending 视为「没收到结果」）。
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const dir = resolve(process.argv[2] ?? '')
if (!process.argv[2]) {
  console.error('用法：node scripts/replay-stuck-probe.mjs <sessionDir>')
  process.exit(1)
}

const raw = readFileSync(resolve(dir, 'updates.jsonl'), 'utf8')
const lines = raw.split('\n').filter(Boolean)

/** 与 store.upsertTool 一致：只维护一张 toolCallId → status 的表 */
const tools = new Map()
/** 记录该 toolCallId 在**协议顶层**是否真的带过 status（用来解释兜底值的来源） */
const hadTopLevelStatus = new Set()

let toolEvents = 0
for (const line of lines) {
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    continue
  }
  const update = msg?.params?.update
  if (!update) continue
  const kind = update.sessionUpdate
  if (kind !== 'tool_call' && kind !== 'tool_call_update') continue
  const id = update.toolCallId
  if (!id) continue
  toolEvents++

  const prev = tools.get(id)
  if (kind === 'tool_call' && prev === undefined) {
    // 新建分支：status 缺失时**兜底成 in_progress**（与 store.ts 一致）
    if (update.status !== undefined) hadTopLevelStatus.add(id)
    tools.set(id, update.status ?? 'in_progress')
  } else {
    // 更新分支：status ?? 旧值
    if (update.status !== undefined) {
      hadTopLevelStatus.add(id)
      tools.set(id, update.status)
    } else if (prev === undefined) {
      tools.set(id, 'in_progress')
    }
  }
}

const TERMINAL = new Set(['completed', 'failed'])
const stuck = []
for (const [id, status] of tools) {
  if (!TERMINAL.has(status)) stuck.push({ id, status })
}

console.log(`会话目录：${dir}`)
console.log(`tool_call / tool_call_update 事件：${toolEvents} 条`)
console.log(`工具卡总数：${tools.size}`)
console.log(`终态卡（completed/failed）：${tools.size - stuck.length}`)
console.log(`非终态卡（会被 markStuckTools 标成 interrupted）：${stuck.length}`)
console.log('')
if (stuck.length === 0) {
  console.log('结论：本次重放**没有**卡住的卡 —— 界面不会出现永远转圈的工具卡。')
} else {
  for (const s of stuck) {
    const src = hadTopLevelStatus.has(s.id) ? '协议顶层带了 status' : '顶层无 status → 兜底 in_progress'
    console.log(`  卡住：${s.id}`)
    console.log(`    当前状态 = ${JSON.stringify(s.status)}  （${src}）`)
    console.log(`    sweep 之后 → interrupted`)
  }
  console.log('')
  console.log('结论：这些卡在重放收尾时会被 markStuckToolsAfterReplay 标成 interrupted')
  console.log('      （界面：⏹ +「已中断」+ 警示橙 + 折叠态说明），不会再永远转圈。')
}
