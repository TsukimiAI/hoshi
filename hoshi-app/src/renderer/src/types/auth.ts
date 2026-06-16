export interface UserProfile {
  id: number
  username: string
  email: string
  avatarUrl: string | null
  emailVerified: boolean
  createdAt?: string | null
  lastLoginAt?: string | null
}

export interface AuthSession {
  accessToken: string
  refreshToken: string
  tokenType: string
  expiresIn: number
  refreshExpiresIn: number
  user: UserProfile
}

export interface RegisterResult {
  userId: number
  email: string
  message: string
}
