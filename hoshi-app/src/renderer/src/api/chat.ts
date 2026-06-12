import {
  apiFetch,
  buildAuthHeaders,
  notifyApiUnauthorized,
  resolveApiUrl,
  tryRefreshApiSession
} from '../lib/http'
import { readSseStream } from '../lib/sse'
import type { ChatMessage, ChatSession } from '../types/chat'

export const PENDING_ASSISTANT_ID = '__pending_assistant__'

export interface ChatStreamHandlers {
  onUserMessage?: (message: ChatMessage) => void
  onSegmentStart?: (segment: { seq: number; emotion: string; contentLength: number }) => void
  onSegmentEmotion?: (segment: { seq: number; emotion: string }) => void
  onSegmentDelta: (segment: { seq: number; content: string }) => void
  onSegmentDone?: (segment: { seq: number; content: string; emotion: string }) => void
  onDone: (message: ChatMessage) => void
  onSession?: (session: ChatSession) => void
  onError?: (message: string) => void
}

export interface ChatStreamOptions {
  signal?: AbortSignal
  retried?: boolean
}

export function fetchSessions() {
  return apiFetch<ChatSession[]>('/api/v1/chat/sessions')
}

export function createSession(title?: string) {
  return apiFetch<ChatSession>('/api/v1/chat/sessions', {
    method: 'POST',
    body: JSON.stringify(title ? { title } : {})
  })
}

export function fetchSession(sessionId: string) {
  return apiFetch<ChatSession>(`/api/v1/chat/sessions/${sessionId}`)
}

export function updateSessionTitle(sessionId: string, title: string) {
  return apiFetch<ChatSession>(`/api/v1/chat/sessions/${sessionId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title })
  })
}

export function deleteSession(sessionId: string) {
  return apiFetch<void>(`/api/v1/chat/sessions/${sessionId}`, {
    method: 'DELETE'
  })
}

export function fetchMessages(sessionId: string) {
  return apiFetch<ChatMessage[]>(`/api/v1/chat/sessions/${sessionId}/messages`)
}

export interface SendMessageBody {
  content: string
  webSearch?: boolean
}

export async function sendMessageStream(
  sessionId: string,
  content: string,
  handlers: ChatStreamHandlers,
  options: ChatStreamOptions & { webSearch?: boolean } = {}
): Promise<void> {
  const { webSearch, ...streamOptions } = options
  return consumeMessageStream(
    `/api/v1/chat/sessions/${sessionId}/messages`,
    { content, webSearch: webSearch === true },
    handlers,
    streamOptions
  )
}

export async function retryMessageStream(
  sessionId: string,
  handlers: ChatStreamHandlers,
  options: ChatStreamOptions = {}
): Promise<void> {
  return consumeMessageStream(
    `/api/v1/chat/sessions/${sessionId}/messages/retry`,
    undefined,
    handlers,
    options
  )
}

export async function regenerateMessageStream(
  sessionId: string,
  handlers: ChatStreamHandlers,
  options: ChatStreamOptions = {}
): Promise<void> {
  return consumeMessageStream(
    `/api/v1/chat/sessions/${sessionId}/messages/regenerate`,
    undefined,
    handlers,
    options
  )
}

export function deleteMessage(sessionId: string, messageId: string) {
  return apiFetch<void>(`/api/v1/chat/sessions/${sessionId}/messages/${messageId}`, {
    method: 'DELETE'
  })
}

async function consumeMessageStream(
  path: string,
  body: SendMessageBody | undefined,
  handlers: ChatStreamHandlers,
  options: ChatStreamOptions
): Promise<void> {
  const retried = options.retried ?? false
  const response = await fetch(resolveApiUrl(path), {
    method: 'POST',
    headers: {
      ...buildAuthHeaders(),
      Accept: 'text/event-stream'
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: options.signal
  })

  if (response.status === 401 && !retried) {
    const refreshed = await tryRefreshApiSession()
    if (refreshed) {
      return consumeMessageStream(path, body, handlers, { ...options, retried: true })
    }
    notifyApiUnauthorized()
    throw new Error('登录好像过期了，重新登录一下好吗？')
  }

  if (!response.ok) {
    const message = await readErrorMessage(response)
    if (response.status === 401) {
      notifyApiUnauthorized()
    }
    throw new Error(message)
  }

  let streamError: string | null = null

  await readSseStream(response, ({ event, data }) => {
    if (event === 'user') {
      handlers.onUserMessage?.(JSON.parse(data) as ChatMessage)
      return
    }
    if (event === 'delta') {
      return
    }
    if (event === 'segment_start') {
      handlers.onSegmentStart?.(JSON.parse(data) as { seq: number; emotion: string; contentLength: number })
      return
    }
    if (event === 'segment_emotion') {
      handlers.onSegmentEmotion?.(JSON.parse(data) as { seq: number; emotion: string })
      return
    }
    if (event === 'segment_delta') {
      handlers.onSegmentDelta(JSON.parse(data) as { seq: number; content: string })
      return
    }
    if (event === 'segment_done') {
      handlers.onSegmentDone?.(JSON.parse(data) as { seq: number; content: string; emotion: string })
      return
    }
    if (event === 'done') {
      handlers.onDone(JSON.parse(data) as ChatMessage)
      return
    }
    if (event === 'session') {
      handlers.onSession?.(JSON.parse(data) as ChatSession)
      return
    }
    if (event === 'error') {
      const payload = JSON.parse(data) as { code: number; message: string }
      streamError = payload.message
      handlers.onError?.(payload.message)
    }
  })

  if (streamError) {
    throw new Error(streamError)
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  const rawBody = await response.text()
  if (!rawBody) {
    return `请求失败: HTTP ${response.status}`
  }
  try {
    const payload = JSON.parse(rawBody) as { message?: string }
    return payload.message || `请求失败: HTTP ${response.status}`
  } catch {
    return rawBody
  }
}
