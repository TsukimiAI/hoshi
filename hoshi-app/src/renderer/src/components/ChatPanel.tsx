import { useEffect, useRef } from 'react'
import { PENDING_ASSISTANT_ID } from '../api/chat'
import { useAuth } from '../auth/AuthContext'
import { useChatMessages } from '../chat/ChatMessagesContext'
import { useChatSessions } from '../chat/ChatSessionContext'
import { ChatMarkdown } from './ChatMarkdown'
import { ChatMessageActions } from './ChatMessageActions'

export function ChatPanel(): React.JSX.Element {
  const { user } = useAuth()
  const { activeSession } = useChatSessions()
  const { messages, loading, error, sending, canRetry, retryLastMessage } = useChatMessages()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  const subtitle = !user
    ? '聊天与 Canvas 输出'
    : activeSession
      ? `当前会话：${activeSession.title}`
      : `你好，${user.username}`

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth'): void => {
    messagesEndRef.current?.scrollIntoView({ behavior })
  }

  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    const shouldStickToBottom = distanceToBottom < 120 || sending

    if (shouldStickToBottom) {
      scrollToBottom(sending ? 'auto' : 'smooth')
    }
  }, [messages, sending])

  useEffect(() => {
    if (sending) {
      scrollToBottom('auto')
    }
  }, [sending])

  return (
    <section className="chat-panel">
      <div className="chat-panel__header">
        <div>
          <h2>工作区</h2>
          <p>{subtitle}</p>
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

      <div ref={messagesContainerRef} className="chat-panel__messages">
        {!user ? (
          <article className="chat-bubble chat-bubble--assistant">
            <span className="chat-bubble__role">星奈</span>
            <p>登录后即可开始对话，Canvas 输出也会出现在这里。</p>
          </article>
        ) : loading ? (
          <p className="chat-panel__status">正在加载消息…</p>
        ) : messages.length === 0 ? (
          <article className="chat-bubble chat-bubble--assistant">
            <span className="chat-bubble__role">星奈</span>
            <p>你好，我是星奈。想聊点什么？</p>
          </article>
        ) : (
          messages.map((message, index) => {
            const isLastAssistant =
              message.role === 'assistant' &&
              message.id !== PENDING_ASSISTANT_ID &&
              !messages.slice(index + 1).some((item) => item.role === 'assistant')

            return (
              <article
                key={message.id}
                className={`chat-bubble chat-bubble--${message.role}`}
              >
                <div className="chat-bubble__header">
                  <span className="chat-bubble__role">
                    {message.role === 'assistant' ? '星奈' : '你'}
                  </span>
                  {message.id !== PENDING_ASSISTANT_ID ? (
                    <ChatMessageActions message={message} isLastAssistant={isLastAssistant} />
                  ) : null}
                </div>
                {message.role === 'assistant' ? (
                  <div className="chat-bubble__content">
                    <ChatMarkdown content={message.content} />
                    {message.id === PENDING_ASSISTANT_ID && sending ? (
                      <span className="chat-bubble__cursor">▍</span>
                    ) : null}
                  </div>
                ) : (
                  <p>{message.content}</p>
                )}
              </article>
            )
          })
        )}

        {error ? (
          <div className="chat-panel__error">
            <p>{error}</p>
            {canRetry ? (
              <button type="button" onClick={() => void retryLastMessage()}>
                让星奈再试一次
              </button>
            ) : null}
          </div>
        ) : null}

        <div ref={messagesEndRef} className="chat-panel__scroll-anchor" aria-hidden />
      </div>
    </section>
  )
}
