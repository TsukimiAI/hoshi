import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  HoshiDesktopApi,
  ShellMode,
  WindowBounds
} from '../shared/desktop'
import type { AppPreferences } from '../shared/appPreferences'
import type { PetPreferences } from '../shared/petPreferences'
import { DEFAULT_APP_PREFERENCES } from '../shared/appPreferences'

const windowApi = {
  getMode: (): Promise<ShellMode> => ipcRenderer.invoke('hoshi:window:getMode'),
  setMode: (mode: ShellMode): Promise<ShellMode> => ipcRenderer.invoke('hoshi:window:setMode', mode),
  getBounds: (): Promise<WindowBounds | null> => ipcRenderer.invoke('hoshi:window:getBounds'),
  setBounds: (bounds: WindowBounds): Promise<WindowBounds | null> =>
    ipcRenderer.invoke('hoshi:window:setBounds', bounds),
  getAlwaysOnTop: (): Promise<boolean> => ipcRenderer.invoke('hoshi:window:getAlwaysOnTop'),
  setAlwaysOnTop: (value: boolean): Promise<boolean> =>
    ipcRenderer.invoke('hoshi:window:setAlwaysOnTop', value),
  setIgnoreMouseEvents: (ignore: boolean): Promise<void> =>
    ipcRenderer.invoke('hoshi:window:setIgnoreMouseEvents', ignore),
  resetPetBounds: (): Promise<WindowBounds> => ipcRenderer.invoke('hoshi:window:resetPetBounds')
}

const petApi = {
  getPreferences: (): Promise<PetPreferences> => ipcRenderer.invoke('hoshi:pet:getPreferences'),
  setPreferences: (preferences: PetPreferences): Promise<PetPreferences> =>
    ipcRenderer.invoke('hoshi:pet:setPreferences', preferences)
}

const appApi = {
  getPreferences: (): Promise<AppPreferences> => ipcRenderer.invoke('hoshi:app:getPreferences'),
  setPreferences: (preferences: AppPreferences): Promise<AppPreferences> =>
    ipcRenderer.invoke('hoshi:app:setPreferences', preferences)
}

const hoshiApi: HoshiDesktopApi = {
  platform: process.platform,
  apiBaseUrl: DEFAULT_APP_PREFERENCES.apiBaseUrl,
  window: windowApi,
  pet: petApi,
  app: appApi
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('hoshi', hoshiApi)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error exposed in non-isolated mode
  window.electron = electronAPI
  // @ts-expect-error exposed in non-isolated mode
  window.hoshi = hoshiApi
}
