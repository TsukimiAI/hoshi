import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useChatMessages } from '../chat/ChatMessagesContext'
import { useChatSessions } from '../chat/ChatSessionContext'
import { resolveEmotionFromChatState } from '../pet/petEmotion'
import { getPetSprite, resolvePetEmotion } from '../pet/petSprites'

function resolveWsUrl(): string {
  const base = window.hoshi.apiBaseUrl
  if (!base) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/ws/pet`
  }
  const url = new URL(base)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/ws/pet'
  return url.toString()
}

function formatSessionTime(value: string): string {
  const updatedAt = new Date(value)
  if (Number.isNaN(updatedAt.getTime())) {
    return value
  }

  const diffMs = Date.now() - updatedAt.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)

  if (diffMinutes < 1) return '刚刚'
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} 小时前`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays} 天前`

  return updatedAt.toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric'
  })
}

export function PetPanel(): React.JSX.Element {
  const { user, requireAuth } = useAuth()
  const { sessions, loading, error, activeSessionId, selectSession, createSession, deleteSession } = useChatSessions()
  const { messages, sending } = useChatMessages()
  const [emotion, setEmotion] = useState(() => resolveEmotionFromChatState([], false))
  const [sessionsOpen, setSessionsOpen] = useState(false)
  const petPanelRef = useRef<HTMLElement>(null)
  const sendingRef = useRef(sending)
  sendingRef.current = sending

  useEffect(() => {
    const socket = new WebSocket(resolveWsUrl())
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data as string) as { type?: string; value?: string }
        if (payload.type !== 'emotion' || !payload.value) {
          return
        }
        if (!sendingRef.current) {
          setEmotion(resolvePetEmotion('normal'))
          return
        }
        setEmotion(resolvePetEmotion(payload.value))
      } catch {
        // Ignore malformed websocket payloads.
      }
    }
    return () => socket.close()
  }, [])

  useEffect(() => {
    setEmotion(resolveEmotionFromChatState(messages, sending))
  }, [messages, sending])

  useEffect(() => {
    if (!sessionsOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }
      if (petPanelRef.current?.contains(target)) {
        return
      }
      setSessionsOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [sessionsOpen])

  const handleNewSession = (): void => {
    requireAuth(() => {
      void createSession().then((session) => {
        if (session) {
          setSessionsOpen(false)
        }
      })
    })
  }

  const handleSelectSession = (id: string): void => {
    selectSession(id)
    setSessionsOpen(false)
  }

  const handleDeleteSession = (
    e: React.MouseEvent<HTMLButtonElement>,
    sessionId: string
  ): void => {
    e.stopPropagation()
    void deleteSession(sessionId)
  }

  return (
    <section
      ref={petPanelRef}
      className={`pet-panel ${sessionsOpen ? 'pet-panel--sessions-open' : ''}`}
    >
      <div className="pet-panel__header">
        <div className="pet-panel__header-left">
          <span className={`pet-panel__label ${sessionsOpen ? '' : 'is-visible'}`}>星奈</span>
          <button
            type="button"
            className={`pet-panel__new-session ${sessionsOpen ? 'is-visible' : ''}`}
            onClick={handleNewSession}
            tabIndex={sessionsOpen ? 0 : -1}
          >
            新会话
          </button>
        </div>
        <div className="pet-panel__header-right">
          <button
            type="button"
            className={`pet-panel__sessions-btn ${sessionsOpen ? '' : 'is-visible'}`}
            onClick={() => setSessionsOpen(true)}
            tabIndex={sessionsOpen ? -1 : 0}
          >
            会话
          </button>
          <button
            type="button"
            className={`pet-panel__back-btn ${sessionsOpen ? 'is-visible' : ''}`}
            onClick={() => setSessionsOpen(false)}
            tabIndex={sessionsOpen ? 0 : -1}
          >
            返回
          </button>
        </div>
      </div>

      <div className="pet-panel__body">
        <div className="pet-panel__stage">
          <img
            className="pet-sprite"
            src={getPetSprite(emotion)}
            alt="星奈"
            draggable={false}
          />
        </div>

        <aside
          className={`pet-panel__sessions ${sessionsOpen ? 'open' : ''}`}
          aria-label="会话记录"
          aria-hidden={!sessionsOpen}
        >
          {!user ? (
            <div className="pet-session-list">
              <p className="pet-session-item__title">登录后可查看会话记录</p>
            </div>
          ) : loading ? (
            <div className="pet-session-list">
              <p className="pet-session-item__title">正在加载会话…</p>
            </div>
          ) : error ? (
            <div className="pet-session-list">
              <p className="pet-session-item__title">{error}</p>
            </div>
          ) : (
            <ul className="pet-session-list">
              {sessions.map((session) => (
                <li key={session.id}>
                  <div className={`pet-session-item ${session.id === activeSessionId ? 'active' : ''}`}>
                    <button
                      type="button"
                      className="pet-session-item__main"
                      onClick={() => handleSelectSession(session.id)}
                    >
                      <span className="pet-session-item__title">{session.title}</span>
                      <span className="pet-session-item__time">{formatSessionTime(session.updatedAt)}</span>
                    </button>
                    <button
                      type="button"
                      className="pet-session-item__delete"
                      onClick={(e) => handleDeleteSession(e, session.id)}
                      aria-label={`删除会话 ${session.title}`}
                    >
                      删除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </section>
  )
}
