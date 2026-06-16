import { createContext, useContext, type ReactNode } from 'react'
import type { ChatMessagesContextValue } from './chatMessagesTypes'
import { useChatMessagesController } from './useChatMessagesController'

const ChatMessagesContext = createContext<ChatMessagesContextValue | null>(null)

export function ChatMessagesProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const value = useChatMessagesController()
  return <ChatMessagesContext.Provider value={value}>{children}</ChatMessagesContext.Provider>
}

export function useChatMessages(): ChatMessagesContextValue {
  const context = useContext(ChatMessagesContext)
  if (!context) {
    throw new Error('useChatMessages must be used within ChatMessagesProvider')
  }
  return context
}
