import { useEffect, useState } from 'react'
import { useMemory } from '../memory/MemoryContext'
import { useAppPreferences } from '../settings/useAppPreferences'

const FADE_MS = 800

function truncateContent(content: string, maxLength = 48): string {
  if (content.length <= maxLength) {
    return content
  }
  return `${content.slice(0, maxLength)}…`
}

function buildBubbleText(
  title: string,
  contents: string[]
): { title: string; detail: string | null } {
  if (contents.length === 0) {
    return { title, detail: null }
  }
  if (contents.length === 1) {
    return { title, detail: `「${truncateContent(contents[0])}」` }
  }
  return {
    title,
    detail: contents.map((item) => `「${truncateContent(item, 24)}」`).join(' ')
  }
}

interface MemoryEventToastProps {
  visible: boolean
}

export function MemoryEventToast({ visible }: MemoryEventToastProps): React.JSX.Element | null {
  const { activeToast, dismissToast } = useMemory()
  const { preferences } = useAppPreferences()
  const [fading, setFading] = useState(false)
  const displayMs = preferences.memoryToastDwellMs

  useEffect(() => {
    if (!activeToast || !visible || !preferences.memoryToastEnabled) {
      setFading(false)
      return
    }

    setFading(false)
    const fadeTimer = window.setTimeout(() => {
      setFading(true)
    }, displayMs)
    const dismissTimer = window.setTimeout(() => {
      dismissToast()
    }, displayMs + FADE_MS)

    return () => {
      window.clearTimeout(fadeTimer)
      window.clearTimeout(dismissTimer)
    }
  }, [
    activeToast?.id,
    dismissToast,
    displayMs,
    preferences.memoryToastEnabled,
    visible
  ])

  if (!activeToast || !visible || !preferences.memoryToastEnabled) {
    return null
  }

  const isPromoted = activeToast.eventType === 'promoted'
  const title = isPromoted ? '星奈多了解了你一点～' : '星奈记住了与你的点点滴滴'
  const { title: bubbleTitle, detail } = buildBubbleText(
    title,
    activeToast.memories.map((memory) => memory.content)
  )

  return (
    <div
      className={`memory-bubble pet-hit ${isPromoted ? 'memory-bubble--promoted' : 'memory-bubble--created'} ${fading ? 'is-fading' : ''}`}
      role="status"
      aria-live="polite"
    >
      <span className="memory-bubble__icon" aria-hidden>
        💬
      </span>
      <div className="memory-bubble__content">
        <p className="memory-bubble__title">{bubbleTitle}</p>
        {detail ? <p className="memory-bubble__detail">{detail}</p> : null}
      </div>
      <span className="memory-bubble__tail" aria-hidden />
    </div>
  )
}
