import { apiFetch } from '../lib/http'
import type { AuthSession, RegisterResult, UserProfile } from '../types/auth'

export function login(usernameOrEmail: string, password: string) {
  return apiFetch<AuthSession>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ usernameOrEmail, password })
  })
}

export function sendRegisterCode(email: string) {
  return apiFetch<{ message: string }>('/api/v1/auth/send-register-code', {
    method: 'POST',
    body: JSON.stringify({ email })
  })
}

export function sendResetCode(email: string) {
  return apiFetch<{ message: string }>('/api/v1/auth/send-reset-code', {
    method: 'POST',
    body: JSON.stringify({ email })
  })
}

export function register(
  username: string,
  email: string,
  password: string,
  emailCode: string
) {
  return apiFetch<RegisterResult>('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password, emailCode })
  })
}

export function resetPasswordByCode(email: string, emailCode: string, newPassword: string) {
  return apiFetch<{ message: string }>('/api/v1/auth/reset-password-by-code', {
    method: 'POST',
    body: JSON.stringify({ email, emailCode, newPassword })
  })
}

export function refresh(refreshToken: string) {
  return apiFetch<AuthSession>('/api/v1/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken })
  })
}

export function logout(refreshToken: string) {
  return apiFetch<{ message: string }>('/api/v1/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ refreshToken })
  })
}

export function fetchCurrentUser() {
  return apiFetch<UserProfile>('/api/v1/auth/me')
}
