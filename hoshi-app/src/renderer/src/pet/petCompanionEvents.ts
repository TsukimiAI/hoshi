export interface CompanionEmotionEvent {
  type: 'emotion'
  value: string
}

export interface CompanionProactiveMessageEvent {
  type: 'proactive_message'
  sessionId: string
  messageId: string
  value: string
  emotion?: string
}

export type CompanionWsEvent = CompanionEmotionEvent | CompanionProactiveMessageEvent

export function parseCompanionWsEvent(raw: string): CompanionWsEvent | null {
  try {
    const payload = JSON.parse(raw) as {
      type?: string
      value?: string
      sessionId?: string
      messageId?: string
      emotion?: string
    }
    if (payload.type === 'emotion' && payload.value) {
      return { type: 'emotion', value: payload.value }
    }
    if (
      payload.type === 'proactive_message' &&
      payload.sessionId &&
      payload.messageId &&
      payload.value
    ) {
      return {
        type: 'proactive_message',
        sessionId: payload.sessionId,
        messageId: payload.messageId,
        value: payload.value,
        emotion: payload.emotion
      }
    }
    return null
  } catch {
    return null
  }
}
