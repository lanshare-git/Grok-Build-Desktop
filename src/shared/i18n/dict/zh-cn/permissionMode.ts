export const permissionMode = {
  default: {
    label: '请求批准',
    desc: '只读操作免询问，其余每次执行前询问（对应 Codex「请求批准」）'
  },
  auto: {
    label: '帮我审批',
    desc: '安全分类器自动放行日常操作，仅风险操作弹窗询问（对应 Codex「帮我审批」）'
  },
  bypassPermissions: {
    label: '完全访问',
    desc: '所有工具直接执行不再询问，deny 规则和 hook 仍生效（对应 Codex「完全访问权限」）'
  },
  acceptEdits: {
    label: '编辑免询问',
    desc: '文件编辑不再询问，其他工具仍逐次询问'
  },
  dontAsk: {
    label: '仅允许列表',
    desc: '只有 allow 规则内的工具免询问，适合严格管控场景'
  },
  plan: {
    label: '计划模式',
    desc: '兼容占位模式（Claude 兼容设置使用）'
  }
}
