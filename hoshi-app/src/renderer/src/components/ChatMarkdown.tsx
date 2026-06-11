import Markdown from 'react-markdown'

interface ChatMarkdownProps {
  content: string
}

export function ChatMarkdown({ content }: ChatMarkdownProps): React.JSX.Element {
  return (
    <div className="chat-markdown">
      <Markdown>{content}</Markdown>
    </div>
  )
}
