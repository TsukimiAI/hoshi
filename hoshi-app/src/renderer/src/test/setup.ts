import '@testing-library/jest-dom/vitest'
import { DEFAULT_APP_PREFERENCES } from '../settings/appPreferences'

if (typeof document !== 'undefined' && !document.elementFromPoint) {
  document.elementFromPoint = () => null
}

if (typeof window !== 'undefined' && !window.hoshi) {
  window.hoshi = {
    platform: 'darwin',
    apiBaseUrl: 'http://localhost:8080',
    window: {
      getMode: async () => 'pet',
      setMode: async (mode) => mode,
      getBounds: async () => ({ x: 0, y: 0, width: 380, height: 380 }),
      setBounds: async (bounds) => bounds,
      getAlwaysOnTop: async () => true,
      setAlwaysOnTop: async (value) => value,
      setIgnoreMouseEvents: async () => undefined,
      resetPetBounds: async () => ({ x: 100, y: 100, width: 380, height: 380 })
    },
    pet: {
      getPreferences: async () => ({
        bubbleDwellMs: 2000,
        bubbleExitMs: 2000,
        greetingDwellMs: 500,
        alwaysOnTop: true,
        greetingOnClick: true,
        maxReplyBubbles: 4,
        dragThresholdPx: 6,
        panelOpenGesture: 'context-menu'
      }),
      setPreferences: async (preferences) => preferences
    },
    app: {
      getPreferences: async () => DEFAULT_APP_PREFERENCES,
      setPreferences: async (preferences) => preferences
    }
  }
}
