import { describe, expect, it } from 'vitest'
import { PENDING_ASSISTANT_ID } from '../api/chat'
import { PENDING_FOLLOW_UP_ASSISTANT_ID } from '../chat/chatMessageState'
import type { ChatMessage, ChatMessageSegment } from '../types/chat'
import { resolveEmotionFromChatState } from './petEmotion'
import { DEFAULT_PET_EMOTION } from './petSprites'

function segment(
  seq: number,
  emotion: string,
  content = '句子'
): ChatMessageSegment {
  return {
    id: `seg-${seq}`,
    seq,
    content,
    emotion,
    createdAt: '2026-01-01T00:00:00Z'
  }
}

function pendingAssistant(
  partial: Partial<ChatMessage> & { segments?: ChatMessageSegment[] } = {}
): ChatMessage {
  return {
    id: PENDING_ASSISTANT_ID,
    role: 'assistant',
    content: '',
    emotion: null,
    segments: [],
    createdAt: '2026-01-01T00:00:00Z',
    ...partial
  }
}

describe('resolveEmotionFromChatState', () => {
  it('returns normal when idle', () => {
    expect(resolveEmotionFromChatState([], false)).toBe(DEFAULT_PET_EMOTION)
  })

  it('returns expect while streaming before any segment arrives', () => {
    expect(resolveEmotionFromChatState([pendingAssistant()], true)).toBe('expect')
  })

  it('returns expect while streaming with empty segments', () => {
    expect(resolveEmotionFromChatState([pendingAssistant({ segments: [] })], true)).toBe('expect')
  })

  it('uses pending message emotion when available', () => {
    const messages = [pendingAssistant({ emotion: 'happy', segments: [segment(1, 'normal')] })]
    expect(resolveEmotionFromChatState(messages, true)).toBe('happy')
  })

  it('falls back to latest classified segment emotion', () => {
    const messages = [
      pendingAssistant({
        emotion: null,
        segments: [segment(1, 'happy'), segment(2, 'normal')]
      })
    ]
    expect(resolveEmotionFromChatState(messages, true)).toBe('happy')
  })

  it('prefers higher seq when searching segment emotions', () => {
    const messages = [
      pendingAssistant({
        emotion: null,
        segments: [segment(1, 'happy'), segment(2, 'shy')]
      })
    ]
    expect(resolveEmotionFromChatState(messages, true)).toBe('shy')
  })

  it('maps legacy chinese emotion labels', () => {
    const messages = [pendingAssistant({ emotion: '开心', segments: [segment(1, 'normal')] })]
    expect(resolveEmotionFromChatState(messages, true)).toBe('happy')
  })

  it('ignores pending assistant when not sending', () => {
    const messages = [pendingAssistant({ emotion: 'happy', segments: [segment(1, 'happy')] })]
    expect(resolveEmotionFromChatState(messages, false)).toBe(DEFAULT_PET_EMOTION)
  })

  it('prefers follow-up pending over main assistant when both exist', () => {
    const messages = [
      pendingAssistant({ emotion: 'happy', segments: [segment(1, 'happy')] }),
      {
        id: PENDING_FOLLOW_UP_ASSISTANT_ID,
        role: 'assistant' as const,
        content: '',
        emotion: 'shy',
        segments: [segment(1, 'normal')],
        createdAt: '2026-01-01T00:00:00Z'
      }
    ]
    expect(resolveEmotionFromChatState(messages, true)).toBe('shy')
  })

  it('uses follow-up segment emotion when message emotion is missing', () => {
    const messages = [
      {
        id: PENDING_FOLLOW_UP_ASSISTANT_ID,
        role: 'assistant' as const,
        content: '',
        emotion: null,
        segments: [segment(1, 'happy')],
        createdAt: '2026-01-01T00:00:00Z'
      }
    ]
    expect(resolveEmotionFromChatState(messages, true)).toBe('happy')
  })
})
