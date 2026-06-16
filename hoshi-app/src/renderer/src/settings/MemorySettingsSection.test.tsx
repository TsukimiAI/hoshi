import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryProvider } from '../memory/MemoryContext'
import { MemorySettingsSection } from './MemorySettingsSection'
import { AppPreferencesProvider } from './useAppPreferences'
import { SettingsProvider } from './SettingsContext'

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 1,
      username: 'tester',
      email: 'test@example.com',
      avatarUrl: null,
      emailVerified: true
    }
  })
}))

describe('MemorySettingsSection', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('saves memory toast preferences immediately', async () => {
    const user = userEvent.setup()
    const setPreferences = vi.spyOn(window.hoshi.app, 'setPreferences')

    render(
      <AppPreferencesProvider>
        <SettingsProvider>
          <MemoryProvider>
            <MemorySettingsSection />
          </MemoryProvider>
        </SettingsProvider>
      </AppPreferencesProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '记忆' })).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('提醒停留（毫秒）'), {
      target: { value: '4500' }
    })

    await waitFor(() => {
      expect(setPreferences).toHaveBeenCalledWith(
        expect.objectContaining({ memoryToastDwellMs: 4500 })
      )
    })

    await user.click(screen.getByRole('checkbox', { name: /记忆提醒气泡/i }))

    await waitFor(() => {
      expect(setPreferences).toHaveBeenCalledWith(
        expect.objectContaining({ memoryToastEnabled: false })
      )
    })

    expect(screen.queryByRole('button', { name: '保存' })).not.toBeInTheDocument()
  })
})
