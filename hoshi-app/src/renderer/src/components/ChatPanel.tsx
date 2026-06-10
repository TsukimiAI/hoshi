import { useAuth } from '../auth/AuthContext'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const PLACEHOLDER_MESSAGES: ChatMessage[] = [
  {
    id: '1',
    role: 'assistant',
    content: '你好，我是拾星。登录后即可开始对话，Canvas 输出也会出现在这里。'
  }
]

export function ChatPanel(): React.JSX.Element {
  const { user } = useAuth()

  return (
    <section className="chat-panel">
      <div className="chat-panel__header">
        <div>
          <h2>工作区</h2>
          <p>{user ? `你好，${user.username}` : '聊天与 Canvas 输出'}</p>
        </div>
        <div className="chat-panel__tabs">
          <button type="button" className="active">
            对话
          </button>
          <button type="button" disabled>
            Canvas
          </button>
        </div>
      </div>

      <div className="chat-panel__messages">
        {PLACEHOLDER_MESSAGES.map((message) => (
          <article
            key={message.id}
            className={`chat-bubble chat-bubble--${message.role}`}
          >
            <span className="chat-bubble__role">
              {message.role === 'assistant' ? '拾星' : '你'}
            </span>
            <p>{message.content}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
