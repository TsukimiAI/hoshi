import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatMessagesProvider, useChatMessages } from './ChatMessagesContext'
import type { ChatMessage } from '../types/chat'

const mockUser = {
  id: 1,
  username: 'tester',
  email: 'test@example.com',
  emailVerified: true
}

const refreshSessions = vi.fn().mockResolvedValue(undefined)
const enqueueMemoryEvents = vi.fn()

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: mockUser })
}))

vi.mock('./ChatSessionContext', () => ({
  useChatSessions: () => ({
    activeSessionId: '1',
    refreshSessions,
    updateSessionInList: vi.fn()
  })
}))

vi.mock('../memory/MemoryContext', () => ({
  useMemory: () => ({
    enqueueMemoryEvents
  })
}))

vi.mock('../settings/useAppPreferences', () => ({
  useAppPreferences: () => ({
    preferences: {
      sentencePlaybackCharDelayMs: 0,
      sentenceGapDelayMs: 0
    }
  })
}))

const fetchMessages = vi.fn().mockResolvedValue({ data: [] as ChatMessage[] })
const sendMessageStream = vi.fn()

vi.mock('../api/chat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/chat')>()
  return {
    ...actual,
    fetchMessages: (...args: unknown[]) => fetchMessages(...args),
    sendMessageStream: (...args: unknown[]) => sendMessageStream(...args)
  }
})

function Probe(): React.JSX.Element {
  const { sending, sendMessage } = useChatMessages()
  return (
    <div>
      <span data-testid="sending">{sending ? 'yes' : 'no'}</span>
      <button type="button" onClick={() => void sendMessage('你好', true)}>
        发送
      </button>
    </div>
  )
}

describe('ChatMessagesProvider', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('clears sending after the stream fully completes', async () => {
    const user = userEvent.setup()

    sendMessageStream.mockImplementation(async (_sessionId, _content, handlers) => {
      handlers.onDone({
        id: '42',
        role: 'assistant',
        content: '星奈的完整回复',
        emotion: 'happy',
        segments: [],
        createdAt: '2026-01-01T00:00:01Z'
      })
    })

    render(
      <ChatMessagesProvider>
        <Probe />
      </ChatMessagesProvider>
    )

    await waitFor(() => {
      expect(fetchMessages).toHaveBeenCalled()
    })

    await user.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() => {
      expect(screen.getByTestId('sending')).toHaveTextContent('no')
    })

    await waitFor(() => {
      expect(refreshSessions).toHaveBeenCalled()
    })
  })
})
