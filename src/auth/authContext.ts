import { createContext, useContext } from 'react'
import type { CurrentUser } from '../api/authApi'

export type AuthStatus = 'checking' | 'anonymous' | 'authenticated'

export interface AuthState {
  status: AuthStatus
  /** Logged-in account (GET /api/auth/me); null unless authenticated. */
  account: string | null
  /** Logged-in user with name / dept / section; null unless authenticated. */
  user: CurrentUser | null
  /** Could not reach /api/auth/me (other than 401). */
  error: string | null
  /** Rejects with AuthError (status 401 = wrong account or password). */
  login: (account: string, password: string) => Promise<void>
  logout: () => Promise<void>
  /** Retries GET /api/auth/me. */
  recheck: () => void
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>')
  return auth
}

/** Logged-in user, or null outside <AuthProvider> / when signed out (components stay usable without the provider). */
export function useCurrentUser(): CurrentUser | null {
  return useContext(AuthContext)?.user ?? null
}
