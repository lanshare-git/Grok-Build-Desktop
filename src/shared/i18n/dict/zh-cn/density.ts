export const density = {
  detailed: {
    label: '详细',
    desc: '工具卡片默认展开，直接显示输入与输出'
  },
  'compact-shells': {
    label: '收起命令输出',
    desc: '默认折叠，终端/命令类卡片连参数摘要也不显示'
  },
  'compact-ungrouped': {
    label: '紧凑（不分组）',
    desc: '默认折叠，每个工具调用各占一行（grok 的默认档）'
  },
  'compact-grouped': {
    label: '紧凑 + 分组',
    desc: '连续的同种工具调用合并成一张汇总卡'
  },
  'compact-all-grouped': {
    label: '最紧凑',
    desc: '同工具合并汇总，并且「思考过程」默认收起'
  }
}
