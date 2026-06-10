import { FormEvent, useState } from 'react'
import { useAuth } from '../auth/AuthContext'

export function Composer(): React.JSX.Element {
  const { user, requireAuth } = useAuth()
  const [text, setText] = useState('')

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault()
    const value = text.trim()
    if (!value) return

    requireAuth(() => {
      // Chat API will be wired in a later iteration.
      setText('')
    })
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <div className={`composer__field ${user ? '' : 'composer__field--locked'}`}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={user ? '输入消息，按 Enter 发送…' : '登录后即可开始对话…'}
          onFocus={() => {
            if (!user) requireAuth(() => undefined)
          }}
        />
        {!user && <span className="composer__lock">需登录</span>}
      </div>
      <button type="submit" className="composer__send" disabled={!text.trim()}>
        发送
      </button>
    </form>
  )
}
