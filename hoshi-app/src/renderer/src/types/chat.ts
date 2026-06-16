export interface ChatSession {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  emotion: string | null
  webSearchEnabled?: boolean
  segments: ChatMessageSegment[]
  createdAt: string
}

export interface ChatMessageSegment {
  id: string
  seq: number
  content: string
  emotion: string
  createdAt: string
}

export interface SendChatMessageResult {
  userMessage: ChatMessage
  assistantMessage: ChatMessage
}
