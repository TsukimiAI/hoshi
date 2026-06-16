import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useChatMessages } from '../chat/ChatMessagesContext'
import { useMemory } from '../memory/MemoryContext'
import {
  resolveEmotionFromChatState,
  resolveMemoryEventPetEmotion,
  resolveProactivePetEmotion
} from '../pet/petEmotion'
import { usePetCompanionEvents } from '../pet/PetCompanionEventsProvider'
import { getPetSprite, resolvePetEmotion } from '../pet/petSprites'
import { usePetPreferences } from '../pet/usePetPreferences'
import { usePetWindowDrag } from '../pet/usePetWindowDrag'
import { MemoryEventToast } from './MemoryEventToast'

export type PetStageVariant = 'panel' | 'overlay'

interface PetStageProps {
  variant?: PetStageVariant
  memoryToastVisible?: boolean
  onPetClick?: () => void
  onPetOpenPanel?: () => void
  className?: string
  children?: ReactNode
}

export function PetStage({
  variant = 'panel',
  memoryToastVisible = true,
  onPetClick,
  onPetOpenPanel,
  className = '',
  children
}: PetStageProps): React.JSX.Element {
  const { messages, sending } = useChatMessages()
  const { activeToast } = useMemory()
  const { preferences } = usePetPreferences()
  const { subscribeEmotion, subscribeProactiveMessage } = usePetCompanionEvents()
  const [emotion, setEmotion] = useState(() => resolveEmotionFromChatState([], false))
  const sendingRef = useRef(sending)
  const companionEmotionRef = useRef<string | null>(null)
  sendingRef.current = sending

  const openPanelOnDoubleClick =
    preferences.panelOpenGesture === 'double-click' ? onPetOpenPanel : undefined

  const dragHandlers = usePetWindowDrag(onPetClick, preferences.dragThresholdPx, openPanelOnDoubleClick)

  useEffect(() => {
    return subscribeEmotion((event) => {
      if (!sendingRef.current) {
        return
      }
      companionEmotionRef.current = event.value
      setEmotion(resolvePetEmotion(event.value))
    })
  }, [subscribeEmotion])

  useEffect(() => {
    return subscribeProactiveMessage((event) => {
      companionEmotionRef.current = event.emotion ?? 'expect'
      setEmotion(resolveProactivePetEmotion(event.emotion))
    })
  }, [subscribeProactiveMessage])

  useEffect(() => {
    if (sending) {
      setEmotion(resolveEmotionFromChatState(messages, true))
      return
    }
    if (companionEmotionRef.current) {
      setEmotion(resolvePetEmotion(companionEmotionRef.current))
      return
    }
    setEmotion(resolveEmotionFromChatState(messages, false))
  }, [messages, sending])

  useEffect(() => {
    if (!activeToast || sending) {
      return
    }
    setEmotion(resolveMemoryEventPetEmotion(activeToast.eventType))
    const timer = window.setTimeout(() => {
      if (!sendingRef.current) {
        companionEmotionRef.current = null
        setEmotion(resolveEmotionFromChatState(messages, false))
      }
    }, 2400)
    return () => window.clearTimeout(timer)
  }, [activeToast, messages, sending])

  const rootClass = [
    'pet-stage',
    variant === 'overlay' ? 'pet-stage--overlay' : 'pet-stage--panel',
    className
  ]
    .filter(Boolean)
    .join(' ')

  const sprite = (
    <img className="pet-sprite" src={getPetSprite(emotion)} alt="星奈" draggable={false} />
  )

  const handleContextMenu = (event: React.MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault()
    if (preferences.panelOpenGesture === 'context-menu') {
      onPetOpenPanel?.()
    }
  }

  const petAriaLabel =
    preferences.panelOpenGesture === 'double-click'
      ? '拖动星奈；单击听星奈说话，双击打开菜单'
      : '拖动星奈；单击听星奈说话，右键打开菜单'

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>): void => {
    dragHandlers.onPointerDown(event)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>): void => {
    dragHandlers.onPointerMove(event)
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>): void => {
    dragHandlers.onPointerUp(event)
  }

  const handlePointerCancel = (event: React.PointerEvent<HTMLButtonElement>): void => {
    dragHandlers.onPointerCancel(event)
  }

  return (
    <div className={rootClass}>
      <MemoryEventToast visible={memoryToastVisible} />
      {children}
      {variant === 'overlay' ? (
        <button
          type="button"
          className="pet-stage__sprite-btn pet-hit"
          aria-label={petAriaLabel}
          onContextMenu={handleContextMenu}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          {sprite}
        </button>
      ) : (
        sprite
      )}
    </div>
  )
}
