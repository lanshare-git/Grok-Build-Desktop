import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'

import { cancelCurrent, sendPrompt } from '../actions'
import { useStore } from '../store'
import { IconClose, IconImage, IconScissors, IconSend, IconStop } from './Icons'
import type { ImageAttachment } from '@shared/types'

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

export default function Composer(): JSX.Element {
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const activeId = useStore((s) => s.activeId)
  const running = useStore((s) => s.running.includes(activeId ?? ''))

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

  const submit = (): void => {
    const value = text.trim()
    if ((!value && attachments.length === 0) || running) return
    const images: ImageAttachment[] | undefined =
      attachments.length > 0
        ? attachments.map(({ data, mimeType, name }) => ({ data, mimeType, name }))
        : undefined
    setText('')
    setAttachments([])
    void sendPrompt(value, images)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="composer">
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
          onChange={(e) => setText(e.target.value)}
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
    </div>
  )
}
