import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from 'react'

export type SettingsSection = 'profile' | 'security' | 'chat' | 'memory' | 'pet'

interface SettingsContextValue {
  open: boolean
  section: SettingsSection
  openSettings: (section?: SettingsSection) => void
  closeSettings: () => void
  setSection: (section: SettingsSection) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState<SettingsSection>('profile')

  const openSettings = useCallback((nextSection: SettingsSection = 'profile') => {
    setSection(nextSection)
    setOpen(true)
  }, [])

  const closeSettings = useCallback(() => {
    setOpen(false)
  }, [])

  const value = useMemo(
    () => ({
      open,
      section,
      openSettings,
      closeSettings,
      setSection
    }),
    [open, section, openSettings, closeSettings]
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) {
    throw new Error('useSettings must be used within SettingsProvider')
  }
  return ctx
}
