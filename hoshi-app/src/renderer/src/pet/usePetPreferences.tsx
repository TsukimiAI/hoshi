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
  DEFAULT_PET_PREFERENCES,
  normalizePetPreferences,
  type PetPreferences
} from '../pet/petPreferences'

interface PetPreferencesContextValue {
  preferences: PetPreferences
  ready: boolean
  updatePreferences: (patch: Partial<PetPreferences>) => Promise<void>
}

const PetPreferencesContext = createContext<PetPreferencesContextValue | null>(null)

export function PetPreferencesProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [preferences, setPreferences] = useState<PetPreferences>(DEFAULT_PET_PREFERENCES)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void window.hoshi.pet
      .getPreferences()
      .then((loaded) => {
        const normalized = normalizePetPreferences(loaded)
        setPreferences(normalized)
        void window.hoshi.window.setAlwaysOnTop(normalized.alwaysOnTop)
      })
      .catch(() => {
        setPreferences(DEFAULT_PET_PREFERENCES)
      })
      .finally(() => setReady(true))
  }, [])

  const updatePreferences = useCallback(async (patch: Partial<PetPreferences>) => {
    const next = normalizePetPreferences({ ...preferences, ...patch })
    const saved = normalizePetPreferences(await window.hoshi.pet.setPreferences(next))
    setPreferences(saved)
    if (patch.alwaysOnTop != null) {
      await window.hoshi.window.setAlwaysOnTop(saved.alwaysOnTop)
    }
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
    <PetPreferencesContext.Provider value={value}>{children}</PetPreferencesContext.Provider>
  )
}

export function usePetPreferences(): PetPreferencesContextValue {
  const ctx = useContext(PetPreferencesContext)
  if (!ctx) {
    throw new Error('usePetPreferences must be used within PetPreferencesProvider')
  }
  return ctx
}
