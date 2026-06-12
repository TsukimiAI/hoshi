import { useChatMessages } from '../chat/ChatMessagesContext'
import { PENDING_ASSISTANT_ID } from '../api/chat'
import type { ChatMessage } from '../types/chat'

interface ChatMessageActionsProps {
  message: ChatMessage
  isLastAssistant: boolean
}

export function ChatMessageActions({
  message,
  isLastAssistant
}: ChatMessageActionsProps): React.JSX.Element {
  const { sending, regenerateLastReply, deleteMessage } = useChatMessages()

  const handleCopy = async (): Promise<void> => {
    if (!message.content) return
    try {
      await navigator.clipboard.writeText(message.content)
    } catch {
      // Clipboard may be unavailable in some environments.
    }
  }

  const handleDelete = (): void => {
    if (message.id === PENDING_ASSISTANT_ID || sending) return
    void deleteMessage(message.id)
  }

  const handleRegenerate = (): void => {
    if (!isLastAssistant || sending) return
    void regenerateLastReply()
  }

  return (
    <div className="chat-bubble__actions">
      <button type="button" onClick={() => void handleCopy()} disabled={!message.content}>
        复制
      </button>
      {message.role === 'assistant' && isLastAssistant ? (
        <button type="button" onClick={handleRegenerate} disabled={sending}>
          重新生成
        </button>
      ) : null}
      <button
        type="button"
        className="chat-bubble__action--danger"
        onClick={handleDelete}
        disabled={message.id === PENDING_ASSISTANT_ID || sending}
      >
        删除
      </button>
    </div>
  )
}
