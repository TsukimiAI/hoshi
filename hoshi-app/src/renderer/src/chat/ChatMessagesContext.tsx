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
import type { ChatMessage, ChatMessageSegment } from '../types/chat'

interface ChatMessagesContextValue {
  messages: ChatMessage[]
  loading: boolean
  sending: boolean
  canRetry: boolean
  error: string | null
  sendMessage: (content: string, webSearch?: boolean) => Promise<void>
  stopStreaming: () => void
  retryLastMessage: () => Promise<void>
  regenerateLastReply: () => Promise<void>
  deleteMessage: (messageId: string) => Promise<void>
  refreshMessages: (options?: { silent?: boolean }) => Promise<void>
}

const ChatMessagesContext = createContext<ChatMessagesContextValue | null>(null)

export function ChatMessagesProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { user } = useAuth()
  const { activeSessionId, refreshSessions, updateSessionInList } = useChatSessions()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [canRetry, setCanRetry] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const refreshMessages = useCallback(async (options?: { silent?: boolean }) => {
    if (!user || !activeSessionId) {
      setMessages([])
      setError(null)
      setCanRetry(false)
      return
    }

    const silent = options?.silent === true
    if (!silent) {
      setLoading(true)
    }
    try {
      const res = await chatApi.fetchMessages(activeSessionId)
      setMessages(res.data)
      if (!silent) {
        setError(null)
      }
      setCanRetry(isRetryAvailable(res.data))
    } catch (err) {
      if (!silent) {
        setMessages([])
        setError(err instanceof Error ? err.message : '消息加载失败了…')
        setCanRetry(false)
      }
    } finally {
      if (!silent) {
        setLoading(false)
      }
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
            emotion: null,
            segments: [],
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
                    emotion: null,
                    segments: [],
                    createdAt: new Date().toISOString()
                  }
                ]
              })
            },
            onSegmentStart: ({ seq }) => {
              setMessages((prev) => ensurePendingAssistant(prev, seq, null))
            },
            onSegmentEmotion: ({ seq, emotion }) => {
              flushSync(() => {
                setMessages((prev) => {
                  const next = ensurePendingAssistant(prev, seq, emotion)
                  return next.map((message) =>
                    message.id === PENDING_ASSISTANT_ID
                      ? { ...message, emotion }
                      : message
                  )
                })
              })
            },
            onSegmentDelta: ({ seq, content }) => {
              flushSync(() => {
                setMessages((prev) => {
                  placeholderCreated = true
                  const next = ensurePendingAssistant(prev, seq, null)
                  return next.map((message) => {
                    if (message.id !== PENDING_ASSISTANT_ID) {
                      return message
                    }
                    return {
                      ...message,
                      content: message.content + content,
                      segments: message.segments.map((segment) =>
                        segment.seq === seq
                          ? { ...segment, content: segment.content + content }
                          : segment
                      )
                    }
                  })
                })
              })
            },
            onSegmentDone: ({ seq, content, emotion }) => {
              flushSync(() => {
                setMessages((prev) =>
                  prev.map((message) => {
                    if (message.id !== PENDING_ASSISTANT_ID) {
                      return message
                    }
                    const hasSegment = message.segments.some((segment) => segment.seq === seq)
                    const segments = hasSegment
                      ? message.segments.map((segment) =>
                          segment.seq === seq ? { ...segment, content, emotion } : segment
                        )
                      : [
                          ...message.segments,
                          {
                            id: `__pending_segment_${seq}`,
                            seq,
                            content,
                            emotion,
                            createdAt: new Date().toISOString()
                          }
                        ]
                    return {
                      ...message,
                      emotion,
                      segments
                    }
                  })
                )
              })
            },
            onDone: (assistantMessage) => {
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === PENDING_ASSISTANT_ID ? assistantMessage : message
                )
              )
            },
            onSession: (session) => {
              updateSessionInList(session)
            }
          },
          { signal: controller.signal }
        )
        await refreshSessions()
      } catch (err) {
        if (controller.signal.aborted) {
          setMessages((prev) => prev.filter((message) => message.id !== PENDING_ASSISTANT_ID))
          setError(null)
          await refreshMessages({ silent: true })
          return
        }

        if (options.tempUserId) {
          setMessages((prev) => prev.filter((message) => message.id !== options.tempUserId))
        }
        if (placeholderCreated) {
          setMessages((prev) => prev.filter((message) => message.id !== PENDING_ASSISTANT_ID))
        }

        await refreshMessages({ silent: true })
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
    [activeSessionId, refreshMessages, refreshSessions, updateSessionInList, user]
  )

  const sendMessage = useCallback(
    async (content: string, webSearch = false) => {
      const trimmed = content.trim()
      const tempUserId = `__pending_user_${Date.now()}`
      await runStream(
        (sessionId, handlers, options) =>
          chatApi.sendMessageStream(sessionId, trimmed, handlers, { ...options, webSearch }),
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

  const regenerateLastReply = useCallback(async () => {
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (!last || last.role !== 'assistant' || last.id === PENDING_ASSISTANT_ID) {
        return prev
      }
      return prev.slice(0, -1)
    })
    await runStream(chatApi.regenerateMessageStream)
  }, [runStream])

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!user || !activeSessionId || sending) return

      await chatApi.deleteMessage(activeSessionId, messageId)
      setMessages((prev) => prev.filter((message) => message.id !== messageId))
      setCanRetry(false)
      setError(null)
      await refreshSessions()
    },
    [activeSessionId, refreshSessions, sending, user]
  )

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
      regenerateLastReply,
      deleteMessage,
      refreshMessages
    }),
    [
      messages,
      loading,
      sending,
      canRetry,
      error,
      sendMessage,
      stopStreaming,
      retryLastMessage,
      regenerateLastReply,
      deleteMessage,
      refreshMessages
    ]
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

function ensurePendingAssistant(
  messages: ChatMessage[],
  seq: number,
  emotion: string | null
): ChatMessage[] {
  const hasPlaceholder = messages.some((message) => message.id === PENDING_ASSISTANT_ID)
  const next = hasPlaceholder
    ? messages
    : [
        ...messages,
        {
          id: PENDING_ASSISTANT_ID,
          role: 'assistant' as const,
          content: '',
          emotion: null,
          segments: [],
          createdAt: new Date().toISOString()
        }
      ]

  return next.map((message) => {
    if (message.id !== PENDING_ASSISTANT_ID) {
      return message
    }
    const hasSegment = message.segments.some((segment) => segment.seq === seq)
    const segments = hasSegment
      ? message.segments.map((segment) =>
          segment.seq === seq && emotion
            ? { ...segment, emotion }
            : segment
        )
      : [
          ...message.segments,
          createPendingSegment(seq, emotion)
        ]
    return {
      ...message,
      emotion: resolveStreamingEmotion(emotion, message.emotion),
      segments
    }
  })
}

function resolveStreamingEmotion(
  incoming: string | null,
  current: string | null
): string | null {
  if (incoming && incoming !== 'normal') {
    return incoming
  }
  return current
}

function createPendingSegment(seq: number, emotion: string | null): ChatMessageSegment {
  return {
    id: `__pending_segment_${seq}`,
    seq,
    content: '',
    emotion: emotion && emotion !== 'normal' ? emotion : 'normal',
    createdAt: new Date().toISOString()
  }
}
