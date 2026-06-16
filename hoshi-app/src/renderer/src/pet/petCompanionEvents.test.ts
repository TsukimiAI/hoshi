import { describe, expect, it } from 'vitest'
import { parseCompanionWsEvent } from './petCompanionEvents'

describe('parseCompanionWsEvent', () => {
  it('parses proactive message payload', () => {
    const event = parseCompanionWsEvent(
      JSON.stringify({
        type: 'proactive_message',
        sessionId: '12',
        messageId: '99',
        value: '老师，面试准备得怎么样了？',
        emotion: 'expect'
      })
    )

    expect(event).toEqual({
      type: 'proactive_message',
      sessionId: '12',
      messageId: '99',
      value: '老师，面试准备得怎么样了？',
      emotion: 'expect'
    })
  })

  it('parses emotion payload', () => {
    const event = parseCompanionWsEvent(
      JSON.stringify({
        type: 'emotion',
        value: 'happy'
      })
    )

    expect(event).toEqual({
      type: 'emotion',
      value: 'happy'
    })
  })
})
