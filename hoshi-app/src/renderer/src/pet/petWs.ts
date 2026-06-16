import { API_BASE_URL_STORAGE_KEY } from '../settings/appPreferences'

export function resolvePetWsUrl(): string {
  const stored = localStorage.getItem(API_BASE_URL_STORAGE_KEY)
  const base = stored || window.hoshi.apiBaseUrl
  if (!base) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/ws/pet`
  }
  const url = new URL(base)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/ws/pet'
  return url.toString()
}
