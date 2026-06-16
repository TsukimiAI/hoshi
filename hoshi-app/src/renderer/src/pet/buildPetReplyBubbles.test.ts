import { describe, expect, it } from 'vitest'
import { PENDING_ASSISTANT_ID } from '../api/chat'
import { PENDING_FOLLOW_UP_ASSISTANT_ID } from '../chat/chatMessageState'
import type { ChatMessage } from '../types/chat'
import { buildPetReplyBubbles } from './buildPetReplyBubbles'

const userMessage: ChatMessage = {
  id: 'u1',
  role: 'user',
  content: '你好',
  emotion: null,
  segments: [],
  createdAt: '2026-01-01T00:00:00Z'
}

const assistantMessage: ChatMessage = {
  id: PENDING_ASSISTANT_ID,
  role: 'assistant',
  content: '嗨',
  emotion: 'happy',
  segments: [
    {
      id: 's1',
      seq: 1,
      content: '嗨～',
      emotion: 'happy',
      createdAt: '2026-01-01T00:00:01Z'
    }
  ],
  createdAt: '2026-01-01T00:00:01Z'
}

describe('buildPetReplyBubbles', () => {
  it('shows thinking bubble while streaming without segments', () => {
    const bubbles = buildPetReplyBubbles([userMessage, { ...assistantMessage, segments: [] }], true, true)
    expect(bubbles.some((bubble) => bubble.thinking)).toBe(true)
  })

  it('includes user and assistant bubbles when enabled', () => {
    const bubbles = buildPetReplyBubbles([userMessage, assistantMessage], false, true)
    expect(bubbles.some((bubble) => bubble.role === 'user')).toBe(true)
    expect(bubbles.some((bubble) => bubble.content === '嗨～')).toBe(true)
  })

  it('hides user bubble in pet reply mode', () => {
    const bubbles = buildPetReplyBubbles([userMessage, assistantMessage], false, false)
    expect(bubbles.some((bubble) => bubble.role === 'user')).toBe(false)
    expect(bubbles.some((bubble) => bubble.role === 'assistant')).toBe(true)
  })

  it('limits bubbles to the configured maximum', () => {
    const manySegments = Array.from({ length: 6 }, (_, index) => ({
      id: `s${index}`,
      seq: index + 1,
      content: `段落 ${index}`,
      emotion: 'happy' as const,
      createdAt: '2026-01-01T00:00:00Z'
    }))
    const bubbles = buildPetReplyBubbles(
      [
        userMessage,
        {
          ...assistantMessage,
          segments: manySegments
        }
      ],
      false,
      false,
      3
    )
    expect(bubbles).toHaveLength(3)
  })

  it('shows main reply and follow-up bubbles in the same turn', () => {
    const mainReply: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '首轮回复',
      emotion: 'happy',
      segments: [
        {
          id: 's-main',
          seq: 1,
          content: '首轮回复',
          emotion: 'happy',
          createdAt: '2026-01-01T00:00:01Z'
        }
      ],
      createdAt: '2026-01-01T00:00:01Z'
    }
    const followUpReply: ChatMessage = {
      id: 'a2',
      role: 'assistant',
      content: '追加一句',
      emotion: 'normal',
      segments: [
        {
          id: 's-follow',
          seq: 1,
          content: '追加一句',
          emotion: 'normal',
          createdAt: '2026-01-01T00:00:02Z'
        }
      ],
      createdAt: '2026-01-01T00:00:02Z'
    }

    const bubbles = buildPetReplyBubbles([userMessage, mainReply, followUpReply], false, false)

    expect(bubbles.map((bubble) => bubble.content)).toEqual(['首轮回复', '追加一句'])
  })

  it('shows thinking bubble while follow-up is pending', () => {
    const mainReply: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '首轮回复',
      emotion: 'happy',
      segments: [
        {
          id: 's-main',
          seq: 1,
          content: '首轮回复',
          emotion: 'happy',
          createdAt: '2026-01-01T00:00:01Z'
        }
      ],
      createdAt: '2026-01-01T00:00:01Z'
    }
    const pendingFollowUp: ChatMessage = {
      id: PENDING_FOLLOW_UP_ASSISTANT_ID,
      role: 'assistant',
      content: '',
      emotion: null,
      segments: [],
      createdAt: '2026-01-01T00:00:02Z'
    }

    const bubbles = buildPetReplyBubbles([userMessage, mainReply, pendingFollowUp], true, false)

    expect(bubbles.some((bubble) => bubble.content === '首轮回复')).toBe(true)
    expect(bubbles.some((bubble) => bubble.thinking)).toBe(true)
  })
})
