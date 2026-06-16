import type { UserProfile } from '../types/auth'
import { useAvatarBlobUrl } from './useAvatarBlobUrl'

interface UserAvatarProps {
  user: Pick<UserProfile, 'username' | 'avatarUrl'> & { id?: number }
  userId?: number | 'me'
  size?: 'sm' | 'md' | 'chat'
  className?: string
}

export function UserAvatar({
  user,
  userId = user.id ?? 'me',
  size = 'sm',
  className = ''
}: UserAvatarProps): React.JSX.Element {
  const initial = user.username.charAt(0).toUpperCase()
  const sizeClass =
    size === 'chat' ? 'user-avatar--chat' : size === 'md' ? 'user-avatar--md' : ''
  const { src, failed } = useAvatarBlobUrl({
    userId,
    avatarUrl: user.avatarUrl,
    enabled: Boolean(user.avatarUrl)
  })
  const showImage = Boolean(src && !failed)

  return (
    <span
      className={`user-avatar ${sizeClass} ${className}`.trim()}
      aria-label={`${user.username} 的头像`}
      role="img"
    >
      <span className="user-avatar__initial" aria-hidden>
        {initial}
      </span>
      {src ? (
        <img
          className={`user-avatar__photo ${showImage ? '' : 'is-hidden'}`.trim()}
          src={src}
          alt=""
          draggable={false}
        />
      ) : null}
    </span>
  )
}
