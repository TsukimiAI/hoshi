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
  fetchProactivePreferences,
  updateProactivePreferences,
  type ProactivePreferences,
  type UpdateProactivePreferencesRequest
} from '../api/proactivePreferences'

interface ProactivePreferencesContextValue {
  preferences: ProactivePreferences | null
  ready: boolean
  error: string | null
  updatePreferences: (patch: UpdateProactivePreferencesRequest) => Promise<void>
  refresh: () => Promise<void>
}

const ProactivePreferencesContext = createContext<ProactivePreferencesContextValue | null>(null)

export function ProactivePreferencesProvider({
  children
}: {
  children: ReactNode
}): React.JSX.Element {
  const [preferences, setPreferences] = useState<ProactivePreferences | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const res = await fetchProactivePreferences()
      setPreferences(res.data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载主动对话设置失败')
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const updatePreferences = useCallback(
    async (patch: UpdateProactivePreferencesRequest): Promise<void> => {
      const res = await updateProactivePreferences(patch)
      setPreferences(res.data)
      setError(null)
    },
    []
  )

  const value = useMemo(
    () => ({
      preferences,
      ready,
      error,
      updatePreferences,
      refresh
    }),
    [preferences, ready, error, updatePreferences, refresh]
  )

  return (
    <ProactivePreferencesContext.Provider value={value}>
      {children}
    </ProactivePreferencesContext.Provider>
  )
}

export function useProactivePreferences(): ProactivePreferencesContextValue {
  const ctx = useContext(ProactivePreferencesContext)
  if (!ctx) {
    throw new Error('useProactivePreferences must be used within ProactivePreferencesProvider')
  }
  return ctx
}
