import { PENDING_ASSISTANT_ID } from '../api/chat'
import type { ChatMessage, ChatMessageSegment } from '../types/chat'

export const PENDING_FOLLOW_UP_ASSISTANT_ID = '__pending_follow_up__'

export function isRetryAvailable(messages: ChatMessage[]): boolean {
  if (messages.length === 0) {
    return false
  }
  return messages[messages.length - 1].role === 'user'
}

export function appendPendingUserMessage(
  messages: ChatMessage[],
  tempUserId: string,
  tempUserContent: string,
  webSearchEnabled: boolean
): ChatMessage[] {
  return [
    ...messages,
    {
      id: tempUserId,
      role: 'user',
      content: tempUserContent,
      emotion: null,
      webSearchEnabled,
      segments: [],
      createdAt: new Date().toISOString()
    }
  ]
}

export function replacePendingUserMessage(
  messages: ChatMessage[],
  tempUserId: string,
  userMessage: ChatMessage
): ChatMessage[] {
  return [...messages.filter((message) => message.id !== tempUserId), userMessage]
}

export function ensurePendingAssistant(
  messages: ChatMessage[],
  seq: number,
  emotion: string | null
): ChatMessage[] {
  return ensurePendingMessage(messages, PENDING_ASSISTANT_ID, seq, emotion)
}

export function applyPendingAssistantEmotion(
  messages: ChatMessage[],
  seq: number,
  emotion: string
): ChatMessage[] {
  const next = ensurePendingAssistant(messages, seq, emotion)
  return next.map((message) =>
    message.id === PENDING_ASSISTANT_ID
      ? { ...message, emotion }
      : message
  )
}

export function applyPendingAssistantDelta(
  messages: ChatMessage[],
  seq: number,
  content: string
): ChatMessage[] {
  const next = ensurePendingAssistant(messages, seq, null)
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
}

export function applyPendingAssistantSegmentDone(
  messages: ChatMessage[],
  seq: number,
  content: string,
  emotion: string
): ChatMessage[] {
  return messages.map((message) => {
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
}

export function replacePendingAssistant(
  messages: ChatMessage[],
  assistantMessage: ChatMessage
): ChatMessage[] {
  return replacePendingMessage(messages, PENDING_ASSISTANT_ID, assistantMessage)
}

export function appendPendingFollowUpAssistant(messages: ChatMessage[]): ChatMessage[] {
  if (messages.some((message) => message.id === PENDING_FOLLOW_UP_ASSISTANT_ID)) {
    return messages
  }
  return [
    ...messages,
    {
      id: PENDING_FOLLOW_UP_ASSISTANT_ID,
      role: 'assistant' as const,
      content: '',
      emotion: null,
      segments: [],
      createdAt: new Date().toISOString()
    }
  ]
}

export function ensurePendingFollowUpAssistant(
  messages: ChatMessage[],
  seq: number,
  emotion: string | null
): ChatMessage[] {
  return ensurePendingMessage(messages, PENDING_FOLLOW_UP_ASSISTANT_ID, seq, emotion)
}

export function applyPendingFollowUpEmotion(
  messages: ChatMessage[],
  seq: number,
  emotion: string
): ChatMessage[] {
  return applyPendingEmotion(messages, PENDING_FOLLOW_UP_ASSISTANT_ID, seq, emotion)
}

export function applyPendingFollowUpDelta(
  messages: ChatMessage[],
  seq: number,
  content: string
): ChatMessage[] {
  return applyPendingDelta(messages, PENDING_FOLLOW_UP_ASSISTANT_ID, seq, content)
}

export function applyPendingFollowUpSegmentDone(
  messages: ChatMessage[],
  seq: number,
  content: string,
  emotion: string
): ChatMessage[] {
  return applyPendingSegmentDone(messages, PENDING_FOLLOW_UP_ASSISTANT_ID, seq, content, emotion)
}

export function replacePendingFollowUpAssistant(
  messages: ChatMessage[],
  assistantMessage: ChatMessage
): ChatMessage[] {
  return replacePendingMessage(messages, PENDING_FOLLOW_UP_ASSISTANT_ID, assistantMessage)
}

function replacePendingMessage(
  messages: ChatMessage[],
  pendingId: string,
  assistantMessage: ChatMessage
): ChatMessage[] {
  const hasPending = messages.some((message) => message.id === pendingId)
  if (!hasPending) {
    return [...messages, assistantMessage]
  }
  return messages.map((message) => (message.id === pendingId ? assistantMessage : message))
}

function applyPendingEmotion(
  messages: ChatMessage[],
  pendingId: string,
  seq: number,
  emotion: string
): ChatMessage[] {
  const next = ensurePendingMessage(messages, pendingId, seq, emotion)
  return next.map((message) => (message.id === pendingId ? { ...message, emotion } : message))
}

function applyPendingDelta(
  messages: ChatMessage[],
  pendingId: string,
  seq: number,
  content: string
): ChatMessage[] {
  const next = ensurePendingMessage(messages, pendingId, seq, null)
  return next.map((message) => {
    if (message.id !== pendingId) {
      return message
    }
    return {
      ...message,
      content: message.content + content,
      segments: message.segments.map((segment) =>
        segment.seq === seq ? { ...segment, content: segment.content + content } : segment
      )
    }
  })
}

function applyPendingSegmentDone(
  messages: ChatMessage[],
  pendingId: string,
  seq: number,
  content: string,
  emotion: string
): ChatMessage[] {
  return messages.map((message) => {
    if (message.id !== pendingId) {
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
}

function ensurePendingMessage(
  messages: ChatMessage[],
  pendingId: string,
  seq: number,
  emotion: string | null
): ChatMessage[] {
  const hasPlaceholder = messages.some((message) => message.id === pendingId)
  const next = hasPlaceholder
    ? messages
    : [
        ...messages,
        {
          id: pendingId,
          role: 'assistant' as const,
          content: '',
          emotion: null,
          segments: [],
          createdAt: new Date().toISOString()
        }
      ]

  return next.map((message) => {
    if (message.id !== pendingId) {
      return message
    }
    const hasSegment = message.segments.some((segment) => segment.seq === seq)
    const segments = hasSegment
      ? message.segments.map((segment) =>
          segment.seq === seq && emotion ? { ...segment, emotion } : segment
        )
      : [...message.segments, createPendingSegment(seq, emotion)]
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
