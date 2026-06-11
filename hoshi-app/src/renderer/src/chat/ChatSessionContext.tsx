import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import * as chatApi from '../api/chat'
import { useAuth } from '../auth/AuthContext'
import type { ChatSession } from '../types/chat'

const ACTIVE_SESSION_KEY = 'hoshi.activeSessionId'

interface ChatSessionContextValue {
  sessions: ChatSession[]
  loading: boolean
  error: string | null
  activeSessionId: string | null
  activeSession: ChatSession | null
  selectSession: (sessionId: string) => void
  createSession: (title?: string) => Promise<ChatSession | null>
  refreshSessions: () => Promise<void>
}

const ChatSessionContext = createContext<ChatSessionContextValue | null>(null)

function getStoredActiveSessionId(): string | null {
  return localStorage.getItem(ACTIVE_SESSION_KEY)
}

function setStoredActiveSessionId(sessionId: string | null): void {
  if (sessionId) {
    localStorage.setItem(ACTIVE_SESSION_KEY, sessionId)
    return
  }
  localStorage.removeItem(ACTIVE_SESSION_KEY)
}

export function ChatSessionProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { user } = useAuth()
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  const syncActiveSession = useCallback((nextSessions: ChatSession[]) => {
    if (nextSessions.length === 0) {
      setActiveSessionId(null)
      setStoredActiveSessionId(null)
      return
    }

    const storedId = getStoredActiveSessionId()
    const currentId = activeSessionId ?? storedId
    const preferred = currentId
      ? nextSessions.find((session) => session.id === currentId)
      : undefined
    const nextActiveId = preferred?.id ?? nextSessions[0].id

    setActiveSessionId(nextActiveId)
    setStoredActiveSessionId(nextActiveId)
  }, [activeSessionId])

  const refreshSessions = useCallback(async () => {
    if (!user) {
      setSessions([])
      setActiveSessionId(null)
      setStoredActiveSessionId(null)
      setError(null)
      return
    }

    setLoading(true)
    try {
      const res = await chatApi.fetchSessions()
      setSessions(res.data)
      syncActiveSession(res.data)
      setError(null)
    } catch (err) {
      setSessions([])
      setActiveSessionId(null)
      setStoredActiveSessionId(null)
      setError(err instanceof Error ? err.message : '会话加载失败')
    } finally {
      setLoading(false)
    }
  }, [syncActiveSession, user])

  useEffect(() => {
    void refreshSessions()
  }, [refreshSessions])

  const selectSession = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId)
    setStoredActiveSessionId(sessionId)
  }, [])

  const createSession = useCallback(
    async (title?: string): Promise<ChatSession | null> => {
      if (!user) return null

      const res = await chatApi.createSession(title)
      setSessions((prev) => [res.data, ...prev])
      setActiveSessionId(res.data.id)
      setStoredActiveSessionId(res.data.id)
      setError(null)
      return res.data
    },
    [user]
  )

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions]
  )

  const value = useMemo(
    () => ({
      sessions,
      loading,
      error,
      activeSessionId,
      activeSession,
      selectSession,
      createSession,
      refreshSessions
    }),
    [sessions, loading, error, activeSessionId, activeSession, selectSession, createSession, refreshSessions]
  )

  return <ChatSessionContext.Provider value={value}>{children}</ChatSessionContext.Provider>
}

export function useChatSessions(): ChatSessionContextValue {
  const context = useContext(ChatSessionContext)
  if (!context) {
    throw new Error('useChatSessions must be used within ChatSessionProvider')
  }
  return context
}
