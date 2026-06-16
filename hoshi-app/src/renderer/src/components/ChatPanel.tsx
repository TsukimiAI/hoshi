import { useEffect, useRef } from 'react'
import { PENDING_ASSISTANT_ID } from '../api/chat'
import { useAuth } from '../auth/AuthContext'
import { useChatMessages } from '../chat/ChatMessagesContext'
import { useChatSessions } from '../chat/ChatSessionContext'
import { useMemory } from '../memory/MemoryContext'
import { UserAvatar } from '../settings/UserAvatar'
import { useAppPreferences } from '../settings/useAppPreferences'
import type { ChatMessage } from '../types/chat'
import { ChatMarkdown } from './ChatMarkdown'
import { ChatMessageActions } from './ChatMessageActions'
import { MemoryPanel } from './MemoryPanel'
import { WebSearchBadge } from './WebSearchBadge'

function ChatMessageBubble({
  message,
  isLastAssistant,
  user,
  sending
}: {
  message: ChatMessage
  isLastAssistant: boolean
  user: NonNullable<ReturnType<typeof useAuth>['user']> | null
  sending: boolean
}): React.JSX.Element {
  const isUser = message.role === 'user'
  const isPending = message.id === PENDING_ASSISTANT_ID

  return (
    <article className={`chat-bubble chat-bubble--${message.role}`}>
      <div className="chat-bubble__inner">
        <div className="chat-bubble__header">
          <div className="chat-bubble__meta">
            <span className="chat-bubble__role">{isUser ? '你' : '星奈'}</span>
            {isUser && message.webSearchEnabled ? <WebSearchBadge /> : null}
          </div>
          {!isPending ? (
            <ChatMessageActions message={message} isLastAssistant={isLastAssistant} />
          ) : null}
        </div>
        <div className="chat-bubble__surface">
          {message.role === 'assistant' ? (
            <div className="chat-bubble__content">
              <ChatMarkdown content={message.content} streaming={isPending && sending} />
              {isPending ? <span className="chat-bubble__cursor">▍</span> : null}
            </div>
          ) : (
            <p>{message.content}</p>
          )}
        </div>
      </div>
      {isUser && user ? <UserAvatar user={user} size="chat" className="chat-bubble__avatar" /> : null}
    </article>
  )
}

function AssistantPlaceholder({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <article className="chat-bubble chat-bubble--assistant">
      <div className="chat-bubble__inner">
        <span className="chat-bubble__role">星奈</span>
        <div className="chat-bubble__surface">
          <p>{children}</p>
        </div>
      </div>
    </article>
  )
}

export function ChatPanel(): React.JSX.Element {
  const { user } = useAuth()
  const { activeSession } = useChatSessions()
  const { messages, loading, error, sending, canRetry, retryLastMessage } = useChatMessages()
  const { workspaceTab, setWorkspaceTab } = useMemory()
  const { preferences } = useAppPreferences()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const prevWorkspaceTabRef = useRef(workspaceTab)

  const subtitle =
    workspaceTab === 'memory'
      ? '星奈记住的点点滴滴'
      : !user
        ? '聊天与 Canvas 输出'
        : activeSession
          ? `当前会话：${activeSession.title}`
          : `你好，${user.username}`

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth'): void => {
    messagesEndRef.current?.scrollIntoView({ behavior })
  }

  useEffect(() => {
    const tabJustSwitchedToChat =
      prevWorkspaceTabRef.current !== 'chat' && workspaceTab === 'chat'
    prevWorkspaceTabRef.current = workspaceTab

    if (workspaceTab !== 'chat' || !preferences.autoScrollChat || tabJustSwitchedToChat) {
      return
    }

    const container = messagesContainerRef.current
    if (!container) return

    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    const shouldStickToBottom = distanceToBottom < 120 || sending

    if (shouldStickToBottom) {
      scrollToBottom(sending ? 'auto' : 'smooth')
    }
  }, [messages, preferences.autoScrollChat, sending, workspaceTab])

  useEffect(() => {
    if (workspaceTab !== 'chat' || !sending || !preferences.autoScrollChat) {
      return
    }
    scrollToBottom('auto')
  }, [messages, preferences.autoScrollChat, sending, workspaceTab])

  return (
    <section className="chat-panel">
      <div className="chat-panel__header">
        <div>
          <h2>工作区</h2>
          <p>{subtitle}</p>
        </div>
        <div className="chat-panel__tabs">
          <button
            type="button"
            className={workspaceTab === 'chat' ? 'active' : ''}
            onClick={() => setWorkspaceTab('chat')}
          >
            对话
          </button>
          <button
            type="button"
            className={workspaceTab === 'memory' ? 'active' : ''}
            onClick={() => setWorkspaceTab('memory')}
          >
            记忆
          </button>
          <button type="button" disabled>
            Canvas
          </button>
        </div>
      </div>

      <div className="chat-panel__workspace">
        <div
          ref={messagesContainerRef}
          className={`chat-panel__messages${workspaceTab !== 'chat' ? ' chat-panel__workspace-pane--hidden' : ''}`}
          hidden={workspaceTab !== 'chat'}
        >
          {!user ? (
            <AssistantPlaceholder>登录后即可开始对话，Canvas 输出也会出现在这里。</AssistantPlaceholder>
          ) : loading ? (
            <p className="chat-panel__status">正在加载消息…</p>
          ) : messages.length === 0 ? (
            <AssistantPlaceholder>你好，我是星奈。想聊点什么？</AssistantPlaceholder>
          ) : (
            messages.map((message, index) => {
              const isLastAssistant =
                message.role === 'assistant' &&
                message.id !== PENDING_ASSISTANT_ID &&
                !messages.slice(index + 1).some((item) => item.role === 'assistant')

              return (
                <ChatMessageBubble
                  key={message.id}
                  message={message}
                  isLastAssistant={isLastAssistant}
                  user={user}
                  sending={sending}
                />
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
        <div
          className={`chat-panel__memory-host${workspaceTab !== 'memory' ? ' chat-panel__workspace-pane--hidden' : ''}`}
          hidden={workspaceTab !== 'memory'}
        >
          <MemoryPanel />
        </div>
      </div>
    </section>
  )
}
