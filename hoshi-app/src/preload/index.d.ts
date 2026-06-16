import { ElectronAPI } from '@electron-toolkit/preload'
import type { HoshiDesktopApi } from '../shared/desktop'

declare global {
  interface Window {
    electron: ElectronAPI
    hoshi: HoshiDesktopApi
  }
}
