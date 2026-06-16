import type { AppPreferences } from './appPreferences'
import type { PetPreferences } from './petPreferences'

export type ShellMode = 'workstation' | 'pet'

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface HoshiWindowApi {
  getMode: () => Promise<ShellMode>
  setMode: (mode: ShellMode) => Promise<ShellMode>
  getBounds: () => Promise<WindowBounds | null>
  setBounds: (bounds: WindowBounds) => Promise<WindowBounds | null>
  getAlwaysOnTop: () => Promise<boolean>
  setAlwaysOnTop: (value: boolean) => Promise<boolean>
  setIgnoreMouseEvents: (ignore: boolean) => Promise<void>
  resetPetBounds: () => Promise<WindowBounds>
}

export interface HoshiPetApi {
  getPreferences: () => Promise<PetPreferences>
  setPreferences: (preferences: PetPreferences) => Promise<PetPreferences>
}

export interface HoshiAppApi {
  getPreferences: () => Promise<AppPreferences>
  setPreferences: (preferences: AppPreferences) => Promise<AppPreferences>
}

export interface HoshiDesktopApi {
  platform: string
  apiBaseUrl: string
  window: HoshiWindowApi
  pet: HoshiPetApi
  app: HoshiAppApi
}
