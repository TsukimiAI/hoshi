import { FormEvent, KeyboardEvent, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useChatMessages } from '../chat/ChatMessagesContext'
import { useChatSessions } from '../chat/ChatSessionContext'

export function Composer(): React.JSX.Element {
  const { user, requireAuth } = useAuth()
  const { activeSession } = useChatSessions()
  const { sendMessage, stopStreaming, sending } = useChatMessages()
  const [text, setText] = useState('')
  const [webSearch, setWebSearch] = useState(false)
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
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) {
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

  return (
    <form className="composer" onSubmit={handleSubmit}>
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
                  : '输入消息，Enter 发送，Shift+Enter 换行…'
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
        className={`composer__web-search ${webSearch ? 'is-active' : ''}`}
        aria-pressed={webSearch}
        disabled={Boolean(user) && (!activeSession || sending)}
        title="开启后星奈可检索近期网络信息"
        onClick={() => setWebSearch((current) => !current)}
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
    </form>
  )
}
