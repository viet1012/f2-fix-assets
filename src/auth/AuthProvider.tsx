import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { login as apiLogin, logout as apiLogout, me, type CurrentUser } from '../api/authApi'
import { onUnauthorized } from '../api/fixedAssetApi'
import { clearLocationCache } from '../hooks/useLocations'
import { AuthContext, type AuthState, type AuthStatus } from './authContext'

/**
 * Session-cookie auth (no token in the browser): GET /api/auth/me on start; any 401 from /api drops back to the login
 * page. The password is only passed through to POST /api/auth/login, never kept.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking')
  const [user, setUser] = useState<CurrentUser | null>(null)
  const account = user?.account ?? null
  const [error, setError] = useState<string | null>(null)

  const signedOut = useCallback(() => {
    clearLocationCache()
    setUser(null)
    setStatus('anonymous')
  }, [])

  const check = useCallback(() => {
    let alive = true
    setStatus('checking')
    setError(null)
    me()
      .then((who) => {
        if (!alive) return
        if (who) {
          setUser(who)
          setStatus('authenticated')
        } else signedOut()
      })
      .catch((e: unknown) => {
        if (!alive) return
        setError(e instanceof Error ? e.message : String(e))
        signedOut()
      })
    return () => {
      alive = false
    }
  }, [signedOut])

  useEffect(() => check(), [check])
  useEffect(() => onUnauthorized(signedOut), [signedOut])

  const login = useCallback(async (name: string, password: string) => {
    const who = await apiLogin(name, password)
    setError(null)
    setUser(who)
    setStatus('authenticated')
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiLogout()
    } finally {
      signedOut()
    }
  }, [signedOut])

  const value = useMemo<AuthState>(() => ({ status, account, user, error, login, logout, recheck: () => void check() }), [status, account, user, error, login, logout, check])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
