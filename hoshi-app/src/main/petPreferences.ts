import { app, ipcMain } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  DEFAULT_PET_PREFERENCES,
  normalizePetPreferences,
  type PetPreferences
} from '../shared/petPreferences'

function preferencesFilePath(): string {
  return join(app.getPath('userData'), 'pet-preferences.json')
}

function readPreferences(): PetPreferences {
  try {
    const path = preferencesFilePath()
    if (!existsSync(path)) {
      return { ...DEFAULT_PET_PREFERENCES }
    }
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<PetPreferences>
    return normalizePetPreferences(parsed)
  } catch {
    return { ...DEFAULT_PET_PREFERENCES }
  }
}

function writePreferences(preferences: PetPreferences): void {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(preferencesFilePath(), JSON.stringify(preferences, null, 2), 'utf-8')
}

export function registerPetPreferencesHandlers(
  syncAlwaysOnTop: (value: boolean) => void
): void {
  ipcMain.handle('hoshi:pet:getPreferences', () => readPreferences())

  ipcMain.handle('hoshi:pet:setPreferences', (_event, preferences: PetPreferences) => {
    const next = normalizePetPreferences(preferences)
    writePreferences(next)
    syncAlwaysOnTop(next.alwaysOnTop)
    return next
  })
}
