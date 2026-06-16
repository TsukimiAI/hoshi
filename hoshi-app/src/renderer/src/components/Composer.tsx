import { FormEvent, KeyboardEvent, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useChatMessages } from '../chat/ChatMessagesContext'
import { useChatSessions } from '../chat/ChatSessionContext'
import { sendShortcutHint, shouldSubmitOnKeyDown } from '../chat/inputBehavior'
import { useWebSearchToggle } from '../chat/useWebSearchToggle'
import { useAppPreferences } from '../settings/useAppPreferences'
import { WebSearchBadge } from './WebSearchBadge'

export function Composer(): React.JSX.Element {
  const { user, requireAuth } = useAuth()
  const { activeSession } = useChatSessions()
  const { sendMessage, stopStreaming, sending } = useChatMessages()
  const { preferences } = useAppPreferences()
  const { active: webSearch, locked: webSearchLocked, title: webSearchTitle, toggle: toggleWebSearch } =
    useWebSearchToggle()
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const submit = (): void => {
    const value = text.trim()
    if (!value || sending) return

    requireAuth(() => {
      if (!activeSession) return
      const pending = value
      const useWebSearch = webSearch
      setText('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
      void sendMessage(pending, useWebSearch).catch(() => {
        setText((current) => (current ? current : pending))
      })
    })
  }

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault()
    submit()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (!shouldSubmitOnKeyDown(e, preferences.sendShortcut)) {
      return
    }
    e.preventDefault()
    submit()
  }

  const handleInput = (): void => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`
  }

  const canSend = Boolean(user && activeSession && text.trim() && !sending)
  const sessionBlocked = Boolean(user) && (!activeSession || sending)

  return (
    <form className="composer" onSubmit={handleSubmit}>
      {webSearch ? (
        <div className="composer__status-row">
          <WebSearchBadge label="本次将联网" />
        </div>
      ) : null}
      <div className="composer__main">
      <div className={`composer__field ${user ? '' : 'composer__field--locked'}`}>
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={
            user
              ? activeSession
                ? sending
                  ? '星奈正在思考…'
                  : `输入消息，${sendShortcutHint(preferences.sendShortcut)}`
                : '请先选择或创建会话…'
              : '登录后即可开始对话…'
          }
          disabled={Boolean(user) && (!activeSession || sending)}
          onFocus={() => {
            if (!user) requireAuth(() => undefined)
          }}
        />
        {!user && <span className="composer__lock">需登录</span>}
      </div>
      <button
        type="button"
        className={`composer__web-search ${webSearch ? 'is-active' : ''} ${webSearchLocked ? 'is-locked' : ''}`.trim()}
        aria-pressed={webSearch}
        aria-disabled={webSearchLocked}
        disabled={sessionBlocked && !webSearchLocked}
        title={webSearchTitle}
        onClick={webSearchLocked ? undefined : toggleWebSearch}
      >
        联网
      </button>
      {sending ? (
        <button type="button" className="composer__send composer__send--stop" onClick={stopStreaming}>
          停止
        </button>
      ) : (
        <button type="submit" className="composer__send" disabled={!canSend}>
          发送
        </button>
      )}
      </div>
    </form>
  )
}
