import { PENDING_ASSISTANT_ID } from '../api/chat'
import { PENDING_FOLLOW_UP_ASSISTANT_ID } from '../chat/chatMessageState'
import type { ChatMessage } from '../types/chat'

export function hasPetReplyStreamPending(messages: ChatMessage[]): boolean {
  return messages.some(
    (message) =>
      message.id === PENDING_ASSISTANT_ID || message.id === PENDING_FOLLOW_UP_ASSISTANT_ID
  )
}

/** 星奈回复（含追加对话）是否已全部落库，可开始滚出倒计时 */
export function isPetReplySettled(
  visible: boolean,
  bubbleCount: number,
  messages: ChatMessage[],
  sending: boolean
): boolean {
  return visible && bubbleCount > 0 && !hasPetReplyStreamPending(messages) && !sending
}
