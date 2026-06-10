import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const hoshiApi = {
  platform: process.platform,
  apiBaseUrl: process.env.NODE_ENV === 'development' ? '' : 'http://localhost:8080'
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
