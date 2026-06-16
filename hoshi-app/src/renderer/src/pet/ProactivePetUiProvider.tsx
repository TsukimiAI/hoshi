import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import { ProactiveChatBridge } from './ProactiveChatBridge'
import { PetCompanionEventsProvider } from './PetCompanionEventsProvider'

interface ProactivePetUiContextValue {
  proactiveBubbleSessionId: string | null
  notifyProactiveMessage: (sessionId: string) => void
  clearProactiveBubble: () => void
}

const ProactivePetUiContext = createContext<ProactivePetUiContextValue | null>(null)

export function ProactivePetUiProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [proactiveBubbleSessionId, setProactiveBubbleSessionId] = useState<string | null>(null)

  const notifyProactiveMessage = useCallback((sessionId: string) => {
    setProactiveBubbleSessionId(sessionId)
  }, [])

  const clearProactiveBubble = useCallback(() => {
    setProactiveBubbleSessionId(null)
  }, [])

  const value = useMemo(
    () => ({
      proactiveBubbleSessionId,
      notifyProactiveMessage,
      clearProactiveBubble
    }),
    [clearProactiveBubble, notifyProactiveMessage, proactiveBubbleSessionId]
  )

  return (
    <PetCompanionEventsProvider>
      <ProactivePetUiContext.Provider value={value}>
        <ProactiveChatBridge onProactiveMessage={notifyProactiveMessage} />
        {children}
      </ProactivePetUiContext.Provider>
    </PetCompanionEventsProvider>
  )
}

export function useProactivePetUi(): ProactivePetUiContextValue {
  const context = useContext(ProactivePetUiContext)
  if (!context) {
    throw new Error('useProactivePetUi must be used within ProactivePetUiProvider')
  }
  return context
}
