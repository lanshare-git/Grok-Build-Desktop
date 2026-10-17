export const diagChecks = {
  binary: {
    label: 'grok 可执行文件',
    detailMissing: '未找到',
    hintMissing: '请确认已安装 Grok Build；或设置环境变量 GROK_BIN 指向 grok 可执行文件。'
  },
  grokHome: {
    label: '配置目录',
    hintMissing: '该目录不存在，Grok Build 可能尚未安装或未初始化。'
  },
  version: {
    label: 'Grok Build 版本',
    detailUnknown: '未知'
  },
  auth: {
    label: '登录态',
    detailMissing: '未找到 auth.json',
    hintMissing: '请在「设置 → 账号」点击登录，或在终端执行 `grok login`；桌面端会自动复用。',
    detailValid: (vars: { account: string; expiresAt: string }) =>
      `${vars.account}（令牌有效，至 ${vars.expiresAt}）`,
    detailExpired: (vars: { account: string; expiresAt: string }) =>
      `${vars.account}（令牌已过期，将自动刷新，至 ${vars.expiresAt}）`,
    detailNoAccount: (vars: { expiresAt: string }) => `已登录，至 ${vars.expiresAt}`,
    hintExpired: '令牌过期后由 grok 自动用 refresh_token 续期；若失败请在终端重新登录。'
  },
  models: {
    label: '可用模型',
    detailEmpty: '未读到模型缓存'
  },
  proxy: {
    label: '网络代理',
    detail: (vars: { proxy: string; detail: string }) => `${vars.proxy}（${vars.detail}）`,
    hintUnreachable: '代理端口不可达。请确认代理客户端已启动，或改用「自动探测代理」。',
    detailDirect: '未配置，直连',
    hintDirect: '模型服务在境外，若直连超时请在下方配置代理（可一键自动探测）。'
  },
  network: {
    label: '模型服务连通性',
    detailViaProxy: (vars: { proxy: string }) => `经 ${vars.proxy} 转发`,
    detailProxyDown: '代理不可达，无法访问模型服务',
    hintViaProxy: '实际连通性以对话结果为准。',
    hintProxyDown: '请先让代理可用，再重新检查。',
    detailDirect: (vars: { endpoint: string; detail: string }) => `${vars.endpoint} → ${vars.detail}`,
    hintDirectFail: '无法直连模型服务。若本机有代理客户端，请在下方配置或点击「自动探测代理」。'
  }
}
