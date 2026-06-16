import type { KeyboardEvent } from 'react'
import type { SendShortcutMode } from '../settings/appPreferences'

export function shouldSubmitOnKeyDown(
  event: KeyboardEvent<HTMLTextAreaElement>,
  mode: SendShortcutMode
): boolean {
  if (event.nativeEvent.isComposing) {
    return false
  }
  if (mode === 'enter') {
    return event.key === 'Enter' && !event.shiftKey
  }
  return event.key === 'Enter' && (event.ctrlKey || event.metaKey)
}

export function sendShortcutHint(mode: SendShortcutMode): string {
  return mode === 'enter'
    ? 'Enter 发送，Shift+Enter 换行…'
    : 'Ctrl+Enter 发送，Enter 换行…'
}
