import { useEffect } from 'react'
import { useChatMessages } from '../chat/ChatMessagesContext'
import { useChatSessions } from '../chat/ChatSessionContext'
import { usePetCompanionEvents } from './PetCompanionEventsProvider'

interface ProactiveChatBridgeProps {
  onProactiveMessage: (sessionId: string) => void
}

export function ProactiveChatBridge({ onProactiveMessage }: ProactiveChatBridgeProps): null {
  const { activeSessionId } = useChatSessions()
  const { refreshMessages, sending } = useChatMessages()
  const { subscribeProactiveMessage } = usePetCompanionEvents()

  useEffect(() => {
    return subscribeProactiveMessage((event) => {
      if (sending) {
        return
      }
      if (activeSessionId && event.sessionId === activeSessionId) {
        void refreshMessages({ silent: true })
      }
      onProactiveMessage(event.sessionId)
    })
  }, [
    activeSessionId,
    onProactiveMessage,
    refreshMessages,
    sending,
    subscribeProactiveMessage
  ])

  return null
}
