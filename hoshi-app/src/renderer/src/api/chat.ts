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
  onDelta: (delta: string) => void
  onDone: (message: ChatMessage) => void
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

export async function sendMessageStream(
  sessionId: string,
  content: string,
  handlers: ChatStreamHandlers,
  options: ChatStreamOptions = {}
): Promise<void> {
  return consumeMessageStream(
    `/api/v1/chat/sessions/${sessionId}/messages`,
    { content },
    handlers,
    options
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

async function consumeMessageStream(
  path: string,
  body: { content: string } | undefined,
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
      const payload = JSON.parse(data) as { content: string }
      handlers.onDelta(payload.content)
      return
    }
    if (event === 'done') {
      handlers.onDone(JSON.parse(data) as ChatMessage)
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
