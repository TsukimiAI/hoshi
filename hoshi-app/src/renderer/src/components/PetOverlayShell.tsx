import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useChatSessions } from '../chat/ChatSessionContext'
import { usePetClickThrough } from '../pet/usePetClickThrough'
import { useProactivePetUi } from '../pet/ProactivePetUiProvider'
import { usePetPreferences } from '../pet/usePetPreferences'
import { pickPetGreetingLine } from '../pet/petOverlayConfig'
import { useSettings } from '../settings/SettingsContext'
import { useShellMode } from '../shell/ShellModeContext'
import { LoginModal } from './LoginModal'
import { PetActionMenu } from './PetActionMenu'
import { PetInputBubble } from './PetInputBubble'
import { PetReplyBubbles } from './PetReplyBubbles'
import { PetSessionPicker } from './PetSessionPicker'
import { PetSpeechBubble } from './PetSpeechBubble'
import { PetStage } from './PetStage'
import './PetOverlay.css'

type OverlayPanel = 'none' | 'menu' | 'chat' | 'sessions'

export function PetOverlayShell(): React.JSX.Element {
  const { requireAuth } = useAuth()
  const { activeSessionId } = useChatSessions()
  const { preferences } = usePetPreferences()
  const { openSettings } = useSettings()
  const { exitPetMode } = useShellMode()
  const { proactiveBubbleSessionId, clearProactiveBubble } = useProactivePetUi()
  const shellRef = useRef<HTMLDivElement>(null)
  const [panel, setPanel] = useState<OverlayPanel>('none')
  const [dockVisible, setDockVisible] = useState(false)
  const [greetingVisible, setGreetingVisible] = useState(false)
  const [greetingLine, setGreetingLine] = useState('')
  const [chatBubblesVisible, setChatBubblesVisible] = useState(false)

  usePetClickThrough(true)

  useEffect(() => {
    if (proactiveBubbleSessionId && proactiveBubbleSessionId === activeSessionId) {
      setChatBubblesVisible(true)
    }
  }, [activeSessionId, proactiveBubbleSessionId])

  useEffect(() => {
    if (panel === 'none' && !greetingVisible && !chatBubblesVisible) {
      setDockVisible(false)
      return
    }
    const frame = window.requestAnimationFrame(() => setDockVisible(true))
    return () => window.cancelAnimationFrame(frame)
  }, [chatBubblesVisible, greetingVisible, panel])

  useEffect(() => {
    if (panel === 'menu' || panel === 'chat' || panel === 'sessions') {
      setGreetingVisible(false)
    }
  }, [panel])

  useEffect(() => {
    if (panel === 'none') {
      return
    }

    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }
      if (shellRef.current?.contains(target)) {
        return
      }
      setPanel('none')
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [panel])

  const handlePetOpenPanel = (): void => {
    requireAuth(() => {
      setGreetingVisible(false)
      setPanel((current) => (current === 'menu' ? 'none' : 'menu'))
    })
  }

  const handlePetClick = (): void => {
    requireAuth(() => {
      if (!preferences.greetingOnClick) {
        return
      }
      setPanel('none')
      setGreetingLine(pickPetGreetingLine())
      setGreetingVisible(true)
    })
  }

  const handleChatOpen = (): void => {
    setPanel('chat')
  }

  const handleChatSent = (): void => {
    setChatBubblesVisible(true)
    setPanel('none')
  }

  const handleSessionChange = (): void => {
    setChatBubblesVisible(false)
  }

  const handleOpenSettings = (): void => {
    requireAuth(() => {
      setPanel('none')
      openSettings('pet')
      void exitPetMode()
    })
  }

  const showDock =
    dockVisible &&
    (greetingVisible || panel !== 'none' || chatBubblesVisible)

  return (
    <div ref={shellRef} className="pet-overlay">
      <div className="pet-overlay__scene">
        <div className="pet-overlay__anchor">
          <PetStage
            variant="overlay"
            className="pet-overlay__stage"
            memoryToastVisible={panel !== 'sessions'}
            onPetClick={handlePetClick}
            onPetOpenPanel={handlePetOpenPanel}
          />

          {showDock ? (
            <div className={`pet-overlay__dock ${dockVisible ? 'is-visible' : ''}`}>
              {greetingVisible ? (
                <PetSpeechBubble
                  visible={greetingVisible}
                  content={greetingLine}
                  onDismiss={() => setGreetingVisible(false)}
                />
              ) : null}

              {panel === 'menu' ? (
                <PetActionMenu
                  visible={dockVisible}
                  onChat={handleChatOpen}
                  onSessions={() => setPanel('sessions')}
                  onSettings={handleOpenSettings}
                  onClose={() => setPanel('none')}
                />
              ) : null}

              {chatBubblesVisible ? (
                <PetReplyBubbles
                  visible={chatBubblesVisible}
                  onDismiss={() => {
                    setChatBubblesVisible(false)
                    clearProactiveBubble()
                  }}
                />
              ) : null}

              {panel === 'chat' ? (
                <PetInputBubble onClose={() => setPanel('none')} onSent={handleChatSent} />
              ) : null}

              {panel === 'sessions' ? (
                <PetSessionPicker onClose={() => setPanel('none')} onSessionChange={handleSessionChange} />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <LoginModal />
    </div>
  )
}
