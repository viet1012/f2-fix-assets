import type { Lang } from '../types/fixedAsset'
import { API_BASE_URL, apiFetch } from './fixedAssetApi'

/** Logged-in user (POST /api/auth/login, GET /api/auth/me); name/dept/section may be unknown. */
export interface CurrentUser {
  account: string
  name: string | null
  dept: string | null
  section: string | null
}

/** Person name for display; a placeholder when unknown. */
export function displayName(name: string | null | undefined, lang: Lang): string {
  return name?.trim() || (lang === 'vi' ? 'Không rõ tên' : 'Unknown name')
}

type ApiUser = { account?: string; name?: string | null; dept?: string | null; section?: string | null }
const userOf = (data: ApiUser, account: string): CurrentUser => ({
  account: data.account ?? account,
  name: data.name ?? null,
  dept: data.dept ?? null,
  section: data.section ?? null,
})

/** Login rejected (401) or another failure (status 0 = network). */
export class AuthError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

async function errorOf(response: Response) {
  const data = await response.json().catch(() => ({}))
  return new AuthError(response.status, typeof data?.error === 'string' ? data.error : `HTTP ${response.status}`)
}

/** POST /api/auth/login: the BE sets the session cookie; 401 = wrong account or password. */
export async function login(account: string, password: string): Promise<CurrentUser> {
  const response = await apiFetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, password }),
  })
  if (!response.ok) throw await errorOf(response)
  const data = (await response.json().catch(() => ({}))) as ApiUser
  return userOf(data, account)
}

/** GET /api/auth/me: the logged-in user, or null without a valid session (401). */
export async function me(): Promise<CurrentUser | null> {
  const response = await apiFetch(`${API_BASE_URL}/api/auth/me`)
  if (response.status === 401) return null
  if (!response.ok) throw await errorOf(response)
  const data = (await response.json()) as ApiUser
  return data.account ? userOf(data, data.account) : null
}

/** POST /api/auth/logout (204). */
export async function logout(): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST' })
  if (!response.ok && response.status !== 401) throw await errorOf(response)
}
