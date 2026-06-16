import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useChatMessages } from '../chat/ChatMessagesContext'
import { buildPetReplyBubbles } from '../pet/buildPetReplyBubbles'
import { usePetPreferences } from '../pet/usePetPreferences'
import { hasPetReplyStreamPending, isPetReplySettled } from '../pet/petReplyState'

interface PetReplyBubblesProps {
  visible: boolean
  onDismiss: () => void
}

type BubblePhase = 'streaming' | 'exiting'

export function PetReplyBubbles({
  visible,
  onDismiss
}: PetReplyBubblesProps): React.JSX.Element | null {
  const { messages, sending, stopStreaming } = useChatMessages()
  const { preferences } = usePetPreferences()
  const listRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<BubblePhase>('streaming')
  const [exitDistance, setExitDistance] = useState('0px')

  const streamPending = useMemo(() => hasPetReplyStreamPending(messages), [messages])

  const bubbles = useMemo(
    () =>
      visible ? buildPetReplyBubbles(messages, sending, false, preferences.maxReplyBubbles) : [],
    [messages, preferences.maxReplyBubbles, sending, visible]
  )

  const bubbleSignature = useMemo(
    () => bubbles.map((bubble) => `${bubble.id}:${bubble.content}`).join('|'),
    [bubbles]
  )

  const replySettled = isPetReplySettled(visible, bubbles.length, messages, sending)

  useEffect(() => {
    if (!visible || streamPending || sending) {
      setPhase('streaming')
    }
  }, [sending, streamPending, visible])

  useEffect(() => {
    const list = listRef.current
    if (!list || phase === 'exiting') {
      return
    }
    list.scrollTop = list.scrollHeight
  }, [bubbles, phase])

  useEffect(() => {
    if (!replySettled || phase === 'exiting') {
      return
    }

    const dwellTimer = window.setTimeout(() => {
      window.requestAnimationFrame(() => {
        const track = trackRef.current
        if (track) {
          setExitDistance(`-${track.scrollHeight}px`)
        }
        setPhase('exiting')
      })
    }, preferences.bubbleDwellMs)

    return () => window.clearTimeout(dwellTimer)
  }, [bubbleSignature, phase, preferences.bubbleDwellMs, replySettled])

  const handleAnimationEnd = (event: React.AnimationEvent<HTMLDivElement>): void => {
    if (event.currentTarget !== event.target || phase !== 'exiting') {
      return
    }
    if (event.animationName !== 'pet-bubbles-exit') {
      return
    }
    onDismiss()
  }

  if (!visible || bubbles.length === 0) {
    return null
  }

  return (
    <div
      ref={listRef}
      className={`pet-reply-bubbles pet-hit ${phase === 'exiting' ? 'is-exiting' : ''}`}
      aria-live="polite"
    >
      <div
        ref={trackRef}
        className="pet-reply-bubbles__track"
        style={
          {
            '--exit-duration': `${preferences.bubbleExitMs}ms`,
            '--exit-distance': exitDistance
          } as CSSProperties
        }
        onAnimationEnd={handleAnimationEnd}
      >
        {bubbles.map((bubble, index) => (
          <div
            key={bubble.id}
            className={`pet-chat-bubble pet-chat-bubble--assistant ${bubble.thinking ? 'is-thinking' : ''}`}
            style={{ '--bubble-index': index } as CSSProperties}
          >
            <p className="pet-chat-bubble__text">{bubble.content}</p>
          </div>
        ))}
      </div>
      {sending ? (
        <button
          type="button"
          className="pet-reply-bubbles__stop pet-hit"
          onClick={stopStreaming}
          aria-label="停止生成"
        >
          停止
        </button>
      ) : null}
    </div>
  )
}
