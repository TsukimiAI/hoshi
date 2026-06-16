import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useWebSearchToggle } from './useWebSearchToggle'
import { DEFAULT_APP_PREFERENCES } from '../settings/appPreferences'

const updatePreferences = vi.fn()
let preferences = { ...DEFAULT_APP_PREFERENCES }

vi.mock('../settings/useAppPreferences', () => ({
  useAppPreferences: () => ({
    preferences,
    updatePreferences
  })
}))

describe('useWebSearchToggle', () => {
  it('locks and activates when defaultWebSearch is enabled', () => {
    preferences = { ...DEFAULT_APP_PREFERENCES, defaultWebSearch: true }

    const { result } = renderHook(() => useWebSearchToggle())

    expect(result.current.active).toBe(true)
    expect(result.current.locked).toBe(true)

    act(() => {
      result.current.toggle()
    })

    expect(result.current.active).toBe(true)
  })

  it('allows manual toggle when defaultWebSearch is disabled', () => {
    preferences = { ...DEFAULT_APP_PREFERENCES, defaultWebSearch: false }

    const { result } = renderHook(() => useWebSearchToggle())

    expect(result.current.active).toBe(false)
    expect(result.current.locked).toBe(false)

    act(() => {
      result.current.toggle()
    })

    expect(result.current.active).toBe(true)
  })
})
