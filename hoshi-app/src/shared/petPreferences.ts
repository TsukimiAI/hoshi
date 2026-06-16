export type PanelOpenGesture = 'context-menu' | 'double-click'

export interface PetPreferences {
  bubbleDwellMs: number
  bubbleExitMs: number
  greetingDwellMs: number
  alwaysOnTop: boolean
  greetingOnClick: boolean
  maxReplyBubbles: number
  dragThresholdPx: number
  panelOpenGesture: PanelOpenGesture
}

export const DEFAULT_PET_PREFERENCES: PetPreferences = {
  bubbleDwellMs: 2000,
  bubbleExitMs: 2000,
  greetingDwellMs: 500,
  alwaysOnTop: true,
  greetingOnClick: true,
  maxReplyBubbles: 4,
  dragThresholdPx: 6,
  panelOpenGesture: 'context-menu'
}

export function normalizePetPreferences(partial: Partial<PetPreferences>): PetPreferences {
  return {
    bubbleDwellMs: partial.bubbleDwellMs ?? DEFAULT_PET_PREFERENCES.bubbleDwellMs,
    bubbleExitMs: partial.bubbleExitMs ?? DEFAULT_PET_PREFERENCES.bubbleExitMs,
    greetingDwellMs: partial.greetingDwellMs ?? DEFAULT_PET_PREFERENCES.greetingDwellMs,
    alwaysOnTop: partial.alwaysOnTop ?? DEFAULT_PET_PREFERENCES.alwaysOnTop,
    greetingOnClick: partial.greetingOnClick ?? DEFAULT_PET_PREFERENCES.greetingOnClick,
    maxReplyBubbles: partial.maxReplyBubbles ?? DEFAULT_PET_PREFERENCES.maxReplyBubbles,
    dragThresholdPx: partial.dragThresholdPx ?? DEFAULT_PET_PREFERENCES.dragThresholdPx,
    panelOpenGesture: partial.panelOpenGesture ?? DEFAULT_PET_PREFERENCES.panelOpenGesture
  }
}
