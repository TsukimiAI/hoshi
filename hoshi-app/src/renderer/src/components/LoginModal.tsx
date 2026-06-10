import { FormEvent, useEffect, useState } from 'react'
import { resetPasswordByCode, sendRegisterCode, sendResetCode } from '../api/auth'
import { useAuth } from '../auth/AuthContext'
import './LoginModal.css'

type Panel = 'login' | 'register' | 'forgot'

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function LoginModal(): React.JSX.Element | null {
  const { loginOpen, loginTab, closeLogin, login, register, switchLoginTab } = useAuth()
  const [panel, setPanel] = useState<Panel>('login')
  const [submitting, setSubmitting] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [registerEmail, setRegisterEmail] = useState('')
  const [forgotEmail, setForgotEmail] = useState('')
  const [codeCountdown, setCodeCountdown] = useState(0)
  const [forgotCodeCountdown, setForgotCodeCountdown] = useState(0)

  useEffect(() => {
    if (loginOpen) {
      setPanel(loginTab)
    }
  }, [loginOpen, loginTab])

  useEffect(() => {
    if (codeCountdown <= 0) return
    const timer = window.setTimeout(() => setCodeCountdown((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [codeCountdown])

  useEffect(() => {
    if (forgotCodeCountdown <= 0) return
    const timer = window.setTimeout(() => setForgotCodeCountdown((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [forgotCodeCountdown])

  if (!loginOpen) return null

  const activePanel = panel
  const showRegisterEmailCode = isValidEmail(registerEmail)
  const showForgotEmailCode = isValidEmail(forgotEmail)

  const resetMessages = (): void => {
    setError(null)
    setInfo(null)
  }

  const handleClose = (): void => {
    resetMessages()
    setRegisterEmail('')
    setForgotEmail('')
    setCodeCountdown(0)
    setForgotCodeCountdown(0)
    setPanel('login')
    closeLogin()
  }

  const handleLogin = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    resetMessages()
    const form = new FormData(e.currentTarget)
    const usernameOrEmail = String(form.get('usernameOrEmail') ?? '')
    const password = String(form.get('password') ?? '')
    setSubmitting(true)
    try {
      await login(usernameOrEmail, password)
      setPanel('login')
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSendCode = async (): Promise<void> => {
    if (!showRegisterEmailCode || codeCountdown > 0) return
    resetMessages()
    setSendingCode(true)
    try {
      const res = await sendRegisterCode(registerEmail.trim())
      setInfo(res.data.message)
      setCodeCountdown(60)
    } catch (err) {
      setError(err instanceof Error ? err.message : '验证码发送失败')
    } finally {
      setSendingCode(false)
    }
  }

  const handleRegister = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    resetMessages()
    const form = new FormData(e.currentTarget)
    const username = String(form.get('username') ?? '')
    const email = String(form.get('email') ?? '')
    const password = String(form.get('password') ?? '')
    const emailCode = String(form.get('emailCode') ?? '')
    setSubmitting(true)
    try {
      const message = await register(username, email, password, emailCode)
      setInfo(message)
      setRegisterEmail('')
      setCodeCountdown(0)
      switchLoginTab('login')
      setPanel('login')
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSendResetCode = async (): Promise<void> => {
    if (!showForgotEmailCode || forgotCodeCountdown > 0) return
    resetMessages()
    setSendingCode(true)
    try {
      const res = await sendResetCode(forgotEmail.trim())
      setInfo(res.data.message)
      setForgotCodeCountdown(60)
    } catch (err) {
      setError(err instanceof Error ? err.message : '验证码发送失败')
    } finally {
      setSendingCode(false)
    }
  }

  const handleForgot = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    resetMessages()
    const form = new FormData(e.currentTarget)
    const email = String(form.get('email') ?? '')
    const emailCode = String(form.get('emailCode') ?? '')
    const newPassword = String(form.get('newPassword') ?? '')
    setSubmitting(true)
    try {
      const res = await resetPasswordByCode(email, emailCode, newPassword)
      setInfo(res.data.message)
      setForgotEmail('')
      setForgotCodeCountdown(0)
      switchLoginTab('login')
      setPanel('login')
    } catch (err) {
      setError(err instanceof Error ? err.message : '重置失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-overlay" onClick={handleClose} role="presentation">
      <div
        className="login-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
      >
        <button type="button" className="login-close" onClick={handleClose} aria-label="关闭">
          ×
        </button>

        {activePanel !== 'forgot' && (
          <div className="login-tabs">
            <button
              type="button"
              className={activePanel === 'login' ? 'active' : ''}
              onClick={() => {
                resetMessages()
                switchLoginTab('login')
                setPanel('login')
              }}
            >
              登录
            </button>
            <button
              type="button"
              className={activePanel === 'register' ? 'active' : ''}
              onClick={() => {
                resetMessages()
                switchLoginTab('register')
                setPanel('register')
              }}
            >
              注册
            </button>
          </div>
        )}

        {activePanel === 'login' && (
          <>
            <h2 id="login-title">欢迎回来</h2>
            <p className="login-subtitle">登录后继续与拾星对话</p>
            <form className="login-form" onSubmit={handleLogin}>
              <label>
                用户名或邮箱
                <input name="usernameOrEmail" required autoComplete="username" />
              </label>
              <label>
                密码
                <input name="password" type="password" required autoComplete="current-password" />
              </label>
              {error && <p className="login-error">{error}</p>}
              {info && <p className="login-info">{info}</p>}
              <button type="submit" className="login-submit" disabled={submitting}>
                {submitting ? '登录中…' : '登录'}
              </button>
            </form>
            <button
              type="button"
              className="login-link"
              onClick={() => {
                resetMessages()
                switchLoginTab('forgot')
                setPanel('forgot')
              }}
            >
              忘记密码？
            </button>
          </>
        )}

        {activePanel === 'register' && (
          <>
            <h2 id="login-title">创建账号</h2>
            <p className="login-subtitle">填写邮箱并验证后即可注册</p>
            <form className="login-form" onSubmit={handleRegister}>
              <label>
                用户名
                <input name="username" required minLength={3} maxLength={32} autoComplete="username" />
              </label>
              <label>
                邮箱
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={registerEmail}
                  onChange={(e) => {
                    setRegisterEmail(e.target.value)
                    resetMessages()
                  }}
                />
              </label>
              {showRegisterEmailCode && (
                <div className="login-email-code">
                  <label>
                    邮箱验证码
                    <div className="login-email-code__row">
                      <input
                        name="emailCode"
                        inputMode="numeric"
                        pattern="\d{6}"
                        maxLength={6}
                        required
                        placeholder="6 位验证码"
                        autoComplete="one-time-code"
                      />
                      <button
                        type="button"
                        className="login-code-btn"
                        onClick={handleSendCode}
                        disabled={sendingCode || codeCountdown > 0}
                      >
                        {sendingCode
                          ? '发送中…'
                          : codeCountdown > 0
                            ? `${codeCountdown}s`
                            : '获取验证码'}
                      </button>
                    </div>
                  </label>
                </div>
              )}
              <label>
                密码
                <input
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </label>
              {error && <p className="login-error">{error}</p>}
              {info && <p className="login-info">{info}</p>}
              <button type="submit" className="login-submit" disabled={submitting || !showRegisterEmailCode}>
                {submitting ? '注册中…' : '注册'}
              </button>
            </form>
          </>
        )}

        {activePanel === 'forgot' && (
          <>
            <h2 id="login-title">重置密码</h2>
            <p className="login-subtitle">验证邮箱后即可设置新密码</p>
            <form className="login-form" onSubmit={handleForgot}>
              <label>
                邮箱
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={forgotEmail}
                  onChange={(e) => {
                    setForgotEmail(e.target.value)
                    resetMessages()
                  }}
                />
              </label>
              {showForgotEmailCode && (
                <div className="login-email-code">
                  <label>
                    邮箱验证码
                    <div className="login-email-code__row">
                      <input
                        name="emailCode"
                        inputMode="numeric"
                        pattern="\d{6}"
                        maxLength={6}
                        required
                        placeholder="6 位验证码"
                        autoComplete="one-time-code"
                      />
                      <button
                        type="button"
                        className="login-code-btn"
                        onClick={handleSendResetCode}
                        disabled={sendingCode || forgotCodeCountdown > 0}
                      >
                        {sendingCode
                          ? '发送中…'
                          : forgotCodeCountdown > 0
                            ? `${forgotCodeCountdown}s`
                            : '获取验证码'}
                      </button>
                    </div>
                  </label>
                </div>
              )}
              <label>
                新密码
                <input
                  name="newPassword"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </label>
              {error && <p className="login-error">{error}</p>}
              {info && <p className="login-info">{info}</p>}
              <button type="submit" className="login-submit" disabled={submitting || !showForgotEmailCode}>
                {submitting ? '重置中…' : '重置密码'}
              </button>
            </form>
            <button
              type="button"
              className="login-link"
              onClick={() => {
                resetMessages()
                switchLoginTab('login')
                setPanel('login')
              }}
            >
              返回登录
            </button>
          </>
        )}
      </div>
    </div>
  )
}
