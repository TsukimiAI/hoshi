import { app, ipcMain } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  DEFAULT_APP_PREFERENCES,
  normalizeAppPreferences,
  type AppPreferences
} from '../shared/appPreferences'

function preferencesFilePath(): string {
  return join(app.getPath('userData'), 'app-preferences.json')
}

export function readAppPreferences(): AppPreferences {
  try {
    const path = preferencesFilePath()
    if (!existsSync(path)) {
      return { ...DEFAULT_APP_PREFERENCES }
    }
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<AppPreferences>
    return normalizeAppPreferences(parsed)
  } catch {
    return { ...DEFAULT_APP_PREFERENCES }
  }
}

function writeAppPreferences(preferences: AppPreferences): void {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(preferencesFilePath(), JSON.stringify(preferences, null, 2), 'utf-8')
}

function applyLaunchAtLogin(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: false
  })
}

export function registerAppPreferencesHandlers(): void {
  ipcMain.handle('hoshi:app:getPreferences', () => readAppPreferences())

  ipcMain.handle('hoshi:app:setPreferences', (_event, preferences: AppPreferences) => {
    const next = normalizeAppPreferences(preferences)
    writeAppPreferences(next)
    applyLaunchAtLogin(next.launchAtLogin)
    return next
  })
}

export function initializeAppPreferences(): void {
  applyLaunchAtLogin(readAppPreferences().launchAtLogin)
}
