import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PENDING_ASSISTANT_ID } from '../api/chat'
import { PENDING_FOLLOW_UP_ASSISTANT_ID } from '../chat/chatMessageState'
import { PetPreferencesProvider } from '../pet/usePetPreferences'
import type { ChatMessage } from '../types/chat'
import { PetReplyBubbles } from './PetReplyBubbles'

const stopStreaming = vi.fn()
const onDismiss = vi.fn()

const assistantStreaming: ChatMessage = {
  id: PENDING_ASSISTANT_ID,
  role: 'assistant',
  content: '星奈在说话',
  emotion: 'happy',
  segments: [
    {
      id: 'seg-1',
      seq: 1,
      content: '星奈在说话',
      emotion: 'happy',
      createdAt: '2026-01-01T00:00:01Z'
    }
  ],
  createdAt: '2026-01-01T00:00:01Z'
}

vi.mock('../chat/ChatMessagesContext', () => ({
  useChatMessages: vi.fn()
}))

import { useChatMessages } from '../chat/ChatMessagesContext'

function mockChatMessages(
  partial: Pick<ReturnType<typeof useChatMessages>, 'messages' | 'sending' | 'stopStreaming'>
): ReturnType<typeof useChatMessages> {
  return {
    loading: false,
    canRetry: false,
    error: null,
    sendMessage: vi.fn(),
    retryLastMessage: vi.fn(),
    regenerateLastReply: vi.fn(),
    deleteMessage: vi.fn(),
    refreshMessages: vi.fn(),
    ...partial
  }
}

function renderBubbles(visible = true): ReturnType<typeof render> {
  return render(
    <PetPreferencesProvider>
      <PetReplyBubbles visible={visible} onDismiss={onDismiss} />
    </PetPreferencesProvider>
  )
}

describe('PetReplyBubbles', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    stopStreaming.mockReset()
    onDismiss.mockReset()
  })

  it('shows stop button while sending', () => {
    vi.mocked(useChatMessages).mockReturnValue(
      mockChatMessages({
        messages: [assistantStreaming],
        sending: true,
        stopStreaming
      })
    )

    renderBubbles()

    expect(screen.getByRole('button', { name: '停止生成' })).toBeInTheDocument()
    expect(screen.getByText('星奈在说话')).toBeInTheDocument()
  })

  it('calls stopStreaming when stop is clicked', async () => {
    const user = userEvent.setup()

    vi.mocked(useChatMessages).mockReturnValue(
      mockChatMessages({
        messages: [assistantStreaming],
        sending: true,
        stopStreaming
      })
    )

    renderBubbles()
    await user.click(screen.getByRole('button', { name: '停止生成' }))

    expect(stopStreaming).toHaveBeenCalledTimes(1)
  })

  it('hides stop button after stream completes', () => {
    vi.mocked(useChatMessages).mockReturnValue(
      mockChatMessages({
        messages: [{ ...assistantStreaming, id: 'assistant-final' }],
        sending: false,
        stopStreaming
      })
    )

    renderBubbles()

    expect(screen.queryByRole('button', { name: '停止生成' })).not.toBeInTheDocument()
  })

  it('keeps stop button visible during follow-up streaming', () => {
    vi.mocked(useChatMessages).mockReturnValue(
      mockChatMessages({
        messages: [
          {
            id: 'assistant-final',
            role: 'assistant',
            content: '首轮回复',
            emotion: 'happy',
            segments: [
              {
                id: 'seg-main',
                seq: 1,
                content: '首轮回复',
                emotion: 'happy',
                createdAt: '2026-01-01T00:00:01Z'
              }
            ],
            createdAt: '2026-01-01T00:00:01Z'
          },
          {
            id: PENDING_FOLLOW_UP_ASSISTANT_ID,
            role: 'assistant',
            content: '追加中',
            emotion: 'normal',
            segments: [
              {
                id: 'seg-follow',
                seq: 1,
                content: '追加中',
                emotion: 'normal',
                createdAt: '2026-01-01T00:00:02Z'
              }
            ],
            createdAt: '2026-01-01T00:00:02Z'
          }
        ],
        sending: true,
        stopStreaming
      })
    )

    renderBubbles()

    expect(screen.getByRole('button', { name: '停止生成' })).toBeInTheDocument()
    expect(screen.getByText('首轮回复')).toBeInTheDocument()
    expect(screen.getByText('追加中')).toBeInTheDocument()
  })
})
