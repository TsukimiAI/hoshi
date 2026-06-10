import { useEffect, useState } from 'react'
import { DEFAULT_PET_EMOTION, getPetSprite, resolvePetEmotion } from '../pet/petSprites'

interface ChatSession {
  id: string
  title: string
  updatedAt: string
}

const PLACEHOLDER_SESSIONS: ChatSession[] = [
  { id: 'main', title: '和星奈', updatedAt: '刚刚' },
  { id: '2', title: '注册流程讨论', updatedAt: '昨天' },
  { id: '3', title: '界面布局', updatedAt: '3 天前' }
]

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

export function PetPanel(): React.JSX.Element {
  const [emotion, setEmotion] = useState(DEFAULT_PET_EMOTION)
  const [sessionsOpen, setSessionsOpen] = useState(false)
  const [sessions, setSessions] = useState(PLACEHOLDER_SESSIONS)
  const [activeSessionId, setActiveSessionId] = useState('main')

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
    const id = `session-${Date.now()}`
    setSessions((prev) => [
      { id, title: '新会话', updatedAt: '刚刚' },
      ...prev.filter((item) => item.id !== id)
    ])
    setActiveSessionId(id)
    setSessionsOpen(false)
  }

  const handleSelectSession = (id: string): void => {
    setActiveSessionId(id)
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
          <ul className="pet-session-list">
            {sessions.map((session) => (
              <li key={session.id}>
                <button
                  type="button"
                  className={`pet-session-item ${session.id === activeSessionId ? 'active' : ''}`}
                  onClick={() => handleSelectSession(session.id)}
                >
                  <span className="pet-session-item__title">{session.title}</span>
                  <span className="pet-session-item__time">{session.updatedAt}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  )
}
