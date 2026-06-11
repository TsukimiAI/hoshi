import { FormEvent, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useChatMessages } from '../chat/ChatMessagesContext'
import { useChatSessions } from '../chat/ChatSessionContext'

export function Composer(): React.JSX.Element {
  const { user, requireAuth } = useAuth()
  const { activeSession } = useChatSessions()
  const { sendMessage, stopStreaming, sending } = useChatMessages()
  const [text, setText] = useState('')

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault()
    const value = text.trim()
    if (!value || sending) return

    requireAuth(() => {
      if (!activeSession) return
      const pending = value
      setText('')
      void sendMessage(pending).catch(() => {
        setText((current) => (current ? current : pending))
      })
    })
  }

  const canSend = Boolean(user && activeSession && text.trim() && !sending)

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <div className={`composer__field ${user ? '' : 'composer__field--locked'}`}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            user
              ? activeSession
                ? sending
                  ? '星奈正在思考…'
                  : '输入消息，按 Enter 发送…'
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
