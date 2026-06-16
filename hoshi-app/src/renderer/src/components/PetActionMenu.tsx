import type { CSSProperties } from 'react'

interface PetActionMenuProps {
  visible: boolean
  onChat: () => void
  onSessions: () => void
  onSettings: () => void
  onClose: () => void
}

const MENU_ITEMS = [
  { id: 'chat', label: '聊天', hint: '和星奈说说话', icon: '💬' },
  { id: 'sessions', label: '会话', hint: '切换对话', icon: '📋' },
  { id: 'settings', label: '设置', hint: '打开应用设置', icon: '⚙️' }
] as const

export function PetActionMenu({
  visible,
  onChat,
  onSessions,
  onSettings,
  onClose
}: PetActionMenuProps): React.JSX.Element {
  const handlers: Record<(typeof MENU_ITEMS)[number]['id'], () => void> = {
    chat: onChat,
    sessions: onSessions,
    settings: onSettings
  }

  return (
    <nav
      className={`pet-overlay-menu pet-hit ${visible ? 'is-visible' : ''}`}
      role="menu"
      aria-label="星奈菜单"
      aria-hidden={!visible}
    >
      <div className="pet-overlay-menu__panel">
        <header className="pet-overlay-menu__header">
          <span className="pet-overlay-menu__badge">星奈</span>
          <button type="button" className="pet-overlay-menu__close" onClick={onClose} aria-label="关闭菜单">
            ×
          </button>
        </header>
        <ul className="pet-overlay-menu__list">
          {MENU_ITEMS.map((item, index) => (
            <li key={item.id} style={{ '--item-index': index } as CSSProperties}>
              <button
                type="button"
                className="pet-overlay-menu__item"
                role="menuitem"
                onClick={handlers[item.id]}
              >
                <span className="pet-overlay-menu__icon" aria-hidden>
                  {item.icon}
                </span>
                <span className="pet-overlay-menu__text">
                  <strong>{item.label}</strong>
                  <small>{item.hint}</small>
                </span>
                <span className="pet-overlay-menu__arrow" aria-hidden>
                  →
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}
