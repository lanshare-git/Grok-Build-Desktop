import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

interface Props {
  text: string
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
          pre: ({ children }) => <pre className="code-block">{children}</pre>
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

export default memo(MarkdownImpl)
