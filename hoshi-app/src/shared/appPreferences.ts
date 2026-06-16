export type ThemeMode = 'light' | 'dark' | 'system'
export type FontSizeMode = 'small' | 'medium' | 'large'
export type SendShortcutMode = 'enter' | 'ctrl-enter'
export type StartupMode = 'workstation' | 'pet' | 'last'

export interface AppPreferences {
  defaultWebSearch: boolean
  sendShortcut: SendShortcutMode
  autoScrollChat: boolean
  sentencePlaybackCharDelayMs: number
  sentenceGapDelayMs: number
  memoryToastEnabled: boolean
  memoryToastDwellMs: number
  theme: ThemeMode
  fontSize: FontSizeMode
  apiBaseUrl: string
  startupMode: StartupMode
  launchAtLogin: boolean
}

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  defaultWebSearch: false,
  sendShortcut: 'enter',
  autoScrollChat: true,
  sentencePlaybackCharDelayMs: 50,
  sentenceGapDelayMs: 400,
  memoryToastEnabled: true,
  memoryToastDwellMs: 3000,
  theme: 'light',
  fontSize: 'medium',
  apiBaseUrl: 'http://localhost:8080',
  startupMode: 'last',
  launchAtLogin: false
}

export const API_BASE_URL_STORAGE_KEY = 'hoshi.apiBaseUrl'

export function normalizeAppPreferences(partial: Partial<AppPreferences>): AppPreferences {
  return {
    defaultWebSearch: partial.defaultWebSearch ?? DEFAULT_APP_PREFERENCES.defaultWebSearch,
    sendShortcut: partial.sendShortcut ?? DEFAULT_APP_PREFERENCES.sendShortcut,
    autoScrollChat: partial.autoScrollChat ?? DEFAULT_APP_PREFERENCES.autoScrollChat,
    sentencePlaybackCharDelayMs:
      partial.sentencePlaybackCharDelayMs ?? DEFAULT_APP_PREFERENCES.sentencePlaybackCharDelayMs,
    sentenceGapDelayMs: partial.sentenceGapDelayMs ?? DEFAULT_APP_PREFERENCES.sentenceGapDelayMs,
    memoryToastEnabled: partial.memoryToastEnabled ?? DEFAULT_APP_PREFERENCES.memoryToastEnabled,
    memoryToastDwellMs: partial.memoryToastDwellMs ?? DEFAULT_APP_PREFERENCES.memoryToastDwellMs,
    theme: partial.theme ?? DEFAULT_APP_PREFERENCES.theme,
    fontSize: partial.fontSize ?? DEFAULT_APP_PREFERENCES.fontSize,
    apiBaseUrl: partial.apiBaseUrl?.trim() || DEFAULT_APP_PREFERENCES.apiBaseUrl,
    startupMode: partial.startupMode ?? DEFAULT_APP_PREFERENCES.startupMode,
    launchAtLogin: partial.launchAtLogin ?? DEFAULT_APP_PREFERENCES.launchAtLogin
  }
}
