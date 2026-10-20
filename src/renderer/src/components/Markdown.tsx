import { memo, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

import ZoomableImage from './ZoomableImage'

interface Props {
  text: string
}

/** 图片加载失败：回退成可点开的 URL 块（与正文裸链接同观感） */
function MarkdownImageFallback({ uri }: { uri: string }): JSX.Element {
  if (!/^https?:/i.test(uri)) {
    return <div className="msg-media-link">{uri}</div>
  }
  return (
    <a
      className="msg-media-link"
      href={uri}
      title={uri}
      onClick={(e) => {
        e.preventDefault()
        void window.grok.openExternal(uri)
      }}
    >
      {uri}
    </a>
  )
}

/**
 * markdown 内图片：一律经 resolveAsset。
 * - 本地 / file:// → grok-asset://
 * - http(s) → 主进程拉取（内网鉴权图）
 * - data: / grok-asset: 原样
 * 解析失败或 onError → URL 链接块，不画空图框。
 */
function MarkdownImage({
  src,
  alt
}: {
  src?: string
  alt?: string
}): JSX.Element | null {
  const [resolved, setResolved] = useState<string | null | undefined>(undefined)
  const [broken, setBroken] = useState(false)

  useEffect(() => {
    let cancelled = false
    setBroken(false)
    setResolved(undefined)
    if (!src) {
      setResolved(null)
      return
    }
    if (/^(data:|grok-asset:)/i.test(src)) {
      setResolved(src)
      return
    }
    void window.grok
      .resolveAsset(src)
      .then((url) => {
        if (!cancelled) setResolved(url || null)
      })
      .catch(() => {
        if (!cancelled) setResolved(null)
      })
    return () => {
      cancelled = true
    }
  }, [src])

  if (!src) return null
  if (broken || resolved === null) return <MarkdownImageFallback uri={src} />
  if (resolved === undefined) return null
  return (
    <ZoomableImage
      className="msg-media"
      src={resolved}
      alt={alt ?? ''}
      onError={() => setBroken(true)}
    />
  )
}

/**
 * markdown 正文。
 *
 * ⚠️ 必须 memo：大会话重放时 ChatView 每放行一批就整体重渲染一次，
 * 而 react-markdown + rehype-highlight（语法高亮）单次解析开销不小。
 * 几百条消息 × 十几批重放 = 上千次重复解析同一段不变的文本，是主线程卡死的
 * 第二大来源（第一是 persist 的全量序列化，见 store.ts 的 applyStreamBatch）。
 * 文本没变就直接复用上次的渲染结果，只有真正新增/追加的段落才重新解析。
 *
 * memo 的前提是 props 引用稳定：这里只传 text（字符串，按值比较），天然满足。
 */
function MarkdownImpl({ text }: Props): JSX.Element {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault()
                if (href) void window.grok.openExternal(href)
              }}
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) => <MarkdownImage src={src} alt={alt} />,
          pre: ({ children }) => <pre className="code-block">{children}</pre>
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

export default memo(MarkdownImpl)
