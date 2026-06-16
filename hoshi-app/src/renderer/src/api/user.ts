import { apiFetch, resolveApiUrl } from '../lib/http'
import { getAccessToken } from '../auth/authStorage'
import type { UserProfile } from '../types/auth'

export function updateProfile(username: string) {
  return apiFetch<UserProfile>('/api/v1/users/me', {
    method: 'PATCH',
    body: JSON.stringify({ username })
  })
}

export async function uploadAvatar(file: File) {
  const token = getAccessToken()
  const formData = new FormData()
  formData.append('file', file)

  const headers: Record<string, string> = {}
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(resolveApiUrl('/api/v1/users/me/avatar'), {
    method: 'POST',
    headers,
    body: formData
  })

  const rawBody = await response.text()
  const payload = JSON.parse(rawBody) as { code: number; message: string; data: UserProfile }
  if (!response.ok || payload.code !== 0) {
    throw new Error(payload.message || `上传失败: HTTP ${response.status}`)
  }
  return payload
}

export function changePassword(currentPassword: string, newPassword: string) {
  return apiFetch<{ message: string }>('/api/v1/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword })
  })
}

export function deleteAvatar() {
  return apiFetch<UserProfile>('/api/v1/users/me/avatar', {
    method: 'DELETE'
  })
}
