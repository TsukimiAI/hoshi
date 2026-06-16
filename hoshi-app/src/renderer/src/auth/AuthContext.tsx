import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import * as authApi from '../api/auth'
import * as userApi from '../api/user'
import type { UserProfile } from '../types/auth'
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  getStoredUser,
  saveSession
} from './authStorage'
import { setAuthHttpHandlers } from '../lib/http'

type AuthTab = 'login' | 'register' | 'forgot'

interface AuthContextValue {
  user: UserProfile | null
  loading: boolean
  loginOpen: boolean
  loginTab: AuthTab
  openLogin: (tab?: AuthTab, onSuccess?: () => void) => void
  switchLoginTab: (tab: AuthTab) => void
  closeLogin: () => void
  login: (usernameOrEmail: string, password: string) => Promise<void>
  register: (
    username: string,
    email: string,
    password: string,
    emailCode: string
  ) => Promise<string>
  logout: () => Promise<void>
  requireAuth: (action: () => void) => void
  refreshUser: () => Promise<void>
  updateProfile: (username: string) => Promise<void>
  uploadAvatar: (file: File) => Promise<void>
  deleteAvatar: () => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<string>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [user, setUser] = useState<UserProfile | null>(() => getStoredUser())
  const [loading, setLoading] = useState(true)
  const [loginOpen, setLoginOpen] = useState(false)
  const [loginTab, setLoginTab] = useState<AuthTab>('login')
  const pendingActionRef = useRef<(() => void) | null>(null)

  const applySession = useCallback((accessToken: string, refreshToken: string, profile: UserProfile) => {
    saveSession(accessToken, refreshToken, profile)
    setUser(profile)
  }, [])

  const tryRefreshSession = useCallback(async (): Promise<boolean> => {
    const refreshToken = getRefreshToken()
    if (!refreshToken) return false
    try {
      const res = await authApi.refresh(refreshToken)
      applySession(res.data.accessToken, res.data.refreshToken, res.data.user)
      return true
    } catch {
      return false
    }
  }, [applySession])

  const handleUnauthorized = useCallback(() => {
    clearSession()
    setUser(null)
    setLoginTab('login')
    setLoginOpen(true)
  }, [])

  useEffect(() => {
    setAuthHttpHandlers({
      tryRefreshSession,
      onUnauthorized: handleUnauthorized
    })
  }, [tryRefreshSession, handleUnauthorized])

  useEffect(() => {
    const token = getAccessToken()
    if (!token) {
      setLoading(false)
      return
    }

    authApi
      .fetchCurrentUser()
      .then((res) => {
        const refreshToken = getRefreshToken()
        if (refreshToken) {
          saveSession(token, refreshToken, res.data)
        }
        setUser(res.data)
      })
      .catch(async () => {
        const refreshed = await tryRefreshSession()
        if (!refreshed) {
          clearSession()
          setUser(null)
        }
      })
      .finally(() => setLoading(false))
  }, [tryRefreshSession])

  const runPendingAction = useCallback(() => {
    const action = pendingActionRef.current
    pendingActionRef.current = null
    action?.()
  }, [])

  const openLogin = useCallback((tab: AuthTab = 'login', onSuccess?: () => void) => {
    setLoginTab(tab)
    if (onSuccess) {
      pendingActionRef.current = onSuccess
    }
    setLoginOpen(true)
  }, [])

  const switchLoginTab = useCallback((tab: AuthTab) => {
    setLoginTab(tab)
  }, [])

  const closeLogin = useCallback(() => {
    setLoginOpen(false)
    setLoginTab('login')
    pendingActionRef.current = null
  }, [])

  const login = useCallback(
    async (usernameOrEmail: string, password: string) => {
      const res = await authApi.login(usernameOrEmail, password)
      applySession(res.data.accessToken, res.data.refreshToken, res.data.user)
      setLoginOpen(false)
      runPendingAction()
    },
    [applySession, runPendingAction]
  )

  const register = useCallback(
    async (username: string, email: string, password: string, emailCode: string) => {
      const res = await authApi.register(username, email, password, emailCode)
      return res.data.message
    },
    []
  )

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken()
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken)
      } catch {
        // ignore logout API errors
      }
    }
    clearSession()
    setUser(null)
  }, [])

  const refreshUser = useCallback(async () => {
    const res = await authApi.fetchCurrentUser()
    const token = getAccessToken()
    const refreshToken = getRefreshToken()
    if (token && refreshToken) {
      saveSession(token, refreshToken, res.data)
    }
    setUser(res.data)
  }, [])

  const updateProfile = useCallback(
    async (username: string) => {
      await userApi.updateProfile(username)
      const refreshed = await tryRefreshSession()
      if (!refreshed) {
        await refreshUser()
      }
    },
    [refreshUser, tryRefreshSession]
  )

  const uploadAvatar = useCallback(async (file: File) => {
    const res = await userApi.uploadAvatar(file)
    const token = getAccessToken()
    const refreshToken = getRefreshToken()
    if (token && refreshToken) {
      saveSession(token, refreshToken, res.data)
    }
    setUser(res.data)
  }, [])

  const deleteAvatar = useCallback(async () => {
    const res = await userApi.deleteAvatar()
    const token = getAccessToken()
    const refreshToken = getRefreshToken()
    if (token && refreshToken) {
      saveSession(token, refreshToken, res.data)
    }
    setUser(res.data)
  }, [])

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const res = await userApi.changePassword(currentPassword, newPassword)
    return res.data.message
  }, [])

  const requireAuth = useCallback(
    (action: () => void) => {
      if (user) {
        action()
        return
      }
      openLogin('login', action)
    },
    [openLogin, user]
  )

  const value = useMemo(
    () => ({
      user,
      loading,
      loginOpen,
      loginTab,
      openLogin,
      switchLoginTab,
      closeLogin,
      login,
      register,
      logout,
      requireAuth,
      refreshUser,
      updateProfile,
      uploadAvatar,
      deleteAvatar,
      changePassword
    }),
    [
      user,
      loading,
      loginOpen,
      loginTab,
      openLogin,
      switchLoginTab,
      closeLogin,
      login,
      register,
      logout,
      requireAuth,
      refreshUser,
      updateProfile,
      uploadAvatar,
      deleteAvatar,
      changePassword
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
