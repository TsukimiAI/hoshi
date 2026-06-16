import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import type { ShellMode } from '../../../shared/desktop'

interface ShellModeContextValue {
  mode: ShellMode
  ready: boolean
  alwaysOnTop: boolean
  enterPetMode: () => Promise<void>
  exitPetMode: () => Promise<void>
  setAlwaysOnTop: (value: boolean) => Promise<void>
}

const ShellModeContext = createContext<ShellModeContextValue | null>(null)

function applyDocumentMode(mode: ShellMode): void {
  const isPet = mode === 'pet'
  document.documentElement.classList.toggle('shell-mode-pet', isPet)
  document.body.classList.toggle('shell-mode-pet', isPet)
}

export function ShellModeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [mode, setMode] = useState<ShellMode>('workstation')
  const [ready, setReady] = useState(false)
  const [alwaysOnTop, setAlwaysOnTopState] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [currentMode, onTop] = await Promise.all([
          window.hoshi.window.getMode(),
          window.hoshi.window.getAlwaysOnTop()
        ])
        if (!cancelled) {
          setMode(currentMode)
          setAlwaysOnTopState(onTop)
          applyDocumentMode(currentMode)
        }
      } catch {
        if (!cancelled) {
          applyDocumentMode('workstation')
        }
      } finally {
        if (!cancelled) {
          setReady(true)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const enterPetMode = useCallback(async () => {
    const nextMode = await window.hoshi.window.setMode('pet')
    setMode(nextMode)
    applyDocumentMode(nextMode)
    const onTop = await window.hoshi.window.getAlwaysOnTop()
    setAlwaysOnTopState(onTop)
  }, [])

  const exitPetMode = useCallback(async () => {
    const nextMode = await window.hoshi.window.setMode('workstation')
    setMode(nextMode)
    applyDocumentMode(nextMode)
    setAlwaysOnTopState(false)
  }, [])

  const setAlwaysOnTop = useCallback(async (value: boolean) => {
    const onTop = await window.hoshi.window.setAlwaysOnTop(value)
    setAlwaysOnTopState(onTop)
  }, [])

  const value = useMemo(
    () => ({
      mode,
      ready,
      alwaysOnTop,
      enterPetMode,
      exitPetMode,
      setAlwaysOnTop
    }),
    [alwaysOnTop, enterPetMode, exitPetMode, mode, ready, setAlwaysOnTop]
  )

  return <ShellModeContext.Provider value={value}>{children}</ShellModeContext.Provider>
}

export function useShellMode(): ShellModeContextValue {
  const context = useContext(ShellModeContext)
  if (!context) {
    throw new Error('useShellMode must be used within ShellModeProvider')
  }
  return context
}
