import { useEffect } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useShellMode } from '../shell/ShellModeContext'
import { useSettings } from '../settings/SettingsContext'
import { SettingsShell } from '../settings/SettingsShell'
import { UserAvatar } from '../settings/UserAvatar'
import { ChatPanel } from './ChatPanel'
import { Composer } from './Composer'
import { LoginModal } from './LoginModal'
import { PetOverlayShell } from './PetOverlayShell'
import { PetPanel } from './PetPanel'
import '../settings/Settings.css'
import './MainShell.css'

export function MainShell(): React.JSX.Element {
  const { user, loading, openLogin, logout } = useAuth()
  const { mode, ready, enterPetMode } = useShellMode()
  const { open, openSettings } = useSettings()

  useEffect(() => {
    document.documentElement.dataset.platform = window.hoshi.platform
  }, [])

  const isPetMode = ready && mode === 'pet'

  return (
    <>
    <div className={`shell${isPetMode ? ' shell--hidden' : ''}`} hidden={isPetMode}>
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
            <>
              <button
                type="button"
                className="shell__pet-mode-btn"
                onClick={() => void enterPetMode()}
              >
                桌宠模式
              </button>
              <div className="user-menu">
                <button
                  type="button"
                  className="user-avatar-btn"
                  onClick={() => openSettings('profile')}
                  aria-label="打开设置"
                >
                  <UserAvatar user={user} />
                </button>
                <span className="user-menu__name">{user.username}</span>
                <button type="button" className="user-menu__logout" onClick={() => void logout()}>
                  退出
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="shell__login-btn" onClick={() => openLogin('login')}>
              登录
            </button>
          )}
        </div>
      </header>

      <div className={`shell__body ${open ? 'shell__body--settings' : ''}`}>
        <div
          className={`shell__sidebar${open ? ' shell__pane--hidden' : ''}`}
          hidden={open}
        >
          <PetPanel />
        </div>
        <div
          className={`shell__workspace${open ? ' shell__pane--hidden' : ''}`}
          hidden={open}
        >
          <ChatPanel />
          <footer className="shell__footer">
            <Composer />
          </footer>
        </div>
        <div
          className={`shell__settings-host${open ? '' : ' shell__pane--hidden'}`}
          hidden={!open}
        >
          <SettingsShell />
        </div>
      </div>

      <LoginModal />
    </div>
    {isPetMode ? <PetOverlayShell /> : null}
    </>
  )
}
