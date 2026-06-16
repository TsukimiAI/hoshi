import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useChatMessages } from '../chat/ChatMessagesContext'
import { useChatSessions } from '../chat/ChatSessionContext'
import { shouldSubmitOnKeyDown } from '../chat/inputBehavior'
import { useWebSearchToggle } from '../chat/useWebSearchToggle'
import { useAppPreferences } from '../settings/useAppPreferences'

interface PetInputBubbleProps {
  onClose: () => void
  onSent: () => void
}

export function PetInputBubble({ onClose, onSent }: PetInputBubbleProps): React.JSX.Element {
  const { requireAuth } = useAuth()
  const { activeSession } = useChatSessions()
  const { sendMessage, sending, error } = useChatMessages()
  const { preferences } = useAppPreferences()
  const { active: webSearch, locked: webSearchLocked, title: webSearchTitle, toggle: toggleWebSearch } =
    useWebSearchToggle()
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const submit = (): void => {
    const value = text.trim()
    if (!value || sending) {
      return
    }

    requireAuth(() => {
      if (!activeSession) {
        return
      }
      const pending = value
      const useWebSearch = webSearch
      setText('')
      onSent()
      void sendMessage(pending, useWebSearch).catch(() => {
        setText((current) => (current ? current : pending))
      })
    })
  }

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault()
    submit()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (!shouldSubmitOnKeyDown(event, preferences.sendShortcut)) {
      return
    }
    event.preventDefault()
    submit()
  }

  return (
    <form className="pet-chat-bubble pet-chat-bubble--input pet-hit" onSubmit={handleSubmit}>
      <textarea
        ref={textareaRef}
        className="pet-chat-bubble__input"
        rows={2}
        value={text}
        placeholder="跟星奈说点什么…"
        disabled={sending}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className="pet-chat-bubble__actions">
        <button
          type="button"
          className={`pet-chat-bubble__web-search ${webSearch ? 'is-active' : ''} ${webSearchLocked ? 'is-locked' : ''}`.trim()}
          aria-pressed={webSearch}
          aria-disabled={webSearchLocked}
          disabled={sending && !webSearchLocked}
          title={webSearchTitle}
          onClick={webSearchLocked ? undefined : toggleWebSearch}
        >
          联网
        </button>
        {error ? <span className="pet-chat-bubble__error">{error}</span> : null}
        <button type="button" className="pet-chat-bubble__btn" onClick={onClose} disabled={sending}>
          取消
        </button>
        <button type="submit" className="pet-chat-bubble__btn pet-chat-bubble__btn--primary" disabled={sending}>
          {sending ? '发送中…' : '发送'}
        </button>
      </div>
    </form>
  )
}
