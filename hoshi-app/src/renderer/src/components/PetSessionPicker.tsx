import type { CSSProperties } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useChatSessions } from '../chat/ChatSessionContext'

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

interface PetSessionPickerProps {
  onClose: () => void
  onSessionChange?: () => void
}

export function PetSessionPicker({
  onClose,
  onSessionChange
}: PetSessionPickerProps): React.JSX.Element {
  const { user, requireAuth } = useAuth()
  const { sessions, loading, error, activeSessionId, selectSession, createSession, deleteSession } =
    useChatSessions()

  const handleNewSession = (): void => {
    requireAuth(() => {
      void createSession().then((session) => {
        if (session) {
          onSessionChange?.()
          onClose()
        }
      })
    })
  }

  const handleSelectSession = (id: string): void => {
    selectSession(id)
    onSessionChange?.()
    onClose()
  }

  return (
    <nav className="pet-overlay-menu pet-hit is-visible" aria-label="会话">
      <div className="pet-overlay-menu__panel">
        <header className="pet-overlay-menu__header">
          <span className="pet-overlay-menu__badge">会话</span>
          <button type="button" className="pet-overlay-menu__close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        {!user ? (
          <p className="pet-overlay-menu__empty">登录后可查看会话</p>
        ) : loading ? (
          <p className="pet-overlay-menu__empty">正在加载…</p>
        ) : error ? (
          <p className="pet-overlay-menu__empty">{error}</p>
        ) : (
          <ul className="pet-overlay-menu__list pet-overlay-menu__list--scroll">
            <li>
              <button type="button" className="pet-overlay-menu__item" onClick={handleNewSession}>
                <span className="pet-overlay-menu__icon" aria-hidden>
                  ＋
                </span>
                <span className="pet-overlay-menu__text">
                  <strong>新会话</strong>
                  <small>开始新的对话</small>
                </span>
              </button>
            </li>

            {sessions.length === 0 ? (
              <li>
                <p className="pet-overlay-menu__empty pet-overlay-menu__empty--inline">还没有会话</p>
              </li>
            ) : (
              sessions.map((session, index) => (
                <li
                  key={session.id}
                  className="pet-overlay-menu__session-row"
                  style={{ '--item-index': index + 1 } as CSSProperties}
                >
                  <button
                    type="button"
                    className={`pet-overlay-menu__item ${session.id === activeSessionId ? 'is-active' : ''}`}
                    onClick={() => handleSelectSession(session.id)}
                  >
                    <span className="pet-overlay-menu__icon" aria-hidden>
                      💬
                    </span>
                    <span className="pet-overlay-menu__text">
                      <strong>{session.title}</strong>
                      <small>{formatSessionTime(session.updatedAt)}</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="pet-overlay-menu__session-delete"
                    onClick={() => void deleteSession(session.id)}
                    aria-label={`删除会话 ${session.title}`}
                  >
                    ×
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </nav>
  )
}
