import { useState } from 'react'

import {
  addMcpServer,
  mcpDoctor,
  refreshMcp,
  removeMcpServer,
  toggleMcpServer
} from '../actions'
import { useStore } from '../store'
import type { McpServer, McpServerInput, McpTransport } from '@shared/types'
import ConfirmDialog from './ConfirmDialog'
import type { ConfirmSpec } from './ConfirmDialog'
import { IconEdit, IconPlug, IconPlus, IconTrash } from './Icons'

/* ------------------------------------------------------------------ *
 *  MCP 服务器管理 —— 设置中心「MCP 服务」分区的内容
 *  （标题/外壳由 SettingsDialog 提供，本组件只渲染列表与表单）
 * ------------------------------------------------------------------ */

interface FormState {
  /** 编辑模式下的原始名称；新增时为 null（名称锁定） */
  editName: string | null
  name: string
  transport: McpTransport
  commandLine: string
  url: string
  env: string[]
  headers: string[]
}

const EMPTY_FORM: FormState = {
  editName: null,
  name: '',
  transport: 'stdio',
  commandLine: '',
  url: '',
  env: [],
  headers: []
}

/** 把列表里的服务器预填进表单（env/headers 无法从 list 还原，留空并提示） */
function toForm(server: McpServer): FormState {
  const commandLine =
    server.transport === 'stdio'
      ? [server.command, ...(server.args ?? [])].filter(Boolean).join(' ')
      : ''
  return {
    editName: server.name,
    name: server.name,
    transport: server.transport,
    commandLine,
    url: server.url ?? '',
    env: [],
    headers: []
  }
}

export default function McpPanel(): JSX.Element {
  const servers = useStore((s) => s.mcpServers)

  const [form, setForm] = useState<FormState | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [doctorFor, setDoctorFor] = useState<string | null>(null)
  const [doctorText, setDoctorText] = useState<string | null>(null)
  const [doctorBusy, setDoctorBusy] = useState(false)

  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null)

  const startAdd = (): void => {
    setFormError(null)
    setForm({ ...EMPTY_FORM })
  }

  const startEdit = (server: McpServer): void => {
    setFormError(null)
    setForm(toForm(server))
  }

  const update = (patch: Partial<FormState>): void => {
    setForm((f) => (f ? { ...f, ...patch } : f))
  }

  const submit = async (): Promise<void> => {
    if (!form) return
    const name = form.name.trim()
    if (!name) {
      setFormError('请填写服务器名称。')
      return
    }
    if (form.transport === 'stdio' && !form.commandLine.trim()) {
      setFormError('stdio 服务器需要填写启动命令。')
      return
    }
    if (form.transport !== 'stdio' && !form.url.trim()) {
      setFormError('远程服务器需要填写连接地址（URL）。')
      return
    }

    const payload: McpServerInput = {
      name,
      transport: form.transport,
      commandLine: form.commandLine.trim() || undefined,
      url: form.url.trim() || undefined,
      env: form.env.map((e) => e.trim()).filter(Boolean),
      headers: form.headers.map((h) => h.trim()).filter(Boolean)
    }

    setSubmitting(true)
    setFormError(null)
    const ok = await addMcpServer(payload)
    setSubmitting(false)
    if (ok) setForm(null)
  }

  const runDoctor = async (name: string | null): Promise<void> => {
    setDoctorBusy(true)
    setDoctorFor(name ?? '__global__')
    try {
      const text = await mcpDoctor(name)
      setDoctorText(text)
    } catch (err) {
      setDoctorText(String(err))
    } finally {
      setDoctorBusy(false)
    }
  }

  const askRemove = (server: McpServer): void => {
    setConfirm({
      title: '删除 MCP 服务器？',
      message: (
        <>
          将把 <strong>{server.name}</strong> 从配置中移除（作用域：
          {server.scope === 'project' ? '项目' : '用户'}）。
        </>
      ),
      detail: '删除后桌面会自动重启 agent 使变更生效。已在进行的对话不受影响，但后续会话将不再加载该服务器。',
      confirmText: '删除',
      cancelText: '取消',
      danger: true,
      onConfirm: () => void removeMcpServer(server.name)
    })
  }

  return (
    <div className="settings-page">
      <div className="settings-page-title">MCP 服务</div>
      <div className="settings-page-sub">为当前账户配置可用的 MCP 服务器（写入 ~/.grok/config.toml）</div>

      <div className="drawer-body drawer-body-embedded">
          {!form && (
            <div className="drawer-actions">
              <button className="btn btn-primary" onClick={startAdd}>
                <IconPlus size={14} />
                添加服务器
              </button>
              <button className="btn btn-ghost" onClick={() => void refreshMcp()}>
                刷新
              </button>
              <button className="btn btn-ghost" onClick={() => void runDoctor(null)} disabled={doctorBusy}>
                诊断全部
              </button>
            </div>
          )}

          {/* 新增 / 编辑表单 */}
          {form && (
            <div className="mcp-form">
              <div className="mcp-form-head">
                {form.editName ? `编辑服务器「${form.editName}」` : '添加 MCP 服务器'}
              </div>

              <label className="mcp-field">
                <span>名称</span>
                <input
                  className="mcp-input"
                  value={form.name}
                  disabled={!!form.editName}
                  placeholder="如 filesystem、github"
                  spellCheck={false}
                  onChange={(e) => update({ name: e.target.value })}
                />
                {form.editName && (
                  <span className="mcp-hint">编辑时名称锁定；改名会创建新服务器并保留旧配置。</span>
                )}
              </label>

              <label className="mcp-field">
                <span>传输方式</span>
                <select
                  className="mcp-input"
                  value={form.transport}
                  onChange={(e) => update({ transport: e.target.value as McpTransport })}
                >
                  <option value="stdio">stdio（本地进程）</option>
                  <option value="http">http（流式 HTTP）</option>
                  <option value="sse">sse（Server-Sent Events）</option>
                </select>
              </label>

              {form.transport === 'stdio' ? (
                <label className="mcp-field">
                  <span>启动命令</span>
                  <input
                    className="mcp-input mcp-mono"
                    value={form.commandLine}
                    placeholder='npx -y @modelcontextprotocol/server-filesystem "D:/项目"'
                    spellCheck={false}
                    onChange={(e) => update({ commandLine: e.target.value })}
                  />
                  <span className="mcp-hint">完整命令行，参数用空格分隔；含空格的片段请用引号包裹。</span>
                </label>
              ) : (
                <label className="mcp-field">
                  <span>连接地址（URL）</span>
                  <input
                    className="mcp-input mcp-mono"
                    value={form.url}
                    placeholder="https://mcp.example.com/mcp"
                    spellCheck={false}
                    onChange={(e) => update({ url: e.target.value })}
                  />
                </label>
              )}

              {/* 环境变量（stdio / remote 通用） */}
              <div className="mcp-field">
                <span>环境变量（可选）</span>
                <KeyValueEditor
                  rows={form.env}
                  placeholder="KEY=VALUE"
                  onChange={(env) => update({ env })}
                />
              </div>

              {/* 请求头（仅远程） */}
              {form.transport !== 'stdio' && (
                <div className="mcp-field">
                  <span>请求头（可选）</span>
                  <KeyValueEditor
                    rows={form.headers}
                    placeholder="Authorization: Bearer TOKEN"
                    onChange={(headers) => update({ headers })}
                  />
                </div>
              )}

              {form.editName && (
                <div className="mcp-hint mcp-hint-warn">
                  grok 不在列表里回传已配置的环境变量 / 请求头，如需保留请在此重新填写，留空则不设置。
                </div>
              )}

              {formError && <div className="mcp-form-error">{formError}</div>}

              <div className="mcp-form-actions">
                <button className="btn btn-ghost" onClick={() => setForm(null)} disabled={submitting}>
                  取消
                </button>
                <button className="btn btn-primary" onClick={() => void submit()} disabled={submitting}>
                  {submitting ? '保存中…' : '保存'}
                </button>
              </div>
            </div>
          )}

          {/* 服务器列表 */}
          {!form && (
            <div className="mcp-list">
              {servers.length === 0 && (
                <div className="mcp-empty">
                  <IconPlug size={26} />
                  <p>还没有配置 MCP 服务器</p>
                  <span>点击「添加服务器」开始，或从终端运行 `grok mcp add --help` 了解格式。</span>
                </div>
              )}

              {servers.map((server) => (
                <div key={server.name} className={`mcp-card${server.enabled ? '' : ' is-disabled'}`}>
                  <div className="mcp-card-head">
                    <div className="mcp-card-title">
                      <span className={`mcp-dot ${server.enabled ? 'on' : 'off'}`} />
                      {server.name}
                    </div>
                    <span className="mcp-scope">{server.scope === 'project' ? '项目' : '用户'}</span>
                  </div>

                  <div className="mcp-card-cmd">
                    {server.transport === 'stdio'
                      ? [server.command, ...(server.args ?? [])].filter(Boolean).join(' ')
                      : `${server.transport} · ${server.url ?? '(地址未回传)'}`}
                  </div>

                  <div className="mcp-card-actions">
                    <label className="mcp-toggle" title={server.enabled ? '点击禁用' : '点击启用'}>
                      <input
                        type="checkbox"
                        checked={server.enabled}
                        onChange={(e) => void toggleMcpServer(server.name, e.target.checked)}
                      />
                      {server.enabled ? '已启用' : '已禁用'}
                    </label>
                    <button
                      className="icon-btn"
                      title="编辑"
                      onClick={() => startEdit(server)}
                    >
                      <IconEdit size={13} />
                    </button>
                    <button
                      className="icon-btn"
                      title="诊断"
                      onClick={() => void runDoctor(server.name)}
                      disabled={doctorBusy}
                    >
                      <IconPlug size={13} />
                    </button>
                    <button
                      className="icon-btn danger"
                      title="删除"
                      onClick={() => askRemove(server)}
                    >
                      <IconTrash size={14} />
                    </button>
                  </div>

                  {doctorFor === server.name && doctorText && (
                    <pre className="mcp-doctor">{doctorText}</pre>
                  )}
                </div>
              ))}

              {doctorFor === '__global__' && doctorText && (
                <pre className="mcp-doctor mcp-doctor-global">{doctorText}</pre>
              )}
            </div>
          )}
      </div>

      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  )
}

/* 键值对编辑器：每行一个文本框，可增删 */
function KeyValueEditor({
  rows,
  placeholder,
  onChange
}: {
  rows: string[]
  placeholder: string
  onChange: (rows: string[]) => void
}): JSX.Element {
  return (
    <div className="kv-editor">
      {rows.map((row, i) => (
        <div className="kv-row" key={i}>
          <input
            className="mcp-input mcp-mono"
            value={row}
            placeholder={placeholder}
            spellCheck={false}
            onChange={(e) => {
              const next = [...rows]
              next[i] = e.target.value
              onChange(next)
            }}
          />
          <button
            className="icon-btn danger"
            title="删除这一行"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
          >
            <IconTrash size={13} />
          </button>
        </div>
      ))}
      <button className="kv-add" onClick={() => onChange([...rows, ''])}>
        <IconPlus size={12} />
        添加一行
      </button>
    </div>
  )
}
