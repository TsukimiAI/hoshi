import { useEffect } from 'react'
import { isOverInteractivePetArea } from './petHitTest'

export function usePetClickThrough(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      void window.hoshi.window.setIgnoreMouseEvents(false)
      return
    }

    let ignoring = false

    const syncIgnore = (clientX: number, clientY: number): void => {
      if (document.documentElement.dataset.petDragging === 'true') {
        if (ignoring) {
          ignoring = false
          void window.hoshi.window.setIgnoreMouseEvents(false)
        }
        return
      }

      const shouldIgnore = !isOverInteractivePetArea(clientX, clientY)
      if (shouldIgnore === ignoring) {
        return
      }
      ignoring = shouldIgnore
      void window.hoshi.window.setIgnoreMouseEvents(shouldIgnore)
    }

    const handleMouseMove = (event: MouseEvent): void => {
      syncIgnore(event.clientX, event.clientY)
    }

    const handleMouseLeave = (): void => {
      if (!ignoring) {
        ignoring = true
        void window.hoshi.window.setIgnoreMouseEvents(true)
      }
    }

    void window.hoshi.window.setIgnoreMouseEvents(true)
    ignoring = true
    window.addEventListener('mousemove', handleMouseMove)
    document.documentElement.addEventListener('mouseleave', handleMouseLeave)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      document.documentElement.removeEventListener('mouseleave', handleMouseLeave)
      void window.hoshi.window.setIgnoreMouseEvents(false)
    }
  }, [enabled])
}
