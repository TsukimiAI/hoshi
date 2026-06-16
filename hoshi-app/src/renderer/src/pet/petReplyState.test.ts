import { describe, expect, it } from 'vitest'
import { PENDING_ASSISTANT_ID } from '../api/chat'
import { PENDING_FOLLOW_UP_ASSISTANT_ID } from '../chat/chatMessageState'
import type { ChatMessage } from '../types/chat'
import { hasPetReplyStreamPending, isPetReplySettled } from './petReplyState'

const sampleMessages: ChatMessage[] = [
  {
    id: PENDING_ASSISTANT_ID,
    role: 'assistant',
    content: '嗨',
    emotion: null,
    segments: [{ id: 's1', seq: 1, content: '嗨', emotion: 'normal', createdAt: '' }],
    createdAt: ''
  }
]

describe('hasPetReplyStreamPending', () => {
  it('detects main reply placeholder', () => {
    expect(hasPetReplyStreamPending(sampleMessages)).toBe(true)
  })

  it('detects follow-up placeholder', () => {
    expect(
      hasPetReplyStreamPending([
        {
          id: PENDING_FOLLOW_UP_ASSISTANT_ID,
          role: 'assistant',
          content: '',
          emotion: null,
          segments: [],
          createdAt: ''
        }
      ])
    ).toBe(true)
  })
})

describe('isPetReplySettled', () => {
  it('is false while main reply is pending', () => {
    expect(isPetReplySettled(true, 2, sampleMessages, false)).toBe(false)
  })

  it('is false while follow-up is streaming', () => {
    expect(
      isPetReplySettled(
        true,
        2,
        [
          {
            id: 'a1',
            role: 'assistant',
            content: '首轮',
            emotion: null,
            segments: [{ id: 's1', seq: 1, content: '首轮', emotion: 'normal', createdAt: '' }],
            createdAt: ''
          },
          {
            id: PENDING_FOLLOW_UP_ASSISTANT_ID,
            role: 'assistant',
            content: '',
            emotion: null,
            segments: [],
            createdAt: ''
          }
        ],
        true
      )
    ).toBe(false)
  })

  it('is true after all replies complete', () => {
    expect(
      isPetReplySettled(
        true,
        2,
        [
          {
            id: 'a1',
            role: 'assistant',
            content: '首轮',
            emotion: null,
            segments: [{ id: 's1', seq: 1, content: '首轮', emotion: 'normal', createdAt: '' }],
            createdAt: ''
          },
          {
            id: 'a2',
            role: 'assistant',
            content: '追加',
            emotion: null,
            segments: [{ id: 's2', seq: 1, content: '追加', emotion: 'normal', createdAt: '' }],
            createdAt: ''
          }
        ],
        false
      )
    ).toBe(true)
  })

  it('is false when hidden, empty, or still sending', () => {
    expect(isPetReplySettled(false, 2, [], false)).toBe(false)
    expect(isPetReplySettled(true, 0, [], false)).toBe(false)
    expect(isPetReplySettled(true, 2, [], true)).toBe(false)
  })
})
