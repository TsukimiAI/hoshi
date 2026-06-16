import { FormEvent, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { AvatarCropModal } from './AvatarCropModal'
import { isAllowedAvatarImageFile } from './avatarCrop'
import { UserAvatar } from './UserAvatar'

const MAX_AVATAR_BYTES = 6 * 1024 * 1024

export function ProfileSettings(): React.JSX.Element {
  const { user, updateProfile, uploadAvatar, deleteAvatar } = useAuth()
  const [username, setUsername] = useState(user?.username ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setUsername(user?.username ?? '')
  }, [user?.username])

  if (!user) {
    return <p className="settings-message is-error">请先登录</p>
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setError(null)
    setInfo(null)

    const trimmed = username.trim()
    if (trimmed.length < 3 || trimmed.length > 32) {
      setError('用户名长度需在 3–32 个字符之间')
      return
    }
    if (trimmed === user.username) {
      setInfo('用户名未变更')
      return
    }

    setSubmitting(true)
    try {
      await updateProfile(trimmed)
      setInfo('用户名已更新')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAvatarPick = (): void => {
    fileInputRef.current?.click()
  }

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }

    setError(null)
    setInfo(null)

    if (!isAllowedAvatarImageFile(file)) {
      setError('仅支持 JPG、PNG、WebP 格式')
      return
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError('头像大小不能超过 6MB')
      return
    }

    setPendingAvatarFile(file)
  }

  const handleAvatarCropConfirm = async (file: File): Promise<void> => {
    if (file.size > MAX_AVATAR_BYTES) {
      throw new Error('裁剪后的头像大小不能超过 6MB')
    }

    setUploading(true)
    try {
      await uploadAvatar(file)
      setPendingAvatarFile(null)
      setInfo('头像已更新')
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteAvatar = async (): Promise<void> => {
    if (!user.avatarUrl) {
      return
    }
    if (!window.confirm('确定要删除当前头像吗？')) {
      return
    }

    setError(null)
    setInfo(null)
    setDeleting(true)
    try {
      await deleteAvatar()
      setInfo('头像已删除')
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除头像失败')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="settings-card">
      <h2>个人信息</h2>
      <p className="settings-card__hint">管理你的头像、用户名和邮箱展示信息。</p>

      <div className="settings-avatar-row">
        <UserAvatar user={user} size="md" />
        <div className="settings-avatar-row__actions">
          <button
            type="button"
            className="settings-btn"
            onClick={handleAvatarPick}
            disabled={uploading || deleting || pendingAvatarFile !== null}
          >
            {uploading ? '上传中…' : '更换头像'}
          </button>
          {user.avatarUrl ? (
            <button
              type="button"
              className="settings-btn"
              onClick={() => void handleDeleteAvatar()}
              disabled={uploading || deleting}
            >
              {deleting ? '删除中…' : '删除头像'}
            </button>
          ) : null}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={handleAvatarChange}
          />
        </div>
      </div>

      {pendingAvatarFile ? (
        <AvatarCropModal
          file={pendingAvatarFile}
          onCancel={() => setPendingAvatarFile(null)}
          onConfirm={handleAvatarCropConfirm}
        />
      ) : null}

      <form className="settings-form" onSubmit={(event) => void handleSubmit(event)}>
        <div className="settings-field">
          <label htmlFor="settings-username">用户名</label>
          <input
            id="settings-username"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
          />
        </div>

        <div className="settings-field">
          <label htmlFor="settings-email">邮箱</label>
          <input id="settings-email" type="email" value={user.email} readOnly />
          {user.emailVerified ? (
            <span className="settings-badge">已验证</span>
          ) : (
            <span className="settings-badge">未验证</span>
          )}
        </div>

        <div className="settings-actions">
          <button type="submit" className="settings-btn settings-btn--primary" disabled={submitting}>
            {submitting ? '保存中…' : '保存'}
          </button>
        </div>
      </form>

      {error ? <p className="settings-message is-error">{error}</p> : null}
      {info ? <p className="settings-message is-info">{info}</p> : null}
    </section>
  )
}
