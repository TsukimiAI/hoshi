import { describe, expect, it } from 'vitest'
import { resolveUserAvatarContentUrl } from '../lib/avatarUrl'

describe('resolveUserAvatarContentUrl', () => {
  it('resolves current user avatar endpoint', () => {
    expect(resolveUserAvatarContentUrl('me')).toBe(
      'http://localhost:8080/api/v1/users/me/avatar/content'
    )
  })

  it('resolves avatar endpoint by user id', () => {
    expect(resolveUserAvatarContentUrl(42)).toBe(
      'http://localhost:8080/api/v1/users/42/avatar/content'
    )
  })
})
