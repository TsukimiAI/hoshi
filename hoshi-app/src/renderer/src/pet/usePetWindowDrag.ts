import { useCallback, useEffect, useRef } from 'react'

interface DragState {
  active: boolean
  moved: boolean
  startScreenX: number
  startScreenY: number
  pointerId: number | null
}

const DOUBLE_TAP_MS = 350
const DOUBLE_TAP_DISTANCE_PX = 12

const initialDragState = (): DragState => ({
  active: false,
  moved: false,
  startScreenX: 0,
  startScreenY: 0,
  pointerId: null
})

function setPetDragging(active: boolean): void {
  if (active) {
    document.documentElement.dataset.petDragging = 'true'
  } else {
    delete document.documentElement.dataset.petDragging
  }
}

export function usePetWindowDrag(
  onTap?: () => void,
  dragThresholdPx = 6,
  onDoubleTap?: () => void
): {
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void
  onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void
} {
  const dragRef = useRef<DragState>(initialDragState())
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null)
  const singleTapTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (singleTapTimerRef.current !== null) {
        window.clearTimeout(singleTapTimerRef.current)
      }
    }
  }, [])

  const resetDrag = useCallback((event: React.PointerEvent<HTMLElement>): void => {
    if (dragRef.current.pointerId !== null) {
      try {
        event.currentTarget.releasePointerCapture(dragRef.current.pointerId)
      } catch {
        // Ignore if capture was already released.
      }
    }
    setPetDragging(false)
    dragRef.current = initialDragState()
  }, [])

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLElement>): void => {
    if (event.button !== 0) {
      return
    }
    dragRef.current = {
      active: true,
      moved: false,
      startScreenX: event.screenX,
      startScreenY: event.screenY,
      pointerId: event.pointerId
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>): void => {
      if (!dragRef.current.active || dragRef.current.pointerId !== event.pointerId) {
        return
      }

      const deltaX = event.screenX - dragRef.current.startScreenX
      const deltaY = event.screenY - dragRef.current.startScreenY

      if (!dragRef.current.moved) {
        if (Math.hypot(deltaX, deltaY) < dragThresholdPx) {
          return
        }
        dragRef.current.moved = true
        setPetDragging(true)
        void window.hoshi.window.setIgnoreMouseEvents(false)
      }

      void (async () => {
        const bounds = await window.hoshi.window.getBounds()
        if (!bounds) {
          return
        }
        await window.hoshi.window.setBounds({
          x: Math.round(bounds.x + deltaX),
          y: Math.round(bounds.y + deltaY),
          width: bounds.width,
          height: bounds.height
        })
      })()

      dragRef.current.startScreenX = event.screenX
      dragRef.current.startScreenY = event.screenY
    },
    [dragThresholdPx]
  )

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLElement>): void => {
      if (!dragRef.current.active || dragRef.current.pointerId !== event.pointerId) {
        return
      }

      const shouldTap = !dragRef.current.moved
      resetDrag(event)
      if (!shouldTap) {
        return
      }

      if (!onDoubleTap) {
        onTap?.()
        return
      }

      const now = Date.now()
      const lastTap = lastTapRef.current
      if (
        lastTap &&
        now - lastTap.time <= DOUBLE_TAP_MS &&
        Math.hypot(event.screenX - lastTap.x, event.screenY - lastTap.y) <= DOUBLE_TAP_DISTANCE_PX
      ) {
        if (singleTapTimerRef.current !== null) {
          window.clearTimeout(singleTapTimerRef.current)
          singleTapTimerRef.current = null
        }
        lastTapRef.current = null
        onDoubleTap()
        return
      }

      lastTapRef.current = { time: now, x: event.screenX, y: event.screenY }
      if (singleTapTimerRef.current !== null) {
        window.clearTimeout(singleTapTimerRef.current)
      }
      singleTapTimerRef.current = window.setTimeout(() => {
        singleTapTimerRef.current = null
        lastTapRef.current = null
        onTap?.()
      }, DOUBLE_TAP_MS)
    },
    [onDoubleTap, onTap, resetDrag]
  )

  const onPointerCancel = useCallback(
    (event: React.PointerEvent<HTMLElement>): void => {
      resetDrag(event)
    },
    [resetDrag]
  )

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel
  }
}
