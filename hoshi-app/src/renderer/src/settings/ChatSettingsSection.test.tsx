import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatSettingsSection } from './ChatSettingsSection'
import { AppPreferencesProvider } from './useAppPreferences'

describe('ChatSettingsSection', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('saves toggles immediately through app preferences IPC', async () => {
    const user = userEvent.setup()
    const setPreferences = vi.spyOn(window.hoshi.app, 'setPreferences')

    render(
      <AppPreferencesProvider>
        <ChatSettingsSection />
      </AppPreferencesProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '对话' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('checkbox', { name: /默认开启联网/i }))

    await waitFor(() => {
      expect(setPreferences).toHaveBeenCalledWith(
        expect.objectContaining({ defaultWebSearch: true })
      )
    })

    expect(screen.queryByRole('button', { name: '保存' })).not.toBeInTheDocument()
  })

  it('saves slider and select changes immediately', async () => {
    const setPreferences = vi.spyOn(window.hoshi.app, 'setPreferences')

    render(
      <AppPreferencesProvider>
        <ChatSettingsSection />
      </AppPreferencesProvider>
    )

    await waitFor(() => {
      expect(screen.getByLabelText('字与字间隔（毫秒）')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('字与字间隔（毫秒）'), {
      target: { value: '100' }
    })

    await waitFor(() => {
      expect(setPreferences).toHaveBeenCalledWith(
        expect.objectContaining({ sentencePlaybackCharDelayMs: 100 })
      )
    })

    fireEvent.change(screen.getByLabelText('发送快捷键'), {
      target: { value: 'ctrl-enter' }
    })

    await waitFor(() => {
      expect(setPreferences).toHaveBeenCalledWith(
        expect.objectContaining({ sendShortcut: 'ctrl-enter' })
      )
    })
  })
})
