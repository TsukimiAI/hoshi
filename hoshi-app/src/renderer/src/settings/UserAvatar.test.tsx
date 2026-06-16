import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UserAvatar } from '../settings/UserAvatar'

describe('UserAvatar', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders initial when avatarUrl is missing', () => {
    render(<UserAvatar user={{ username: '星奈', avatarUrl: null }} />)
    expect(screen.getByText('星')).toBeInTheDocument()
  })

  it('loads avatar through authenticated API and renders blob URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['avatar'], { type: 'image/png' })
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:avatar'),
      revokeObjectURL: vi.fn()
    })

    render(
      <UserAvatar user={{ username: '星奈', avatarUrl: 'http://localhost:9000/hoshi/avatars/1/a.png' }} />
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/users/me/avatar/content',
        expect.any(Object)
      )
    })

    await waitFor(() => {
      expect(document.querySelector('.user-avatar__photo')).toHaveAttribute('src', 'blob:avatar')
    })
  })
})
