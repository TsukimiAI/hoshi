import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import {
  applyAppPreferencesToDocument,
  subscribeSystemTheme
} from './applyAppPreferences'
import {
  DEFAULT_APP_PREFERENCES,
  normalizeAppPreferences,
  type AppPreferences
} from './appPreferences'

interface AppPreferencesContextValue {
  preferences: AppPreferences
  ready: boolean
  updatePreferences: (patch: Partial<AppPreferences>) => Promise<void>
}

const AppPreferencesContext = createContext<AppPreferencesContextValue | null>(null)

export function AppPreferencesProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [preferences, setPreferences] = useState<AppPreferences>(DEFAULT_APP_PREFERENCES)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void window.hoshi.app
      .getPreferences()
      .then((loaded) => {
        const normalized = normalizeAppPreferences(loaded)
        setPreferences(normalized)
        applyAppPreferencesToDocument(normalized)
      })
      .catch(() => {
        setPreferences(DEFAULT_APP_PREFERENCES)
        applyAppPreferencesToDocument(DEFAULT_APP_PREFERENCES)
      })
      .finally(() => setReady(true))
  }, [])

  useEffect(() => {
    if (preferences.theme !== 'system') {
      return
    }
    return subscribeSystemTheme(() => {
      applyAppPreferencesToDocument(preferences)
    })
  }, [preferences])

  const updatePreferences = useCallback(async (patch: Partial<AppPreferences>) => {
    const next = normalizeAppPreferences({ ...preferences, ...patch })
    const saved = normalizeAppPreferences(await window.hoshi.app.setPreferences(next))
    setPreferences(saved)
    applyAppPreferencesToDocument(saved)
  }, [preferences])

  const value = useMemo(
    () => ({
      preferences,
      ready,
      updatePreferences
    }),
    [preferences, ready, updatePreferences]
  )

  return (
    <AppPreferencesContext.Provider value={value}>{children}</AppPreferencesContext.Provider>
  )
}

export function useAppPreferences(): AppPreferencesContextValue {
  const ctx = useContext(AppPreferencesContext)
  if (!ctx) {
    throw new Error('useAppPreferences must be used within AppPreferencesProvider')
  }
  return ctx
}
