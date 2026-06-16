import { resolveApiUrl } from './http'

export function resolveUserAvatarContentUrl(userId: number | 'me'): string {
  if (userId === 'me') {
    return resolveApiUrl('/api/v1/users/me/avatar/content')
  }
  return resolveApiUrl(`/api/v1/users/${userId}/avatar/content`)
}
