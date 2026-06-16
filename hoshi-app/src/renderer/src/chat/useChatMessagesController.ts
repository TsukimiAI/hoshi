import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import * as chatApi from '../api/chat'
import { PENDING_ASSISTANT_ID } from '../api/chat'
import { useAuth } from '../auth/AuthContext'
import { useMemory } from '../memory/MemoryContext'
import { useAppPreferences } from '../settings/useAppPreferences'
import type { ChatMessage } from '../types/chat'
import {
  appendPendingUserMessage,
  appendPendingFollowUpAssistant,
  ensurePendingAssistant,
  ensurePendingFollowUpAssistant,
  applyPendingAssistantDelta,
  applyPendingAssistantEmotion,
  applyPendingAssistantSegmentDone,
  applyPendingFollowUpDelta,
  applyPendingFollowUpEmotion,
  applyPendingFollowUpSegmentDone,
  isRetryAvailable,
  replacePendingAssistant,
  replacePendingFollowUpAssistant,
  replacePendingUserMessage
} from './chatMessageState'
import type { ChatMessagesContextValue } from './chatMessagesTypes'
import { useChatSessions } from './ChatSessionContext'

export function useChatMessagesController(): ChatMessagesContextValue {
  const { user } = useAuth()
  const { activeSessionId, refreshSessions, updateSessionInList } = useChatSessions()
  const { enqueueMemoryEvents } = useMemory()
  const { preferences } = useAppPreferences()
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

  const streamPlaybackOptions = useMemo(
    () => ({
      sentencePlaybackCharDelayMs: preferences.sentencePlaybackCharDelayMs,
      sentenceGapDelayMs: preferences.sentenceGapDelayMs
    }),
    [preferences.sentenceGapDelayMs, preferences.sentencePlaybackCharDelayMs]
  )

  const runStream = useCallback(
    async (
      streamFn: (
        sessionId: string,
        handlers: chatApi.ChatStreamHandlers,
        options: chatApi.ChatStreamOptions
      ) => Promise<void>,
      options: { tempUserId?: string; tempUserContent?: string; webSearchEnabled?: boolean } = {}
    ) => {
      if (!user || !activeSessionId) return

      abortControllerRef.current?.abort()
      const controller = new AbortController()
      abortControllerRef.current = controller

      setSending(true)
      setError(null)
      setCanRetry(false)

      if (options.tempUserId && options.tempUserContent) {
        setMessages((prev) =>
          appendPendingUserMessage(
            prev,
            options.tempUserId!,
            options.tempUserContent!,
            options.webSearchEnabled ?? false
          )
        )
      }

      let placeholderCreated = false

      try {
        await streamFn(
          activeSessionId,
          {
            onUserMessage: (userMessage) => {
              if (options.tempUserId) {
                setMessages((prev) => replacePendingUserMessage(prev, options.tempUserId!, userMessage))
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
                setMessages((prev) => applyPendingAssistantEmotion(prev, seq, emotion))
              })
            },
            onSegmentDelta: ({ seq, content }) => {
              flushSync(() => {
                setMessages((prev) => {
                  placeholderCreated = true
                  return applyPendingAssistantDelta(prev, seq, content)
                })
              })
            },
            onSegmentDone: ({ seq, content, emotion }) => {
              flushSync(() => {
                setMessages((prev) => applyPendingAssistantSegmentDone(prev, seq, content, emotion))
              })
            },
            onDone: (assistantMessage) => {
              setMessages((prev) => replacePendingAssistant(prev, assistantMessage))
            },
            onFollowUpStart: () => {
              setSending(true)
              setMessages((prev) => appendPendingFollowUpAssistant(prev))
            },
            onFollowUpSegmentStart: ({ seq }) => {
              setMessages((prev) => ensurePendingFollowUpAssistant(prev, seq, null))
            },
            onFollowUpSegmentEmotion: ({ seq, emotion }) => {
              flushSync(() => {
                setMessages((prev) => applyPendingFollowUpEmotion(prev, seq, emotion))
              })
            },
            onFollowUpSegmentDelta: ({ seq, content }) => {
              flushSync(() => {
                setMessages((prev) => applyPendingFollowUpDelta(prev, seq, content))
              })
            },
            onFollowUpSegmentDone: ({ seq, content, emotion }) => {
              flushSync(() => {
                setMessages((prev) => applyPendingFollowUpSegmentDone(prev, seq, content, emotion))
              })
            },
            onFollowUpDone: (assistantMessage) => {
              setMessages((prev) => replacePendingFollowUpAssistant(prev, assistantMessage))
            },
            onFollowUpEnd: () => {
              setSending(false)
            },
            onMemory: (memories) => {
              enqueueMemoryEvents(memories)
            },
            onSession: (session) => {
              updateSessionInList(session)
            }
          },
          { signal: controller.signal, playback: streamPlaybackOptions }
        )
        setSending(false)
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
    [
      activeSessionId,
      enqueueMemoryEvents,
      refreshMessages,
      refreshSessions,
      streamPlaybackOptions,
      updateSessionInList,
      user
    ]
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
          tempUserContent: trimmed,
          webSearchEnabled: webSearch
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

  return useMemo(
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
      canRetry,
      deleteMessage,
      error,
      loading,
      messages,
      refreshMessages,
      regenerateLastReply,
      retryLastMessage,
      sendMessage,
      sending,
      stopStreaming
    ]
  )
}
