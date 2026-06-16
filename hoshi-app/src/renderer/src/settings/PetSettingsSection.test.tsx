import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as proactiveApi from '../api/proactivePreferences'
import { PetSettingsSection } from './PetSettingsSection'
import { PetPreferencesProvider } from '../pet/usePetPreferences'
import { ProactivePreferencesProvider } from './useProactivePreferences'
import { ShellModeProvider } from '../shell/ShellModeContext'

function renderPetSettings(): ReturnType<typeof render> {
  return render(
    <ShellModeProvider>
      <PetPreferencesProvider>
        <ProactivePreferencesProvider>
          <PetSettingsSection />
        </ProactivePreferencesProvider>
      </PetPreferencesProvider>
    </ShellModeProvider>
  )
}

describe('PetSettingsSection', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    vi.spyOn(proactiveApi, 'fetchProactivePreferences').mockResolvedValue({
      code: 0,
      message: 'ok',
      data: {
        enabled: true,
        followUpEnabled: true
      }
    })
    vi.spyOn(proactiveApi, 'updateProactivePreferences').mockImplementation(async (patch) => ({
      code: 0,
      message: 'ok',
      data: {
        enabled: patch.enabled ?? true,
        followUpEnabled: patch.followUpEnabled ?? true
      }
    }))
  })

  it('saves pet preferences immediately when sliders change', async () => {
    const setPreferences = vi.spyOn(window.hoshi.pet, 'setPreferences')

    renderPetSettings()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '桌宠偏好' })).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('回复结束后停留（毫秒）'), {
      target: { value: '1500' }
    })

    await waitFor(() => {
      expect(setPreferences).toHaveBeenCalledWith(
        expect.objectContaining({ bubbleDwellMs: 1500 })
      )
    })

    expect(screen.queryByRole('button', { name: '保存偏好' })).not.toBeInTheDocument()
  })

  it('saves toggles and select changes immediately', async () => {
    const setPreferences = vi.spyOn(window.hoshi.pet, 'setPreferences')

    renderPetSettings()

    await waitFor(() => {
      expect(screen.getByLabelText('展开界面交互方式')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('checkbox', { name: /窗口置顶/i }))
    fireEvent.change(screen.getByLabelText('展开界面交互方式'), {
      target: { value: 'double-click' }
    })

    await waitFor(() => {
      expect(setPreferences).toHaveBeenCalledWith(
        expect.objectContaining({ alwaysOnTop: false })
      )
      expect(setPreferences).toHaveBeenCalledWith(
        expect.objectContaining({ panelOpenGesture: 'double-click' })
      )
    })
  })

  it('enters pet mode when return button is clicked', async () => {
    const setMode = vi.spyOn(window.hoshi.window, 'setMode')

    renderPetSettings()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '返回桌宠模式' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '返回桌宠模式' }))

    await waitFor(() => {
      expect(setMode).toHaveBeenCalledWith('pet')
    })
  })
})
