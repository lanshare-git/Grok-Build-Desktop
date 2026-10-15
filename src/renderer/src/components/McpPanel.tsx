import { useState } from 'react'

import {
  addMcpServer,
  mcpDoctor,
  refreshMcp,
  removeMcpServer,
  toggleMcpServer
} from '../actions'
import { useStore } from '../store'
import { useT } from '../i18n'
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
  const t = useT()
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
      setFormError(t('panels.mcp.errNameRequired'))
      return
    }
    if (form.transport === 'stdio' && !form.commandLine.trim()) {
      setFormError(t('panels.mcp.errCommandRequired'))
      return
    }
    if (form.transport !== 'stdio' && !form.url.trim()) {
      setFormError(t('panels.mcp.errUrlRequired'))
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
      title: t('panels.mcp.deleteConfirmTitle'),
      message: t('panels.mcp.deleteConfirmMessage', {
        name: server.name,
        scope: server.scope === 'project' ? t('panels.mcp.scopeProject') : t('panels.mcp.scopeUser')
      }),
      detail: t('panels.mcp.deleteConfirmDetail'),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      danger: true,
      onConfirm: () => void removeMcpServer(server.name)
    })
  }

  return (
    <div className="settings-page">
      <div className="settings-page-title">{t('panels.mcp.title')}</div>
      <div className="settings-page-sub">{t('panels.mcp.subtitle')}</div>

      <div className="drawer-body drawer-body-embedded">
          {!form && (
            <div className="drawer-actions">
              <button className="btn btn-primary" onClick={startAdd}>
                <IconPlus size={14} />
                {t('panels.mcp.addServer')}
              </button>
              <button className="btn btn-ghost" onClick={() => void refreshMcp()}>
                {t('panels.mcp.refresh')}
              </button>
              <button className="btn btn-ghost" onClick={() => void runDoctor(null)} disabled={doctorBusy}>
                {t('panels.mcp.doctorAll')}
              </button>
            </div>
          )}

          {/* 新增 / 编辑表单 */}
          {form && (
            <div className="mcp-form">
              <div className="mcp-form-head">
                {form.editName ? t('panels.mcp.formEditTitle', { name: form.editName }) : t('panels.mcp.formAddTitle')}
              </div>

              <label className="mcp-field">
                <span>{t('panels.mcp.fieldName')}</span>
                <input
                  className="mcp-input"
                  value={form.name}
                  disabled={!!form.editName}
                  placeholder={t('panels.mcp.fieldNamePlaceholder')}
                  spellCheck={false}
                  onChange={(e) => update({ name: e.target.value })}
                />
                {form.editName && (
                  <span className="mcp-hint">{t('panels.mcp.nameLockedHint')}</span>
                )}
              </label>

              <label className="mcp-field">
                <span>{t('panels.mcp.fieldTransport')}</span>
                <select
                  className="mcp-input"
                  value={form.transport}
                  onChange={(e) => update({ transport: e.target.value as McpTransport })}
                >
                  <option value="stdio">{t('panels.mcp.transportStdio')}</option>
                  <option value="http">{t('panels.mcp.transportHttp')}</option>
                  <option value="sse">{t('panels.mcp.transportSse')}</option>
                </select>
              </label>

              {form.transport === 'stdio' ? (
                <label className="mcp-field">
                  <span>{t('panels.mcp.fieldCommand')}</span>
                  <input
                    className="mcp-input mcp-mono"
                    value={form.commandLine}
                    placeholder={t('panels.mcp.commandPlaceholder')}
                    spellCheck={false}
                    onChange={(e) => update({ commandLine: e.target.value })}
                  />
                  <span className="mcp-hint">{t('panels.mcp.commandHint')}</span>
                </label>
              ) : (
                <label className="mcp-field">
                  <span>{t('panels.mcp.fieldUrl')}</span>
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
                <span>{t('panels.mcp.fieldEnv')}</span>
                <KeyValueEditor
                  rows={form.env}
                  placeholder="KEY=VALUE"
                  onChange={(env) => update({ env })}
                />
              </div>

              {/* 请求头（仅远程） */}
              {form.transport !== 'stdio' && (
                <div className="mcp-field">
                  <span>{t('panels.mcp.fieldHeaders')}</span>
                  <KeyValueEditor
                    rows={form.headers}
                    placeholder="Authorization: Bearer TOKEN"
                    onChange={(headers) => update({ headers })}
                  />
                </div>
              )}

              {form.editName && (
                <div className="mcp-hint mcp-hint-warn">
                  {t('panels.mcp.envHeadersLostHint')}
                </div>
              )}

              {formError && <div className="mcp-form-error">{formError}</div>}

              <div className="mcp-form-actions">
                <button className="btn btn-ghost" onClick={() => setForm(null)} disabled={submitting}>
                  {t('common.cancel')}
                </button>
                <button className="btn btn-primary" onClick={() => void submit()} disabled={submitting}>
                  {submitting ? t('panels.mcp.saving') : t('common.save')}
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
                  <p>{t('panels.mcp.emptyTitle')}</p>
                  <span>{t('panels.mcp.emptyHint')}</span>
                </div>
              )}

              {servers.map((server) => (
                <div key={server.name} className={`mcp-card${server.enabled ? '' : ' is-disabled'}`}>
                  <div className="mcp-card-head">
                    <div className="mcp-card-title">
                      <span className={`mcp-dot ${server.enabled ? 'on' : 'off'}`} />
                      {server.name}
                    </div>
                    <span className="mcp-scope">{server.scope === 'project' ? t('panels.mcp.scopeProject') : t('panels.mcp.scopeUser')}</span>
                  </div>

                  <div className="mcp-card-cmd">
                    {server.transport === 'stdio'
                      ? [server.command, ...(server.args ?? [])].filter(Boolean).join(' ')
                      : `${server.transport} · ${server.url ?? t('panels.mcp.urlNotReturned')}`}
                  </div>

                  <div className="mcp-card-actions">
                    <label className="mcp-toggle" title={server.enabled ? t('panels.mcp.toggleDisableTitle') : t('panels.mcp.toggleEnableTitle')}>
                      <input
                        type="checkbox"
                        checked={server.enabled}
                        onChange={(e) => void toggleMcpServer(server.name, e.target.checked)}
                      />
                      {server.enabled ? t('panels.mcp.enabled') : t('panels.mcp.disabled')}
                    </label>
                    <button
                      className="icon-btn"
                      title={t('panels.mcp.editTitle')}
                      onClick={() => startEdit(server)}
                    >
                      <IconEdit size={13} />
                    </button>
                    <button
                      className="icon-btn"
                      title={t('panels.mcp.doctorTitle')}
                      onClick={() => void runDoctor(server.name)}
                      disabled={doctorBusy}
                    >
                      <IconPlug size={13} />
                    </button>
                    <button
                      className="icon-btn danger"
                      title={t('panels.mcp.deleteTitle')}
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
  const t = useT()
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
            title={t('panels.mcp.kvDeleteRowTitle')}
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
          >
            <IconTrash size={13} />
          </button>
        </div>
      ))}
      <button className="kv-add" onClick={() => onChange([...rows, ''])}>
        <IconPlus size={12} />
        {t('panels.mcp.kvAddRow')}
      </button>
    </div>
  )
}
