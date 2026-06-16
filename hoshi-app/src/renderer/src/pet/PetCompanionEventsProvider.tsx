import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode
} from 'react'
import { resolvePetWsUrl } from './petWs'
import { parseCompanionWsEvent, type CompanionEmotionEvent, type CompanionProactiveMessageEvent } from './petCompanionEvents'

type EmotionListener = (event: CompanionEmotionEvent) => void
type ProactiveListener = (event: CompanionProactiveMessageEvent) => void

interface PetCompanionEventsContextValue {
  subscribeEmotion: (listener: EmotionListener) => () => void
  subscribeProactiveMessage: (listener: ProactiveListener) => () => void
}

const PetCompanionEventsContext = createContext<PetCompanionEventsContextValue | null>(null)

export function PetCompanionEventsProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const emotionListenersRef = useRef(new Set<EmotionListener>())
  const proactiveListenersRef = useRef(new Set<ProactiveListener>())

  useEffect(() => {
    const socket = new WebSocket(resolvePetWsUrl())
    socket.onmessage = (event) => {
      const parsed = parseCompanionWsEvent(event.data as string)
      if (!parsed) {
        return
      }
      if (parsed.type === 'emotion') {
        emotionListenersRef.current.forEach((listener) => listener(parsed))
        return
      }
      proactiveListenersRef.current.forEach((listener) => listener(parsed))
    }
    return () => socket.close()
  }, [])

  const subscribeEmotion = useCallback((listener: EmotionListener) => {
    emotionListenersRef.current.add(listener)
    return () => emotionListenersRef.current.delete(listener)
  }, [])

  const subscribeProactiveMessage = useCallback((listener: ProactiveListener) => {
    proactiveListenersRef.current.add(listener)
    return () => proactiveListenersRef.current.delete(listener)
  }, [])

  const value = useMemo(
    () => ({
      subscribeEmotion,
      subscribeProactiveMessage
    }),
    [subscribeEmotion, subscribeProactiveMessage]
  )

  return (
    <PetCompanionEventsContext.Provider value={value}>{children}</PetCompanionEventsContext.Provider>
  )
}

export function usePetCompanionEvents(): PetCompanionEventsContextValue {
  const context = useContext(PetCompanionEventsContext)
  if (!context) {
    throw new Error('usePetCompanionEvents must be used within PetCompanionEventsProvider')
  }
  return context
}
