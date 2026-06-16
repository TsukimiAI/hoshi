import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PENDING_ASSISTANT_ID } from '../api/chat'
import { PetPreferencesProvider } from '../pet/usePetPreferences'
import { getPetSprite } from '../pet/petSprites'
import type { ChatMessage } from '../types/chat'
import { PetStage } from './PetStage'

const emotionListeners = new Set<(event: { type: 'emotion'; value: string }) => void>()

vi.mock('../chat/ChatMessagesContext', () => ({
  useChatMessages: vi.fn()
}))

vi.mock('../pet/PetCompanionEventsProvider', () => ({
  usePetCompanionEvents: () => ({
    subscribeEmotion: (listener: (event: { type: 'emotion'; value: string }) => void) => {
      emotionListeners.add(listener)
      return () => emotionListeners.delete(listener)
    },
    subscribeProactiveMessage: () => () => undefined
  })
}))

vi.mock('../pet/usePetWindowDrag', () => ({
  usePetWindowDrag: () => ({
    onPointerDown: vi.fn(),
    onPointerMove: vi.fn(),
    onPointerUp: vi.fn(),
    onPointerCancel: vi.fn()
  })
}))

vi.mock('../memory/MemoryContext', () => ({
  useMemory: () => ({
    activeToast: null,
    dismissToast: vi.fn()
  })
}))

vi.mock('./MemoryEventToast', () => ({
  MemoryEventToast: () => null
}))

import { useChatMessages } from '../chat/ChatMessagesContext'

function mockChatMessages(
  partial: Pick<ReturnType<typeof useChatMessages>, 'messages' | 'sending'>
): ReturnType<typeof useChatMessages> {
  return {
    loading: false,
    canRetry: false,
    error: null,
    sending: partial.sending,
    messages: partial.messages,
    sendMessage: vi.fn(),
    stopStreaming: vi.fn(),
    retryLastMessage: vi.fn(),
    regenerateLastReply: vi.fn(),
    deleteMessage: vi.fn(),
    refreshMessages: vi.fn()
  }
}

const pendingHappy: ChatMessage = {
  id: PENDING_ASSISTANT_ID,
  role: 'assistant',
  content: '你好呀',
  emotion: 'happy',
  segments: [
    {
      id: 'seg-1',
      seq: 1,
      content: '你好呀',
      emotion: 'happy',
      createdAt: '2026-01-01T00:00:01Z'
    }
  ],
  createdAt: '2026-01-01T00:00:01Z'
}

function renderStage(
  partial: Pick<ReturnType<typeof useChatMessages>, 'messages' | 'sending'>
): ReturnType<typeof render> {
  vi.mocked(useChatMessages).mockReturnValue(mockChatMessages(partial))
  return render(
    <PetPreferencesProvider>
      <PetStage variant="panel" memoryToastVisible={false} />
    </PetPreferencesProvider>
  )
}

function spriteSrc(): string {
  return screen.getByRole('img', { name: '星奈' }).getAttribute('src') ?? ''
}

describe('PetStage', () => {
  afterEach(() => {
    cleanup()
    emotionListeners.clear()
    vi.clearAllMocks()
  })

  it('shows normal sprite when idle', () => {
    renderStage({ messages: [], sending: false })
    expect(spriteSrc()).toBe(getPetSprite('normal'))
  })

  it('shows expect sprite while streaming without segments', () => {
    renderStage({
      messages: [
        {
          id: PENDING_ASSISTANT_ID,
          role: 'assistant',
          content: '',
          emotion: null,
          segments: [],
          createdAt: '2026-01-01T00:00:00Z'
        }
      ],
      sending: true
    })
    expect(spriteSrc()).toBe(getPetSprite('expect'))
  })

  it('shows classified emotion while streaming', () => {
    renderStage({ messages: [pendingHappy], sending: true })
    expect(spriteSrc()).toBe(getPetSprite('happy'))
  })

  it('updates sprite from companion emotion events while sending', () => {
    renderStage({ messages: [pendingHappy], sending: true })

    act(() => {
      emotionListeners.forEach((listener) => listener({ type: 'emotion', value: 'shy' }))
    })

    expect(spriteSrc()).toBe(getPetSprite('shy'))
  })

  it('ignores companion emotion when not sending', () => {
    renderStage({ messages: [], sending: false })

    act(() => {
      emotionListeners.forEach((listener) => listener({ type: 'emotion', value: 'shy' }))
    })

    expect(spriteSrc()).toBe(getPetSprite('normal'))
  })
})
