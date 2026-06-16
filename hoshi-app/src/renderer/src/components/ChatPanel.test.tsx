import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatPanel } from './ChatPanel'
import { PENDING_ASSISTANT_ID } from '../api/chat'
import { AppPreferencesProvider } from '../settings/useAppPreferences'
import type { ChatMessage } from '../types/chat'

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 1,
      username: 'tester',
      email: 'test@example.com',
      avatarUrl: 'http://localhost:9000/hoshi/avatars/1/a.png',
      emailVerified: true
    }
  })
}))

vi.mock('../chat/ChatSessionContext', () => ({
  useChatSessions: () => ({
    activeSession: { id: '1', title: '测试', createdAt: '', updatedAt: '' }
  })
}))

const messages: ChatMessage[] = [
  {
    id: '10',
    role: 'user',
    content: '帮我查一下新闻',
    emotion: null,
    webSearchEnabled: true,
    segments: [],
    createdAt: '2026-06-15T10:00:00'
  },
  {
    id: PENDING_ASSISTANT_ID,
    role: 'assistant',
    content: '好的',
    emotion: null,
    segments: [],
    createdAt: '2026-06-15T10:00:01'
  }
]

vi.mock('../chat/ChatMessagesContext', () => ({
  useChatMessages: () => ({
    messages,
    loading: false,
    error: null,
    sending: true,
    canRetry: false,
    retryLastMessage: vi.fn()
  })
}))

vi.mock('../memory/MemoryContext', () => ({
  MemoryProvider: ({ children }: { children: React.ReactNode }) => children,
  useMemory: () => ({
    workspaceTab: 'chat',
    setWorkspaceTab: vi.fn(),
    memories: [],
    loading: false,
    error: null,
    categoryFilter: null,
    setCategoryFilter: vi.fn(),
    refreshMemories: vi.fn(),
    createMemory: vi.fn(),
    updateMemory: vi.fn(),
    removeMemory: vi.fn(),
    enqueueMemoryEvents: vi.fn(),
    activeToast: null,
    dismissToast: vi.fn()
  })
}))

describe('ChatPanel', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows web search badge on user messages and user avatar', () => {
    Element.prototype.scrollIntoView = vi.fn()

    render(
      <AppPreferencesProvider>
        <ChatPanel />
      </AppPreferencesProvider>
    )

    expect(screen.getByText('本次已联网')).toBeInTheDocument()
    expect(screen.getByLabelText('tester 的头像')).toBeInTheDocument()
    expect(screen.queryByLabelText('星奈的头像')).not.toBeInTheDocument()
  })
})
