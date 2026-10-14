/**
 * AgentService —— 把 ACP 客户端封装成应用可直接使用的「Agent 会话服务」。
 *
 * 一个应用实例只维护 **一个** `grok agent stdio` 长驻进程，
 * 多个会话共用它（ACP 支持在同一进程内开多个 session）。
 * 这样登录态、模型、工具、记忆、插件全部沿用终端版配置。
 */

import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { AcpClient } from './client'
import { proxyEnv, readConfig } from '../config'
import type {
  AcpToolCall,
  AvailableCommand,
  ConnectionState,
  GrokAnnouncement,
  InitializeResult,
  NewSessionOptions,
  PermissionMode,
  PermissionRequestEvent,
  SessionNewResult,
  SessionUpdateEnvelope,
  UserQuestionAnswers,
  UserQuestionEvent,
  UserQuestion
} from '../../shared/types'

export interface AgentServiceEvents {
  state: [{ state: ConnectionState; message?: string }]
  stream: [{ sessionId: string; update: SessionUpdateEnvelope }]
  permission: [PermissionRequestEvent]
  question: [UserQuestionEvent]
  log: [string]
  /**
   * agent 自身的「元能力」：握手期上报的内置命令 + 运行期下发的公告。
   * 两者 ACP 只在 initialize 响应/`_x.ai/announcements/update` 里给一次，
   * 不接住就等于终端里的新功能在桌面端完全不可见。
   */
  meta: [{ commands: AvailableCommand[]; announcements: GrokAnnouncement[] }]
}

export function resolveGrokHome(): string {
  return process.env.GROK_HOME || join(homedir(), '.grok')
}

/** 依次尝试：环境变量 → PATH → GROK_HOME/bin → ~/.grok/bin */
export function resolveGrokBinary(): string | null {
  const candidates: string[] = []

  if (process.env.GROK_BIN) candidates.push(process.env.GROK_BIN)

  const isWin = process.platform === 'win32'
  const exe = isWin ? 'grok.exe' : 'grok'

  candidates.push(join(resolveGrokHome(), 'bin', exe))

  // PATH 查找
  const pathDirs = (process.env.PATH || '').split(isWin ? ';' : ':')
  for (const dir of pathDirs) {
    if (!dir) continue
    candidates.push(join(dir, exe))
  }

  for (const candidate of candidates) {
    try {
      if (existsSync(candidate)) return candidate
    } catch {
      /* ignore */
    }
  }
  return null
}

export class AgentService extends EventEmitter<AgentServiceEvents> {
  private client: AcpClient | null = null
  private initialized = false
  private state: ConnectionState = 'idle'
  /** 防止并发调用 start() 时重复拉起进程 */
  private startPromise: Promise<InitializeResult> | null = null

  private permissionSeq = 1
  private pendingPermissions = new Map<number, (optionId: string | null) => void>()

  private questionSeq = 1
  private pendingQuestions = new Map<number, (answers: UserQuestionAnswers | null) => void>()

  /**
   * session/load 期间缓存重放的 session/update，加载完成后一次性下发。
   * grok 会把历史逐条推成 session/update（实测 1.5MB 会话 = 184 条、铺开约 3 秒），
   * 直接透传会让界面像打字机一样逐条加载，观感很差。
   */
  private replayBuffers = new Map<string, SessionUpdateEnvelope[]>()
  private replayFlushTimers = new Map<string, NodeJS.Timeout>()
  /** flushReplay 等待中的 resolver：stop() 时必须结算，否则 loadSession 会永久挂住 */
  private replayFlushWaiters = new Map<string, () => void>()

  /** 当前 agent 进程内已创建/加载过的会话。进程重启后清空，prompt 前需 ensureSession */
  private knownSessions = new Set<string>()

  /** agent 上报的内置命令（initialize 的 availableCommands）与公告，供渲染层展示 */
  private agentCommands: AvailableCommand[] = []
  private announcements: GrokAnnouncement[] = []

  private readonly permissionModeDefault: PermissionMode

  constructor(options: { permissionMode?: PermissionMode } = {}) {
    super()
    this.permissionModeDefault = options.permissionMode ?? 'bypassPermissions'
  }

  get connectionState(): ConnectionState {
    return this.state
  }

  private setState(state: ConnectionState, message?: string): void {
    this.state = state
    this.emit('state', { state, message })
  }

  private log(line: string): void {
    this.emit('log', line)
  }

  /** 启动 agent 进程并完成 ACP 握手 */
  async start(): Promise<InitializeResult> {
    if (this.client?.running && this.initialized) {
      return {}
    }
    // 已有启动流程在飞行中，复用它
    if (this.startPromise) return this.startPromise

    this.startPromise = this.doStart().finally(() => {
      this.startPromise = null
    })
    return this.startPromise
  }

  private async doStart(): Promise<InitializeResult> {
    const binary = resolveGrokBinary()
    if (!binary) {
      this.setState('error', '未找到 grok 可执行文件')
      throw new Error(
        '未找到 grok 可执行文件。请确认已安装 Grok Build，或设置环境变量 GROK_BIN 指向 grok 可执行文件。'
      )
    }

    this.setState('starting', `正在启动 ${binary}`)

    // 代理：grok（Rust 侧）只认 HTTP_PROXY/HTTPS_PROXY 环境变量，不读系统代理设置。
    // 这里显式注入，否则境外模型端点会直连超时。
    const proxy = readConfig().proxy
    if (proxy) this.log(`[proxy] 使用代理 ${proxy}`)

    const client = new AcpClient({
      binary,
      // 不带 --always-approve：权限交由应用层决定（默认会话级 yoloMode）
      args: ['agent', 'stdio'],
      cwd: homedir(),
      env: {
        ...process.env,
        ...proxyEnv(proxy),
        // 避免自动更新检查污染 stdout / 抢占启动时间
        GROK_DISABLE_AUTOUPDATER: '1'
      }
    })

    client.on('notification', ({ method, params }) => {
      if (method === 'session/update' && params?.sessionId && params?.update) {
        const sessionId = String(params.sessionId)
        const update = params.update as SessionUpdateEnvelope
        // 正在 session/load 的会话：先缓存，等加载结束后统一下发
        const buffer = this.replayBuffers.get(sessionId)
        if (buffer) {
          buffer.push(update)
          return
        }
        this.emit('stream', { sessionId, update })
        return
      }
      // grok 的新功能/版本公告（终端里表现为启动横幅），桌面端转发给渲染层展示
      if (method === '_x.ai/announcements/update') {
        const list = (params as { announcements?: GrokAnnouncement[] } | undefined)?.announcements
        if (Array.isArray(list) && list.length > 0) {
          this.announcements = list
          this.emitMeta()
        }
        return
      }
      this.log(`[notification] ${method}`)
    })

    client.on('request', (req) => this.handleIncomingRequest(req))
    client.on('stderr', (chunk) => this.log(chunk))
    client.on('error', (err) => this.setState('error', err.message))
    client.on('exit', ({ code }) => {
      this.initialized = false
      this.client = null
      this.knownSessions.clear()
      // 进程退出时结算重放等待者：否则正在 await flushReplay 的 loadSession 会一直挂着
      for (const [, settle] of this.replayFlushWaiters) settle()
      this.replayFlushWaiters.clear()
      this.setState('stopped', `agent 进程已退出（code=${code ?? 'null'}）`)
    })

    client.start()
    this.client = client

    const init = await client.request<InitializeResult>('initialize', {
      protocolVersion: 1,
      clientCapabilities: {
        // grok 本地运行、直接读写磁盘，不需要经由客户端代理文件 IO
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false
      }
    })

    // 已缓存登录态时通常无需显式认证；若存在 cached_token 则顺带确认一次
    const cached = init.authMethods?.find((m) => m.id === 'cached_token')
    if (cached) {
      try {
        await client.request('authenticate', { methodId: 'cached_token' }, 30_000)
      } catch (err) {
        this.log(`[auth] cached_token 认证未成功：${(err as Error).message}`)
      }
    }

    this.initialized = true
    this.setState('ready', 'agent 已就绪')

    // 握手结果里带了一份内置命令清单（compact / context / session-info / deep-research …），
    // 它只在 initialize 这一次返回，不接住渲染层就永远看不到。
    const meta = init._meta as Record<string, unknown> | undefined
    const announced = (meta?.availableCommands ?? (init as unknown as { availableCommands?: unknown })
      .availableCommands) as AvailableCommand[] | undefined
    if (Array.isArray(announced) && announced.length > 0) {
      this.agentCommands = announced.filter((c) => typeof c?.name === 'string')
      this.emitMeta()
    }

    return init
  }

  /** 把 agent 上报的命令与公告推给渲染层 */
  private emitMeta(): void {
    this.emit('meta', { commands: this.agentCommands, announcements: this.announcements })
  }

  /** 供设置面板/诊断读取：当前 agent 上报的内置命令 */
  getBuiltinCommands(): AvailableCommand[] {
    return this.agentCommands
  }

  private async handleIncomingRequest(req: {
    method: string
    params: any
    respond: (result: unknown) => void
    fail: (code: number, message: string) => void
  }): Promise<void> {
    const { method, params, respond, fail } = req

    if (method === 'session/request_permission') {
      const options = (params?.options ?? []) as Array<{
        optionId: string
        name?: string
        kind?: string
      }>

      // 说明：会话若以 yoloMode 创建，agent 不会发起权限请求；
      // 走到这里说明当前是「询问模式」，交给界面决策。
      const requestId = this.permissionSeq++
      const toolCall = params?.toolCall as AcpToolCall | undefined

      const decided = await new Promise<string | null>((resolve) => {
        this.pendingPermissions.set(requestId, resolve)
        this.emit('permission', {
          requestId,
          sessionId: params?.sessionId ?? '',
          toolCall,
          options
        })
      })

      if (decided) {
        respond({ outcome: { outcome: 'selected', optionId: decided } })
      } else {
        // 用户拒绝：优先选择 deny 类选项，否则取消
        const denyOption = options.find((o) => /deny|reject|no/i.test(o.kind ?? ''))
        if (denyOption) {
          respond({ outcome: { outcome: 'selected', optionId: denyOption.optionId } })
        } else {
          respond({ outcome: { outcome: 'cancelled' } })
        }
      }
      return
    }

    // grok 的 ask_user_question 工具：经 ACP 扩展方法向客户端请求用户回答。
    // 响应格式经探针（scripts/ask-probe.mjs）实测确定：
    //   接受回答 -> { outcome: 'accepted', answers: { '<问题文本>': '<所选 label 或自定义回答>' } }
    //   取消     -> { outcome: 'cancelled' }
    if (method === '_x.ai/ask_user_question') {
      const questions = (params?.questions ?? []) as UserQuestion[]
      const requestId = this.questionSeq++

      const answers = await new Promise<UserQuestionAnswers | null>((resolve) => {
        this.pendingQuestions.set(requestId, resolve)
        this.emit('question', {
          requestId,
          sessionId: params?.sessionId ?? '',
          questions
        })
      })

      if (answers && Object.keys(answers).length > 0) {
        respond({ outcome: 'accepted', answers })
      } else {
        respond({ outcome: 'cancelled' })
      }
      return
    }

    if (method === 'fs/read_text_file' || method === 'fs/write_text_file' || method.startsWith('terminal/')) {
      // 未声明这些能力，agent 不应调用；防御性拒绝
      fail(-32601, `客户端不支持 ${method}`)
      return
    }

    fail(-32601, `未实现的方法：${method}`)
  }

  /** 用户在界面上对权限请求作出选择 */
  respondPermission(requestId: number, optionId: string | null): void {
    const resolver = this.pendingPermissions.get(requestId)
    if (!resolver) return
    this.pendingPermissions.delete(requestId)
    resolver(optionId)
  }

  /** 用户在界面上回答提问（answers 为空/null 表示取消） */
  respondQuestion(requestId: number, answers: UserQuestionAnswers | null): void {
    const resolver = this.pendingQuestions.get(requestId)
    if (!resolver) return
    this.pendingQuestions.delete(requestId)
    resolver(answers)
  }

  private requireClient(): AcpClient {
    if (!this.client?.running) throw new Error('agent 进程未运行')
    return this.client
  }

  async newSession(options: NewSessionOptions): Promise<SessionNewResult> {
    await this.start()
    const client = this.requireClient()

    const mode = options.permissionMode ?? this.permissionModeDefault
    const meta: Record<string, unknown> = {}
    // bypassPermissions 可在创建时经 _meta.yoloMode 直接带上；
    // 其余模式 session/new 不识别，创建后再用 session/set_mode 切换（见下方）
    if (mode === 'bypassPermissions') meta.yoloMode = true
    if (options.rules) meta.rules = options.rules

    const result = await client.request<SessionNewResult>('session/new', {
      cwd: options.cwd,
      mcpServers: [],
      _meta: meta
    })
    this.knownSessions.add(result.sessionId)

    if (options.model) {
      try {
        await this.setConfigOption(result.sessionId, 'model', options.model)
      } catch (err) {
        this.log(`[config] 设置模型失败：${(err as Error).message}`)
      }
    }
    if (options.reasoningEffort) {
      try {
        await this.setConfigOption(result.sessionId, 'reasoning_effort', options.reasoningEffort)
      } catch (err) {
        this.log(`[config] 设置推理强度失败：${(err as Error).message}`)
      }
    }
    // 非 bypass 模式（default/auto/acceptEdits/dontAsk/plan）创建时不带 yoloMode，
    // 这里立即切到目标模式。bypassPermissions 已由 yoloMode 带上，无需重复切换。
    if (mode !== 'bypassPermissions') {
      try {
        await this.setPermissionMode(result.sessionId, mode)
      } catch (err) {
        this.log(`[config] 设置权限模式失败：${(err as Error).message}`)
      }
    }

    return result
  }

  async loadSession(sessionId: string, cwd: string): Promise<SessionNewResult> {
    await this.start()
    const client = this.requireClient()
    // 已在当前 agent 进程里加载过的会话，**不能再发 session/load**：
    // grok 对同一 session 重复 load 会把整段历史再重放一遍（实测连发 3 次，
    // 每次都重放 168 条），而重放是以「追加」语义进入渲染层的，
    // 会把用户最先那条消息挤到列表末尾。这里直接短路，语义与 ensureSession 一致。
    if (this.knownSessions.has(sessionId)) {
      this.log(`[load] ${sessionId} 已在当前 agent 进程内，跳过重复 session/load`)
      return {} as SessionNewResult
    }
    // 开始缓存该会话的重放通知
    this.replayBuffers.set(sessionId, [])
    const startedAt = Date.now()
    let result: SessionNewResult = {} as SessionNewResult
    try {
      result = await client.request<SessionNewResult>('session/load', {
        sessionId,
        cwd,
        mcpServers: []
      })
    this.knownSessions.add(sessionId)
    } finally {
      // session/load 返回 ≈ 重放结束；再留一段静默期兜底捕获零星尾随通知。
      // 上限 2s：用户紧接着发消息时，首批生成内容也不至于被缓存憋太久。
      const grace = Math.min(2000, Math.max(800, Date.now() - startedAt))
      // ⚠️ 必须**等重放真正下发完**才返回，不能只排个定时器就 resolve：
      // 渲染层把 loadSession 的返回当作「历史已到齐」的信号（据此清 reloadingSessions、
      // 显示就绪态）。若提前返回，几百条 update 还在路上，界面就会宣告「加载完成」
      // 却只显示零星几条 —— 用户反馈的「只加载了部分」正是这个时序错位。
      // finally 里的 await 会在 return 之前完成，所以这里的赋值对返回值有效。
      // flushReplay 直接**返回条数**，不用实例字段存 —— 后者在两个会话并发加载时会串味。
      result.replayed = await this.flushReplay(sessionId, grace)
    }
    return result
  }

  /**
   * 静默期到达后把缓存的重放通知一次性下发给渲染层。
   * 返回的 Promise 在下发完成后 resolve，值是本次实际下发的条数。
   */
  private flushReplay(sessionId: string, delayMs: number): Promise<number> {
    const existing = this.replayFlushTimers.get(sessionId)
    if (existing) clearTimeout(existing)

    return new Promise<number>((resolve) => {
      let settled = false
      const done = (): void => {
        if (settled) return
        settled = true
        this.replayFlushTimers.delete(sessionId)
   this.replayFlushWaiters.delete(sessionId)
        const buffer = this.replayBuffers.get(sessionId)
        this.replayBuffers.delete(sessionId)
     const count = buffer?.length ?? 0
        if (count > 0) this.log(`[replay] ${sessionId} 重放 ${count} 条，一次性下发`)
        // ⚠️ 必须**先报总数再下发内容**（顺序不能反）：
     // 渲染层靠「已应用数 == 总数」判断重放是否结束、并用 N/M 显示进度。
        // 若内容先到（几百条连续 emit）而总数后到（loadSession 响应），
        // 渲染层在收到总数之前无法判断「是否已到齐」，
     // 只能干等兜底超时 —— 小会话就会明显卡一下（实测 2 条 update 延迟 451ms 才出内容）。
        // count===0（空会话/新会话）也要发：否则渲染层只能干等 REPLAY_IDLE_MS
      // 的静默兜底才收尾，白转 1.2s。收到 total=0 即代表「无需重放，立刻结束」。
        this.emit('stream', { sessionId, update: { sessionUpdate: 'replay_begin', total: count } })
      if (buffer) {
          for (const update of buffer) {
   this.emit('stream', { sessionId, update })
    }
        }
        resolve(count)
      }
      // stop() 会遍历结算 waiter，否则 loadSession 的 await 永久挂起
      this.replayFlushWaiters.set(sessionId, done)
      this.replayFlushTimers.set(
        sessionId,
        setTimeout(() => {
          this.replayFlushTimers.delete(sessionId)
          done()
        }, delayMs)
      )
    })
  }

  /**
   * 确保会话在当前 agent 进程中可用。
   * 应用重启后渲染层还持有持久化的会话历史，但 agent 进程是全新的，
   * 直接 session/prompt 会报 "Invalid params (unknown session id)"，
   * 因此发送前先自动 session/load。
   */
  async ensureSession(sessionId: string, cwd: string): Promise<void> {
    if (this.knownSessions.has(sessionId)) return
    await this.start()
    if (this.knownSessions.has(sessionId)) return
    await this.loadSession(sessionId, cwd)
  }

  async prompt(
    sessionId: string,
    text: string,
    images?: Array<{ data: string; mimeType: string; name?: string }>
  ): Promise<{ stopReason?: string }> {
    const client = this.requireClient()

    const blocks: Array<{ type: string; text?: string; data?: string; mimeType?: string }> = []
    for (const img of images ?? []) {
      if (img?.data && img?.mimeType) {
        blocks.push({ type: 'image', data: img.data, mimeType: img.mimeType })
      }
    }
    if (text) blocks.push({ type: 'text', text })
    if (blocks.length === 0) throw new Error('消息内容为空')

    return client.request<{ stopReason?: string }>(
      'session/prompt',
      { sessionId, prompt: blocks },
      60 * 60 * 1000
    )
  }

  cancel(sessionId: string): void {
    if (!this.client?.running) return
    this.client.notify('session/cancel', { sessionId })
    // 回合被中断时，正在等待的提问/权限请求必须就地结算：
    // agent 侧会一直挂到收到响应为止（WorkHub 的注释也是这个意思：
    // 「进程仍存活，需回响应才会继续」），不结算就会连同界面上的模态框一起卡死。
    // 界面上的对话框由渲染层在 cancelCurrent() 里自行清理。
    for (const [, resolve] of this.pendingQuestions) resolve(null)
    this.pendingQuestions.clear()
    for (const [, resolve] of this.pendingPermissions) resolve(null)
    this.pendingPermissions.clear()
  }

  async setConfigOption(
    sessionId: string,
    configId: string,
    value: string
  ): Promise<unknown> {
    const client = this.requireClient()
    return client.request('session/set_config_option', {
      sessionId,
      configId,
      value: { value }
    })
  }

  /**
   * 切换会话的权限模式（ACP session/set_mode，实测有效）。
   *  - 'bypassPermissions' = 自动批准（always-approve / yolo）：工具调用不再逐个询问，
   *    deny 规则和 hook 仍然生效
   *  - 'default' = 询问模式：每个工具执行前弹请求
   */
  async setPermissionMode(sessionId: string, modeId: string): Promise<void> {
    const client = this.requireClient()
    await client.request('session/set_mode', { sessionId, modeId })
  }

  /**
   * 关闭（卸载）会话：ACP `session/close`。
   * 只释放 agent 进程内该会话的状态（历史、actor、缓存），**磁盘数据与会话列表都不动**，
   * 下次打开该会话会走 ensureSession → session/load 重新加载。
   * 长驻进程里开过的会话越多占用越大，这个入口让用户能主动回收。
   */
  async closeSession(sessionId: string): Promise<void> {
    // 未加载的会话直接返回，不要为「本来就不在进程里」触发一次远端调用
    if (!this.knownSessions.has(sessionId)) return
    if (!this.client?.running) return

    // 先摘掉本地缓存，否则 close 之后到达的尾随通知还会被当成实时流
    this.knownSessions.delete(sessionId)
    const timer = this.replayFlushTimers.get(sessionId)
    if (timer) clearTimeout(timer)
    this.replayFlushTimers.delete(sessionId)
    this.replayBuffers.delete(sessionId)

    try {
      await this.requireClient().request('session/close', { sessionId }, 20_000)
      this.log(`[close] 已卸载会话 ${sessionId}`)
    } catch (err) {
      // 关闭失败不影响正确性：下次 prompt 前 ensureSession 会重新 load
      this.log(`[close] 卸载会话失败（忽略）：${(err as Error).message}`)
    }
  }

  async stop(): Promise<void> {
    // 拒绝所有挂起的权限请求，避免 agent 侧悬挂
    for (const [, resolve] of this.pendingPermissions) resolve(null)
    this.pendingPermissions.clear()
    // 挂起的提问同样按取消处理
    for (const [, resolve] of this.pendingQuestions) resolve(null)
    this.pendingQuestions.clear()
    // 清掉重放缓存与待刷新定时器
    for (const [, timer] of this.replayFlushTimers) clearTimeout(timer)
    this.replayFlushTimers.clear()
    this.replayBuffers.clear()
    // 必须结算正在等待的 flushReplay，否则 loadSession 里的 await this.flushReplay()
    // 会永久挂起（停进程时正好在加载大会话就会触发）
    for (const [, settle] of this.replayFlushWaiters) settle()
    this.replayFlushWaiters.clear()

    const client = this.client
    this.client = null
    this.initialized = false
    this.knownSessions.clear()
    if (client) await client.stop()
    this.setState('stopped', '已停止')
  }
}
