import { PENDING_ASSISTANT_ID } from '../api/chat'
import type { ChatMessage, ChatMessageSegment } from '../types/chat'
import { DEFAULT_PET_EMOTION, resolvePetEmotion } from './petSprites'

/** 根据聊天状态解析桌宠应显示的情绪（与 SSE 句段同步，不依赖 WebSocket） */
export function resolveEmotionFromChatState(
  messages: ChatMessage[],
  sending: boolean
): string {
  if (sending) {
    const pending = messages.find((message) => message.id === PENDING_ASSISTANT_ID)
    if (!pending || pending.segments.length === 0) {
      return resolvePetEmotion('expect')
    }
    // segment_done 会写入 message.emotion；若用最新 segment 会在下一句打字时被 normal 覆盖
    const streamingEmotion = pending.emotion ?? findLatestClassifiedEmotion(pending.segments)
    if (streamingEmotion) {
      return resolvePetEmotion(streamingEmotion)
    }
    return resolvePetEmotion('expect')
  }

  return DEFAULT_PET_EMOTION
}

/** 取已判定情绪（跳过下一句占位用的 normal），保持句间表情连贯 */
function findLatestClassifiedEmotion(segments: ChatMessageSegment[]): string | undefined {
  const sorted = [...segments].sort((a, b) => b.seq - a.seq)
  for (const segment of sorted) {
    if (segment.emotion && segment.emotion !== 'normal') {
      return segment.emotion
    }
  }
  return undefined
}
