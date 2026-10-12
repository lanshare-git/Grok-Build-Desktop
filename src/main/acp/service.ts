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
  ConnectionState,
  InitializeResult,
  NewSessionOptions,
  PermissionRequestEvent,
  SessionNewResult,
  SessionUpdateEnvelope
} from '../../shared/types'

export interface AgentServiceEvents {
  state: [{ state: ConnectionState; message?: string }]
  stream: [{ sessionId: string; update: SessionUpdateEnvelope }]
  permission: [PermissionRequestEvent]
  log: [string]
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

  /** 当前 agent 进程内已创建/加载过的会话。进程重启后清空，prompt 前需 ensureSession */
  private knownSessions = new Set<string>()

  private readonly autoApproveDefault: boolean

  constructor(options: { autoApprove?: boolean } = {}) {
    super()
    this.autoApproveDefault = options.autoApprove ?? true
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
        this.emit('stream', {
          sessionId: params.sessionId,
          update: params.update as SessionUpdateEnvelope
        })
      } else {
        this.log(`[notification] ${method}`)
      }
    })

    client.on('request', (req) => this.handleIncomingRequest(req))
    client.on('stderr', (chunk) => this.log(chunk))
    client.on('error', (err) => this.setState('error', err.message))
    client.on('exit', ({ code }) => {
      this.initialized = false
      this.client = null
      this.knownSessions.clear()
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
    return init
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

  private requireClient(): AcpClient {
    if (!this.client?.running) throw new Error('agent 进程未运行')
    return this.client
  }

  async newSession(options: NewSessionOptions): Promise<SessionNewResult> {
    await this.start()
    const client = this.requireClient()

    const meta: Record<string, unknown> = {}
    if (options.autoApprove ?? this.autoApproveDefault) meta.yoloMode = true
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

    return result
  }

  async loadSession(sessionId: string, cwd: string): Promise<SessionNewResult> {
    await this.start()
    const client = this.requireClient()
    const result = await client.request<SessionNewResult>('session/load', {
      sessionId,
      cwd,
      mcpServers: []
    })
    this.knownSessions.add(sessionId)
    return result
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

  async stop(): Promise<void> {
    // 拒绝所有挂起的权限请求，避免 agent 侧悬挂
    for (const [, resolve] of this.pendingPermissions) resolve(null)
    this.pendingPermissions.clear()

    const client = this.client
    this.client = null
    this.initialized = false
    this.knownSessions.clear()
    if (client) await client.stop()
    this.setState('stopped', '已停止')
  }
}
