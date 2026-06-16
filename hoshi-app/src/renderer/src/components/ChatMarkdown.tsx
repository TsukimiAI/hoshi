import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { stabilizeStreamingMarkdown } from '../lib/markdown'

interface ChatMarkdownProps {
  content: string
  streaming?: boolean
}

export function ChatMarkdown({ content, streaming = false }: ChatMarkdownProps): React.JSX.Element {
  const prepared = stabilizeStreamingMarkdown(content, streaming)

  return (
    <div className="chat-markdown">
      <Markdown remarkPlugins={[remarkGfm]}>{prepared}</Markdown>
    </div>
  )
}
