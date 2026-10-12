import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

interface Props {
  text: string
}

export default function Markdown({ text }: Props): JSX.Element {
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
