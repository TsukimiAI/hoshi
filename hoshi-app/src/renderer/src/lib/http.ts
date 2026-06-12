import { getAccessToken } from '../auth/authStorage'

export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

const UNAUTHORIZED_CODES = new Set([40100, 40102])

let tryRefreshSession: (() => Promise<boolean>) | null = null
let onUnauthorized: (() => void) | null = null

export function setAuthHttpHandlers(handlers: {
  tryRefreshSession: () => Promise<boolean>
  onUnauthorized: () => void
}): void {
  tryRefreshSession = handlers.tryRefreshSession
  onUnauthorized = handlers.onUnauthorized
}

export async function tryRefreshApiSession(): Promise<boolean> {
  if (!tryRefreshSession) {
    return false
  }
  return tryRefreshSession()
}

export function notifyApiUnauthorized(): void {
  onUnauthorized?.()
}

export function resolveApiUrl(path: string): string {
  const base = window.hoshi.apiBaseUrl.replace(/\/$/, '')
  return `${base}${path}`
}

export function buildAuthHeaders(contentType = 'application/json'): Record<string, string> {
  const token = getAccessToken()
  const headers: Record<string, string> = {
    'Content-Type': contentType
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  retried = false
): Promise<ApiResponse<T>> {
  const token = getAccessToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined)
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(resolveApiUrl(path), {
    ...init,
    headers
  })

  const rawBody = await response.text()
  let payload: ApiResponse<T>
  if (!rawBody) {
    if (!response.ok) {
      throw new Error(
        response.status === 502 || response.status === 504
          ? '无法连接后端服务，请确认 hoshi-server 已启动'
          : `请求失败: HTTP ${response.status}`
      )
    }
    throw new Error('服务器返回了空响应')
  }
  try {
    payload = JSON.parse(rawBody) as ApiResponse<T>
  } catch {
    if (response.status === 401) {
      throw new Error('未登录或登录已过期')
    }
    if (response.status === 403) {
      throw new Error('无访问权限，请重新登录后再试')
    }
    throw new Error('服务器响应格式错误，请查看后端日志')
  }
  const isUnauthorized =
    response.status === 401 || UNAUTHORIZED_CODES.has(payload.code)

  if (isUnauthorized && !retried && path !== '/api/v1/auth/refresh' && tryRefreshSession) {
    const refreshed = await tryRefreshSession()
    if (refreshed) {
      return apiFetch<T>(path, init, true)
    }
    onUnauthorized?.()
    throw new Error(payload.message || '未登录或登录已过期')
  }

  if (!response.ok || payload.code !== 0) {
    if (isUnauthorized) {
      onUnauthorized?.()
    }
    throw new Error(payload.message || `Request failed: ${response.status}`)
  }

  return payload
}
