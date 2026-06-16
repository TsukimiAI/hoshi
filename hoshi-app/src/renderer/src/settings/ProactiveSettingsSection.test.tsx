import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as proactiveApi from '../api/proactivePreferences'
import { ProactiveSettingsSection } from './ProactiveSettingsSection'
import { ProactivePreferencesProvider } from './useProactivePreferences'

function renderSection(): ReturnType<typeof render> {
  return render(
    <ProactivePreferencesProvider>
      <ProactiveSettingsSection />
    </ProactivePreferencesProvider>
  )
}

describe('ProactiveSettingsSection', () => {
  const samplePreferences = {
    enabled: true,
    followUpEnabled: true
  }

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('loads and saves proactive toggle immediately', async () => {
    vi.spyOn(proactiveApi, 'fetchProactivePreferences').mockResolvedValue({
      code: 0,
      message: 'ok',
      data: samplePreferences
    })
    const updateSpy = vi.spyOn(proactiveApi, 'updateProactivePreferences').mockResolvedValue({
      code: 0,
      message: 'ok',
      data: { ...samplePreferences, enabled: false }
    })

    renderSection()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '主动对话' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('checkbox', { name: /开启主动对话/i }))

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith({ enabled: false })
    })
  })

  it('saves follow-up toggle immediately', async () => {
    vi.spyOn(proactiveApi, 'fetchProactivePreferences').mockResolvedValue({
      code: 0,
      message: 'ok',
      data: samplePreferences
    })
    const updateSpy = vi.spyOn(proactiveApi, 'updateProactivePreferences').mockResolvedValue({
      code: 0,
      message: 'ok',
      data: { ...samplePreferences, followUpEnabled: false }
    })

    renderSection()

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /允许追加对话/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('checkbox', { name: /允许追加对话/i }))

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith({ followUpEnabled: false })
    })
  })
})
