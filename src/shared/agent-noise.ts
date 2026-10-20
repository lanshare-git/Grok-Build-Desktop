/**
 * grok agent 会把内部提示注入成 `user_message_chunk`（后台任务完成、技能清单等）。
 * 桌面端若原样画成用户气泡，用户会以为「这段黑的不是我发的」。
 * 搜索侧（session-search）已在剥；聊天渲染与落库前也要剥/丢弃。
 */

const NOISE_BLOCKS =
  /<(system-reminder|system-memories|skills)>[\s\S]*?<\/\1>/gi

/** 去掉 agent 注入的系统噪声；若整段都是噪声则返回空串 */
export function stripAgentNoise(text: string): string {
  if (!text) return ''
  return text.replace(NOISE_BLOCKS, '').replace(/\s+/g, ' ').trim()
}

/** 是否应隐藏（剥噪声后无可见正文、也无附图意义） */
export function isAgentNoiseOnly(text: string): boolean {
  if (!text?.trim()) return false
  return stripAgentNoise(text).length === 0
}
