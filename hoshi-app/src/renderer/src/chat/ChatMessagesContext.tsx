import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { flushSync } from 'react-dom'
import * as chatApi from '../api/chat'
import { PENDING_ASSISTANT_ID } from '../api/chat'
import { useAuth } from '../auth/AuthContext'
import { useChatSessions } from './ChatSessionContext'
import type { ChatMessage } from '../types/chat'

interface ChatMessagesContextValue {
  messages: ChatMessage[]
  loading: boolean
  sending: boolean
  canRetry: boolean
  error: string | null
  sendMessage: (content: string) => Promise<void>
  stopStreaming: () => void
  retryLastMessage: () => Promise<void>
  refreshMessages: () => Promise<void>
}

const ChatMessagesContext = createContext<ChatMessagesContextValue | null>(null)

export function ChatMessagesProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { user } = useAuth()
  const { activeSessionId, refreshSessions } = useChatSessions()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [canRetry, setCanRetry] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const refreshMessages = useCallback(async () => {
    if (!user || !activeSessionId) {
      setMessages([])
      setError(null)
      setCanRetry(false)
      return
    }

    setLoading(true)
    try {
      const res = await chatApi.fetchMessages(activeSessionId)
      setMessages(res.data)
      setError(null)
      setCanRetry(isRetryAvailable(res.data))
    } catch (err) {
      setMessages([])
      setError(err instanceof Error ? err.message : '消息加载失败了…')
      setCanRetry(false)
    } finally {
      setLoading(false)
    }
  }, [activeSessionId, user])

  useEffect(() => {
    void refreshMessages()
  }, [refreshMessages])

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  const runStream = useCallback(
    async (
      streamFn: (
        sessionId: string,
        handlers: chatApi.ChatStreamHandlers,
        options: chatApi.ChatStreamOptions
      ) => Promise<void>,
      options: { tempUserId?: string; tempUserContent?: string } = {}
    ) => {
      if (!user || !activeSessionId) return

      const controller = new AbortController()
      abortControllerRef.current = controller

      setSending(true)
      setError(null)
      setCanRetry(false)

      if (options.tempUserId && options.tempUserContent) {
        setMessages((prev) => [
          ...prev,
          {
            id: options.tempUserId!,
            role: 'user',
            content: options.tempUserContent!,
            createdAt: new Date().toISOString()
          }
        ])
      }

      let placeholderCreated = false

      try {
        await streamFn(
          activeSessionId,
          {
            onUserMessage: (userMessage) => {
              if (options.tempUserId) {
                setMessages((prev) => [
                  ...prev.filter((message) => message.id !== options.tempUserId),
                  userMessage
                ])
              }
              setMessages((prev) => {
                if (prev.some((message) => message.id === PENDING_ASSISTANT_ID)) {
                  return prev
                }
                placeholderCreated = true
                return [
                  ...prev,
                  {
                    id: PENDING_ASSISTANT_ID,
                    role: 'assistant',
                    content: '',
                    createdAt: new Date().toISOString()
                  }
                ]
              })
            },
            onDelta: (delta) => {
              flushSync(() => {
                setMessages((prev) => {
                  const hasPlaceholder = prev.some((message) => message.id === PENDING_ASSISTANT_ID)
                  const next = hasPlaceholder
                    ? prev
                    : [
                        ...prev,
                        {
                          id: PENDING_ASSISTANT_ID,
                          role: 'assistant' as const,
                          content: '',
                          createdAt: new Date().toISOString()
                        }
                      ]
                  placeholderCreated = true
                  return next.map((message) =>
                    message.id === PENDING_ASSISTANT_ID
                      ? { ...message, content: message.content + delta }
                      : message
                  )
                })
              })
            },
            onDone: (assistantMessage) => {
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === PENDING_ASSISTANT_ID ? assistantMessage : message
                )
              )
            }
          },
          { signal: controller.signal }
        )
        await refreshSessions()
        await refreshMessages()
      } catch (err) {
        if (controller.signal.aborted) {
          setMessages((prev) => prev.filter((message) => message.id !== PENDING_ASSISTANT_ID))
          setError(null)
          await refreshMessages()
          return
        }

        if (options.tempUserId) {
          setMessages((prev) => prev.filter((message) => message.id !== options.tempUserId))
        }
        if (placeholderCreated) {
          setMessages((prev) => prev.filter((message) => message.id !== PENDING_ASSISTANT_ID))
        }

        await refreshMessages()
        setCanRetry(true)
        setError(err instanceof Error ? err.message : '发送失败了…')
        throw err
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null
        }
        setSending(false)
      }
    },
    [activeSessionId, refreshMessages, refreshSessions, user]
  )

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim()
      const tempUserId = `__pending_user_${Date.now()}`
      await runStream(
        (sessionId, handlers, options) => chatApi.sendMessageStream(sessionId, trimmed, handlers, options),
        {
          tempUserId,
          tempUserContent: trimmed
        }
      )
    },
    [runStream]
  )

  const retryLastMessage = useCallback(async () => {
    await runStream(chatApi.retryMessageStream)
  }, [runStream])

  const value = useMemo(
    () => ({
      messages,
      loading,
      sending,
      canRetry,
      error,
      sendMessage,
      stopStreaming,
      retryLastMessage,
      refreshMessages
    }),
    [messages, loading, sending, canRetry, error, sendMessage, stopStreaming, retryLastMessage, refreshMessages]
  )

  return <ChatMessagesContext.Provider value={value}>{children}</ChatMessagesContext.Provider>
}

export function useChatMessages(): ChatMessagesContextValue {
  const context = useContext(ChatMessagesContext)
  if (!context) {
    throw new Error('useChatMessages must be used within ChatMessagesProvider')
  }
  return context
}

function isRetryAvailable(messages: ChatMessage[]): boolean {
  if (messages.length === 0) {
    return false
  }
  return messages[messages.length - 1].role === 'user'
}
