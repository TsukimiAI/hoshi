import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { usePetPreferences } from '../pet/usePetPreferences'

interface PetSpeechBubbleProps {
  visible: boolean
  content: string
  onDismiss?: () => void
}

type SpeechPhase = 'entering' | 'exiting'

export function PetSpeechBubble({
  visible,
  content,
  onDismiss
}: PetSpeechBubbleProps): React.JSX.Element | null {
  const { preferences } = usePetPreferences()
  const [phase, setPhase] = useState<SpeechPhase>('entering')
  const dwellTimerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!visible || !content.trim()) {
      setPhase('entering')
      return
    }
    setPhase('entering')
  }, [content, visible])

  useEffect(() => {
    return () => {
      if (dwellTimerRef.current != null) {
        window.clearTimeout(dwellTimerRef.current)
      }
    }
  }, [])

  const handleAnimationEnd = (event: React.AnimationEvent<HTMLDivElement>): void => {
    if (event.animationName === 'pet-bubble-in' && phase === 'entering') {
      dwellTimerRef.current = window.setTimeout(() => {
        setPhase('exiting')
      }, preferences.greetingDwellMs)
      return
    }
    if (event.animationName === 'pet-bubbles-exit' && phase === 'exiting') {
      onDismiss?.()
    }
  }

  if (!visible || !content.trim()) {
    return null
  }

  return (
    <div
      className={`pet-chat-bubble pet-chat-bubble--assistant pet-hit ${
        phase === 'entering' ? 'is-entering' : 'is-exiting'
      }`}
      style={{ '--exit-duration': `${preferences.bubbleExitMs}ms` } as CSSProperties}
      role="status"
      aria-live="polite"
      onAnimationEnd={handleAnimationEnd}
    >
      <p className="pet-chat-bubble__text">{content}</p>
    </div>
  )
}
