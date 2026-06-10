import { useAuth } from '../auth/AuthContext'
import { ChatPanel } from './ChatPanel'
import { Composer } from './Composer'
import { LoginModal } from './LoginModal'
import { PetPanel } from './PetPanel'
import './MainShell.css'

function UserAvatar({ name }: { name: string }): React.JSX.Element {
  const initial = name.charAt(0).toUpperCase()
  return <span className="user-avatar">{initial}</span>
}

export function MainShell(): React.JSX.Element {
  const { user, loading, openLogin, logout } = useAuth()

  return (
    <div className="shell">
      <div className="shell__backdrop" aria-hidden />

      <header className="shell__header">
        <div className="brand">
          <span className="brand__mark">星</span>
          <div>
            <strong>拾星</strong>
          </div>
        </div>

        <div className="shell__header-actions">
          {loading ? (
            <span className="shell__loading">恢复会话…</span>
          ) : user ? (
            <div className="user-menu">
              <UserAvatar name={user.username} />
              <div className="user-menu__info">
                <strong>{user.username}</strong>
                <span>{user.email}</span>
              </div>
              <button type="button" className="user-menu__logout" onClick={logout}>
                退出
              </button>
            </div>
          ) : (
            <button type="button" className="shell__login-btn" onClick={() => openLogin('login')}>
              登录
            </button>
          )}
        </div>
      </header>

      <main className="shell__main">
        <PetPanel />
        <ChatPanel />
      </main>

      <footer className="shell__footer">
        <Composer />
      </footer>

      <LoginModal />
    </div>
  )
}
