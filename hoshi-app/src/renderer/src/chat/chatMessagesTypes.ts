import type { ChatMessage } from '../types/chat'

export interface ChatMessagesContextValue {
  messages: ChatMessage[]
  loading: boolean
  sending: boolean
  canRetry: boolean
  error: string | null
  sendMessage: (content: string, webSearch?: boolean) => Promise<void>
  stopStreaming: () => void
  retryLastMessage: () => Promise<void>
  regenerateLastReply: () => Promise<void>
  deleteMessage: (messageId: string) => Promise<void>
  refreshMessages: (options?: { silent?: boolean }) => Promise<void>
}
