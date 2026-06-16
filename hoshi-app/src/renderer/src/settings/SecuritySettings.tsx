import { FormEvent, useState } from 'react'
import { useAuth } from '../auth/AuthContext'

export function SecuritySettings(): React.JSX.Element {
  const { changePassword, logout } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setError(null)
    setInfo(null)

    const form = new FormData(event.currentTarget)
    const currentPassword = String(form.get('currentPassword') ?? '')
    const newPassword = String(form.get('newPassword') ?? '')
    const confirmPassword = String(form.get('confirmPassword') ?? '')

    if (newPassword.length < 8 || newPassword.length > 64) {
      setError('新密码长度需在 8–64 个字符之间')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致')
      return
    }

    setSubmitting(true)
    try {
      const message = await changePassword(currentPassword, newPassword)
      setInfo(message)
      event.currentTarget.reset()
      await logout()
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改密码失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="settings-card">
      <h2>账号与安全</h2>
      <p className="settings-card__hint">修改密码后需要重新登录。</p>

      <form className="settings-form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="settings-field">
            <label htmlFor="settings-current-password">当前密码</label>
            <input
              id="settings-current-password"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>

          <div className="settings-field">
            <label htmlFor="settings-new-password">新密码</label>
            <input
              id="settings-new-password"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
            />
          </div>

          <div className="settings-field">
            <label htmlFor="settings-confirm-password">确认新密码</label>
            <input
              id="settings-confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
            />
          </div>

          <div className="settings-actions">
            <button type="submit" className="settings-btn settings-btn--primary" disabled={submitting}>
              {submitting ? '提交中…' : '修改密码'}
            </button>
          </div>
        </form>

        {error ? <p className="settings-message is-error">{error}</p> : null}
        {info ? <p className="settings-message is-info">{info}</p> : null}
    </section>
  )
}
