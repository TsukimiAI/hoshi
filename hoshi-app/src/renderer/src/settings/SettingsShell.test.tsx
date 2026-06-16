import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as proactiveApi from '../api/proactivePreferences'
import { MemoryProvider } from '../memory/MemoryContext'
import { PetPreferencesProvider } from '../pet/usePetPreferences'
import { ShellModeProvider } from '../shell/ShellModeContext'
import { AppPreferencesProvider } from './useAppPreferences'
import { ProactivePreferencesProvider } from './useProactivePreferences'
import { SettingsShell } from './SettingsShell'
import { SettingsProvider } from './SettingsContext'

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 1,
      username: 'tester',
      email: 'test@example.com',
      avatarUrl: null,
      emailVerified: true,
      createdAt: '2026-01-01T00:00:00Z',
      lastLoginAt: '2026-06-01T12:00:00Z'
    },
    updateProfile: vi.fn(),
    uploadAvatar: vi.fn(),
    deleteAvatar: vi.fn(),
    changePassword: vi.fn(),
    logout: vi.fn()
  })
}))

function renderSettingsShell(): ReturnType<typeof render> {
  return render(
    <ShellModeProvider>
      <AppPreferencesProvider>
        <PetPreferencesProvider>
          <ProactivePreferencesProvider>
            <SettingsProvider>
              <MemoryProvider>
                <SettingsShell />
              </MemoryProvider>
            </SettingsProvider>
          </ProactivePreferencesProvider>
        </PetPreferencesProvider>
      </AppPreferencesProvider>
    </ShellModeProvider>
  )
}

describe('SettingsShell', () => {
  beforeEach(() => {
    vi.spyOn(proactiveApi, 'fetchProactivePreferences').mockResolvedValue({
      code: 0,
      message: 'ok',
      data: {
        enabled: true,
        followUpEnabled: true
      }
    })
  })
  it('switches sections from the navigation', async () => {
    const user = userEvent.setup()
    renderSettingsShell()

    expect(screen.getByRole('heading', { name: '个人信息' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '账号与安全' }))
    expect(screen.getByRole('heading', { name: '账号与安全' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '桌宠' }))
    expect(screen.getByRole('heading', { name: '主动对话' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '桌宠偏好' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '对话' }))
    expect(screen.getByRole('heading', { name: '对话' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '保存' })).not.toBeInTheDocument()
  })
})
