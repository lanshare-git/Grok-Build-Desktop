/**
 * ACP (Agent Client Protocol) JSON-RPC over stdio 客户端。
 *
 * 负责与 `grok agent stdio` 子进程通信：换行分隔的 JSON-RPC 2.0 报文，
 * 上行请求/响应关联、下行通知分发、agent→client 反向请求处理。
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'

interface PendingCall {
  method: string
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

export interface AcpClientOptions {
  binary: string
  args: string[]
  cwd: string
  env?: NodeJS.ProcessEnv
}

export interface AcpIncomingRequest {
  method: string
  params: unknown
  /** 回写响应（result 或 error） */
  respond: (result: unknown) => void
  fail: (code: number, message: string) => void
}

export interface AcpClientEvents {
  notification: [{ method: string; params: any }]
  request: [AcpIncomingRequest]
  stderr: [string]
  exit: [{ code: number | null; signal: string | null }]
  error: [Error]
}

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000 // 单个 prompt 可能长时间运行

export class AcpClient extends EventEmitter<AcpClientEvents> {
  private proc: ChildProcessWithoutNullStreams | null = null
  private stdoutBuf = ''
  private nextId = 1
  private pending = new Map<number, PendingCall>()
  private stopping = false

  constructor(private readonly options: AcpClientOptions) {
    super()
  }

  get running(): boolean {
    return this.proc !== null && this.proc.exitCode === null && !this.proc.killed
  }

  start(): void {
    if (this.proc) throw new Error('AcpClient 已在运行')

    const proc = spawn(this.options.binary, this.options.args, {
      cwd: this.options.cwd,
      env: this.options.env ?? process.env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    this.proc = proc

    proc.stdout.setEncoding('utf8')
    proc.stdout.on('data', (chunk: string) => this.consume(chunk))

    proc.stderr.setEncoding('utf8')
    proc.stderr.on('data', (chunk: string) => this.emit('stderr', chunk))

    proc.on('error', (err) => this.emit('error', err))

    proc.on('exit', (code, signal) => {
      this.proc = null
      const err = new Error(
        `agent 进程已退出（code=${code ?? 'null'}${signal ? `, signal=${signal}` : ''}）`
      )
      for (const [, call] of this.pending) {
        clearTimeout(call.timer)
        call.reject(err)
      }
      this.pending.clear()
      if (!this.stopping) this.emit('exit', { code, signal })
    })
  }

  /** 发送请求并等待响应 */
  request<T = unknown>(method: string, params: unknown, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
    const proc = this.proc
    if (!proc || !proc.stdin.writable) {
      return Promise.reject(new Error('agent 进程未就绪，无法发送请求'))
    }

    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`请求超时：${method}`))
      }, timeoutMs)

      this.pending.set(id, {
        method,
        timer,
        resolve: (v) => resolve(v as T),
        reject
      })

      this.write({ jsonrpc: '2.0', id, method, params })
    })
  }

  /** 发送通知（无需响应） */
  notify(method: string, params: unknown): void {
    this.write({ jsonrpc: '2.0', method, params })
  }

  private write(message: unknown): void {
    const proc = this.proc
    if (!proc || !proc.stdin.writable) return
    try {
      proc.stdin.write(JSON.stringify(message) + '\n')
    } catch (err) {
      this.emit('error', err as Error)
    }
  }

  /** 解析 stdout 缓冲区中的完整报文 */
  private consume(chunk: string): void {
    this.stdoutBuf += chunk

    let newlineIndex: number
    while ((newlineIndex = this.stdoutBuf.indexOf('\n')) !== -1) {
      const line = this.stdoutBuf.slice(0, newlineIndex).trim()
      this.stdoutBuf = this.stdoutBuf.slice(newlineIndex + 1)
      if (!line) continue

      let message: any
      try {
        message = JSON.parse(line)
      } catch {
        // 非 JSON 行（部分后端会把告警写到 stdout），忽略但透出便于排查
        this.emit('stderr', `[stdout/non-json] ${line}\n`)
        continue
      }
      this.dispatch(message)
    }

    // 防御：单行异常膨胀时截断，避免内存无限增长
    if (this.stdoutBuf.length > 8 * 1024 * 1024) {
      this.stdoutBuf = ''
      this.emit('stderr', '[warn] stdout 缓冲区超限，已丢弃未完成报文\n')
    }
  }

  private dispatch(message: any): void {
    // 1) 我方请求的响应
    if (message.id !== undefined && message.method === undefined) {
      const call = this.pending.get(message.id)
      if (!call) return
      this.pending.delete(message.id)
      clearTimeout(call.timer)
      if (message.error) {
        call.reject(new Error(`${call.method} 失败：${message.error.message ?? JSON.stringify(message.error)}`))
      } else {
        call.resolve(message.result ?? {})
      }
      return
    }

    // 2) agent -> client 的反向请求（权限确认、文件读写等）
    if (message.id !== undefined && message.method !== undefined) {
      const id = message.id
      this.emit('request', {
        method: message.method,
        params: message.params,
        respond: (result) => this.write({ jsonrpc: '2.0', id, result }),
        fail: (code, msg) => this.write({ jsonrpc: '2.0', id, error: { code, message: msg } })
      } satisfies AcpIncomingRequest)
      return
    }

    // 3) 通知
    if (message.method !== undefined) {
      this.emit('notification', { method: message.method, params: message.params })
    }
  }

  async stop(graceMs = 2500): Promise<void> {
    const proc = this.proc
    if (!proc) return
    this.stopping = true
    try {
      proc.stdin.end()
    } catch {
      /* ignore */
    }
    const exited = new Promise<void>((resolve) => proc.once('exit', () => resolve()))
    const timer = setTimeout(() => {
      try {
        proc.kill('SIGKILL')
      } catch {
        /* ignore */
      }
    }, graceMs)
    await exited
    clearTimeout(timer)
    this.proc = null
  }
}
