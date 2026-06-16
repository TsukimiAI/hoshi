import { PENDING_ASSISTANT_ID } from '../api/chat'
import { PENDING_FOLLOW_UP_ASSISTANT_ID } from '../chat/chatMessageState'
import type { ChatMessage } from '../types/chat'

export interface PetReplyBubble {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking?: boolean
}

const DEFAULT_MAX_BUBBLES = 4

const PENDING_ASSISTANT_IDS = new Set([PENDING_ASSISTANT_ID, PENDING_FOLLOW_UP_ASSISTANT_ID])

function isPendingAssistant(message: ChatMessage): boolean {
  return PENDING_ASSISTANT_IDS.has(message.id)
}

/** 当前轮次内、最近一次用户消息之后的所有星奈回复（含追加对话） */
function collectTurnAssistants(messages: ChatMessage[]): ChatMessage[] {
  let lastUserIndex = -1
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') {
      lastUserIndex = index
      break
    }
  }
  return messages.slice(lastUserIndex + 1).filter((message) => message.role === 'assistant')
}

export function buildPetReplyBubbles(
  messages: ChatMessage[],
  sending: boolean,
  showUserBubble: boolean,
  maxBubbles = DEFAULT_MAX_BUBBLES
): PetReplyBubble[] {
  const bubbles: PetReplyBubble[] = []

  if (showUserBubble) {
    const lastUser = [...messages].reverse().find((message) => message.role === 'user')
    if (lastUser?.content.trim()) {
      bubbles.push({
        id: `user-${lastUser.id}`,
        role: 'user',
        content: lastUser.content.trim()
      })
    }
  }

  const turnAssistants = collectTurnAssistants(messages)

  for (let index = 0; index < turnAssistants.length; index += 1) {
    const assistant = turnAssistants[index]
    const isStreamingTail =
      sending && isPendingAssistant(assistant) && index === turnAssistants.length - 1

    if (isStreamingTail && assistant.segments.every((segment) => !segment.content.trim())) {
      bubbles.push({
        id: `thinking-${assistant.id}`,
        role: 'assistant',
        content: '正在想…',
        thinking: true
      })
      continue
    }

    for (const segment of assistant.segments) {
      if (!segment.content.trim()) {
        continue
      }
      bubbles.push({
        id: segment.id,
        role: 'assistant',
        content: segment.content.trim()
      })
    }
  }

  return bubbles.slice(-maxBubbles)
}
