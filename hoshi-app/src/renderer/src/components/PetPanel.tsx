import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useChatSessions } from '../chat/ChatSessionContext'
import { DEFAULT_PET_EMOTION, getPetSprite, resolvePetEmotion } from '../pet/petSprites'

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
  const { sessions, loading, error, activeSessionId, selectSession, createSession } = useChatSessions()
  const [emotion, setEmotion] = useState(DEFAULT_PET_EMOTION)
  const [sessionsOpen, setSessionsOpen] = useState(false)

  useEffect(() => {
    const socket = new WebSocket(resolveWsUrl())

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as { emotion?: string }
        if (payload.emotion) {
          setEmotion(resolvePetEmotion(payload.emotion))
        }
      } catch {
        // ignore malformed messages
      }
    }

    return () => socket.close()
  }, [])

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

  return (
    <section className={`pet-panel ${sessionsOpen ? 'pet-panel--sessions-open' : ''}`}>
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
                  <button
                    type="button"
                    className={`pet-session-item ${session.id === activeSessionId ? 'active' : ''}`}
                    onClick={() => handleSelectSession(session.id)}
                  >
                    <span className="pet-session-item__title">{session.title}</span>
                    <span className="pet-session-item__time">{formatSessionTime(session.updatedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </section>
  )
}
