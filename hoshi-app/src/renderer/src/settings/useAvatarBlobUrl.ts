import { useEffect, useState } from 'react'
import { getAccessToken } from '../auth/authStorage'
import { resolveUserAvatarContentUrl } from '../lib/avatarUrl'

export function useAvatarBlobUrl(options: {
  userId: number | 'me'
  avatarUrl: string | null
  enabled?: boolean
}): {
  src: string | null
  failed: boolean
} {
  const { userId, avatarUrl, enabled = true } = options
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!enabled || !avatarUrl) {
      setSrc(null)
      setFailed(false)
      return
    }

    let active = true

    void (async () => {
      try {
        const token = getAccessToken()
        const headers: Record<string, string> = {}
        if (token) {
          headers.Authorization = `Bearer ${token}`
        }

        const response = await fetch(resolveUserAvatarContentUrl(userId), { headers })
        if (!response.ok) {
          throw new Error(`avatar fetch failed: ${response.status}`)
        }

        const blob = await response.blob()
        if (!active) {
          return
        }

        const objectUrl = URL.createObjectURL(blob)
        setSrc((previous) => {
          if (previous) {
            URL.revokeObjectURL(previous)
          }
          return objectUrl
        })
        setFailed(false)
      } catch {
        if (active) {
          setSrc((previous) => {
            if (previous) {
              URL.revokeObjectURL(previous)
            }
            return null
          })
          setFailed(true)
        }
      }
    })()

    return () => {
      active = false
      setSrc((previous) => {
        if (previous) {
          URL.revokeObjectURL(previous)
        }
        return null
      })
    }
  }, [avatarUrl, enabled, userId])

  return { src, failed }
}
