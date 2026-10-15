export const welcome = {
  title: 'Grok Build 桌面端',
  lead: '直接复用你终端版 Grok Build 的登录态、模型与工具链，通过 ACP 协议驱动同一个 Agent。',
  point1: '流式输出、思考过程、工具调用与执行计划全程可见',
  point2: '文件读写、命令执行、代码检索，与终端版能力一致',
  point3: '会话可保存、可恢复，历史记录与终端版互通',
  connFailed: '连接失败：',
  unknownError: '未知错误',
  viewDiagnostics: '查看自检详情',
  diagIssues: (vars: { n: number }) => `自检发现 ${vars.n} 项异常：`,
  /** 诊断项名称并列时的分隔符 */
  listSeparator: '、',
  viewDetails: '查看详情',
  newTask: '新建任务',
  chatTitle: '以主目录为根、不绑定任何项目，且锁定为只读（不写文件）开始一段随聊随用的会话',
  foot: '不想绑定项目？点「新建聊天」即可直接开聊：会话以你的主目录为根、锁定为只读（不写文件）。绑定项目的任务以所选工作目录为根，创建后不可更改。'
}
