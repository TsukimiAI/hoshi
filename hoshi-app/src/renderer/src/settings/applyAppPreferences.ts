import type { AppPreferences } from './appPreferences'
import { API_BASE_URL_STORAGE_KEY } from './appPreferences'

function resolveThemeMode(theme: AppPreferences['theme']): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

export function applyAppPreferencesToDocument(preferences: AppPreferences): void {
  const resolvedTheme = resolveThemeMode(preferences.theme)
  document.documentElement.dataset.theme = resolvedTheme
  document.documentElement.dataset.fontSize = preferences.fontSize
  localStorage.setItem(API_BASE_URL_STORAGE_KEY, preferences.apiBaseUrl.replace(/\/$/, ''))
}

export function subscribeSystemTheme(onChange: (theme: 'light' | 'dark') => void): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = (): void => {
    onChange(media.matches ? 'dark' : 'light')
  }
  media.addEventListener('change', handler)
  return () => media.removeEventListener('change', handler)
}
