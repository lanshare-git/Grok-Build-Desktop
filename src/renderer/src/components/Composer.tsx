import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'

import { cancelCurrent, sendPrompt } from '../actions'
import { useStore } from '../store'
import { IconClose, IconImage, IconScissors, IconSend, IconStop } from './Icons'
import type { AvailableCommand, ImageAttachment } from '@shared/types'

interface Attachment extends ImageAttachment {
  id: string
  /** dataURL，仅用于本地预览 */
  preview: string
}

const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

const MAX_IMAGE_BYTES = 10 * 1024 * 1024

/** /imagine-video 的参数选项（对照 xAI 视频模型能力；CLI 旗标语法以 grok 1.0.50 实际解析为准） */
const VIDEO_DURATIONS = [5, 10, 15]
const VIDEO_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3']
const VIDEO_RESOLUTIONS = ['480p', '720p', '1080p']
const VIDEO_MODELS = ['grok-imagine-video-1.5', 'grok-imagine-video-1.5-lite', 'grok-imagine-video']

/**
 * 内置创意命令种子：即使 grok 尚未上报任何命令，也能被发现。
 * 真正的完整清单来自两处运行时数据源（见 allCommands）：
 *  - agent 握手时的 availableCommands（compact / context / deep-research / workflow …）
 *  - `grok inspect` 的内置技能（/imagine / /learn / /review / /pptx / /pdf …）
 */
const SEED_COMMANDS: AvailableCommand[] = [
  { name: '/imagine', description: 'Generate an image from a text description' },
  { name: '/imagine-video', description: 'Generate a video from a text description' }
]

export default function Composer(): JSX.Element {
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const activeId = useStore((s) => s.activeId)
  const running = useStore((s) => s.running.includes(activeId ?? ''))
  // 重放期间**不需要**任何 selector 或提示：输入框本来就不该被 disabled
  // （那正是「输入框卡死」的观感来源），顶部 2px 细线已足够说明「还在加载」。
  const commands = useStore((s) => s.activeSession()?.commands ?? [])
  // agent 握手时上报的内置命令 + grok 内置技能（inspect）。
  // 少了这两个来源，用户在终端能用的 /compact、/deep-research、/learn、/review 等
  // 在客户端根本打不出来 —— 命令面板补全必须覆盖它们。
  const builtinCommands = useStore((s) => s.builtinCommands)
  const skillCommands = useStore((s) => s.envInfo?.skills)

  // /imagine-video 生成参数面板状态
  const [includeParams, setIncludeParams] = useState(true)
  const [duration, setDuration] = useState(10)
  const [ratio, setRatio] = useState('16:9')
  const [resolution, setResolution] = useState('720p')
  const [model, setModel] = useState('grok-imagine-video-1.5')

  // 补全面板：当前高亮项 + 是否被 Esc 关闭
  const [paletteIndex, setPaletteIndex] = useState(0)
  const [paletteDismissed, setPaletteDismissed] = useState(false)

  // 命令补全：种子 ∪ 会话级上报 ∪ agent 内置命令 ∪ grok 内置技能
  const allCommands = useMemo<AvailableCommand[]>(() => {
    const map = new Map<string, AvailableCommand>()
    for (const c of SEED_COMMANDS) map.set(c.name, c)
    for (const c of commands) if (c.name) map.set(c.name, { ...map.get(c.name), ...c })
    for (const c of builtinCommands) if (c?.name) map.set(c.name, { ...map.get(c.name), ...c })
    for (const s of skillCommands ?? []) {
      if (!s?.name) continue
      const name = `/${s.name}`
      if (map.has(name)) continue
      map.set(name, { name, description: s.description })
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [commands, builtinCommands, skillCommands])

  // 是否正在输入「/命令」（还没敲空格），用于弹出补全
  const slashQuery = /^\/(\S*)$/.exec(text)?.[1]?.toLowerCase() ?? null
  const filteredCommands = useMemo(
    () =>
      slashQuery === null
        ? []
        : allCommands.filter((c) => {
            const n = c.name.toLowerCase()
            return n === `/${slashQuery}` || n.startsWith(`/${slashQuery}`) || n.slice(1).startsWith(slashQuery)
          }),
    [allCommands, slashQuery]
  )
  // 命令补全下拉：输入「/命令」且未敲空格、未被 Esc 关闭时弹出
  const showPalette = slashQuery !== null && !running && filteredCommands.length > 0 && !paletteDismissed

  // 候选列表变化时把高亮项拉回首项
  useEffect(() => {
    setPaletteIndex(0)
  }, [filteredCommands])

  // 当前是否为 /imagine-video（用于显示参数面板）
  const isImagineVideo = /^\/imagine-video(\s|$)/i.test(text)

  // 自动增高
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [text])

  // 切换会话时清空草稿
  useEffect(() => {
    setText('')
    setAttachments([])
  }, [activeId])

  /** 把图片 Blob 转成 base64 附件 */
  const addImageBlob = (blob: Blob, name?: string): void => {
    if (!blob.type.startsWith('image/')) return
    if (blob.size > MAX_IMAGE_BYTES) {
      useStore
        .getState()
        .pushLog(`[composer] 图片过大（${(blob.size / 1024 / 1024).toFixed(1)}MB），已忽略：${name ?? '剪贴板图片'}`)
      return
    }
    const reader = new FileReader()
    reader.onload = (): void => {
      const dataUrl = String(reader.result)
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
      setAttachments((prev) => [
        ...prev,
        { id: uid(), data: base64, mimeType: blob.type, name: name ?? '图片', preview: dataUrl }
      ])
    }
    void reader.readAsDataURL(blob)
  }

  /** Ctrl+V 粘贴截图 / 复制的图片 */
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>): void => {
    const files = Array.from(e.clipboardData.items)
      .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
      .map((it) => it.getAsFile())
      .filter((f): f is File => f !== null)
    if (files.length > 0) {
      e.preventDefault()
      files.forEach((f) => addImageBlob(f, f.name || '剪贴板图片'))
    }
  }

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>): void => {
    Array.from(e.target.files ?? []).forEach((f) => {
      if (f.type.startsWith('image/')) addImageBlob(f, f.name)
    })
    e.target.value = ''
  }

  /** 拉起系统截图（Win+Shift+S 剪辑模式），截完在输入框 Ctrl+V */
  const snip = (): void => {
    void window.grok.screenshotSnip()
    textareaRef.current?.focus()
  }

  const removeAttachment = (id: string): void => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  const selectCommand = (name: string): void => {
    setText(`${name} `)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const submit = (): void => {
    const value = text.trim()
    if ((!value && attachments.length === 0) || running) return
    // /imagine-video：把生成参数拼成旗标附到提示词末尾（CLI 旗标语法以 grok 实际解析为准）
    let body = value
    if (isImagineVideo && includeParams) {
      const flags = [
        `--duration ${duration}`,
        `--ratio ${ratio}`,
        `--resolution ${resolution}`,
        `--model ${model}`
      ].join(' ')
      body = `${value} ${flags}`
    }
    const images: ImageAttachment[] | undefined =
      attachments.length > 0
        ? attachments.map(({ data, mimeType, name }) => ({ data, mimeType, name }))
        : undefined
    setText('')
    setAttachments([])
    void sendPrompt(body, images)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (showPalette && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setPaletteIndex((i) => Math.min(i + 1, filteredCommands.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setPaletteIndex((i) => Math.max(i - 1, 0))
        return
      }
      if ((e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) || e.key === 'Tab') {
        e.preventDefault()
        const cmd = filteredCommands[paletteIndex]
        if (cmd) selectCommand(cmd.name)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setPaletteDismissed(true)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="composer">
      {/* 重放期间**刻意不加任何提示**：顶部那条 2px 细进度线已经说明了「还在加载」。
          之前这里还有一条「正在加载历史对话，可先输入…」+ spinner，与顶部横幅重复，
          两处同时出现太吵。输入框本来就保持可用（不 disabled），不需要额外解释。 */}
      {showPalette && (
        <div className="cmd-palette" role="listbox">
          {filteredCommands.map((c, i) => (
            <button
              key={c.name}
              type="button"
              role="option"
              aria-selected={i === paletteIndex}
              className={`cmd-item${i === paletteIndex ? ' cmd-item-active' : ''}`}
              onMouseEnter={() => setPaletteIndex(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectCommand(c.name)}
            >
              <span className="cmd-name">{c.name}</span>
              {c.description && <span className="cmd-desc">{c.description}</span>}
            </button>
          ))}
        </div>
      )}
      {attachments.length > 0 && (
        <div className="attach-strip">
          {attachments.map((a) => (
            <div key={a.id} className="attach-thumb" title={a.name}>
              <img src={a.preview} alt={a.name} />
              <button
                className="attach-remove"
                title="移除"
                onClick={() => removeAttachment(a.id)}
              >
                <IconClose size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="composer-box">
        <div className="composer-tools">
          <button className="tool-btn" title="上传图片" onClick={() => fileInputRef.current?.click()}>
            <IconImage size={15} />
          </button>
          <button className="tool-btn" title="截图提问（截图后按 Ctrl+V 粘贴）" onClick={snip}>
            <IconScissors size={15} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={onPickFiles}
          />
        </div>
        <textarea
          ref={textareaRef}
          className="composer-input"
          rows={1}
          placeholder="描述任务，或粘贴截图提问…（Enter 发送，Shift+Enter 换行）"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setPaletteDismissed(false)
            setPaletteIndex(0)
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          disabled={running}
        />
        {running ? (
          <button className="btn btn-stop" onClick={cancelCurrent} title="中断当前回合">
            <IconStop size={15} />
          </button>
        ) : (
          <button
            className="btn btn-send"
            onClick={submit}
            disabled={!text.trim() && attachments.length === 0}
            title="发送"
          >
            <IconSend size={15} />
          </button>
        )}
      </div>
      {isImagineVideo && (
        <div className="imagine-params">
          <div className="param-row">
            <span className="param-label">时长</span>
            {VIDEO_DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                className={`chip${duration === d ? ' chip-on' : ''}`}
                onClick={() => setDuration(d)}
              >
                {d}s
              </button>
            ))}
          </div>
          <div className="param-row">
            <span className="param-label">宽高比</span>
            {VIDEO_RATIOS.map((r) => (
              <button
                key={r}
                type="button"
                className={`chip${ratio === r ? ' chip-on' : ''}`}
                onClick={() => setRatio(r)}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="param-row">
            <span className="param-label">分辨率</span>
            {VIDEO_RESOLUTIONS.map((r) => (
              <button
                key={r}
                type="button"
                className={`chip${resolution === r ? ' chip-on' : ''}`}
                onClick={() => setResolution(r)}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="param-row">
            <span className="param-label">模型</span>
            {VIDEO_MODELS.map((m) => (
              <button
                key={m}
                type="button"
                className={`chip${model === m ? ' chip-on' : ''}`}
                onClick={() => setModel(m)}
              >
                {m}
              </button>
            ))}
          </div>
          <label className="param-toggle">
            <input
              type="checkbox"
              checked={includeParams}
              onChange={(e) => setIncludeParams(e.target.checked)}
            />
            发送时附带参数（关闭则只发提示词，参数需自行补充在框内）
          </label>
        </div>
      )}
    </div>
  )
}
