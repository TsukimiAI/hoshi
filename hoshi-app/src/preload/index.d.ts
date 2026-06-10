import { ElectronAPI } from '@electron-toolkit/preload'

export interface HoshiDesktopApi {
  platform: string
  apiBaseUrl: string
}

declare global {
  interface Window {
    electron: ElectronAPI
    hoshi: HoshiDesktopApi
  }
}
