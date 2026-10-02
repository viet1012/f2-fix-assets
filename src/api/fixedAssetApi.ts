import type { AssetsResponse, UploadResponse } from '../types/fixedAsset'

export const CROSS_ORIGIN_WARNING = 'API khác origin: cookie đăng nhập sẽ không hoạt động'

/**
 * Base URL of the BE. The session cookie only works same-origin, so:
 * - dev: always '' (relative /api, through the Vite proxy: VITE_PROXY_TARGET); VITE_API_BASE_URL is ignored;
 * - build: '' by default (same origin, reverse proxy /api -> BE); VITE_API_BASE_URL only when set, with a warning
 *   when it points to another origin than the page.
 */
export function resolveApiBase(
  env: { DEV?: boolean; VITE_API_BASE_URL?: string },
  pageOrigin: string | undefined = typeof window === 'undefined' ? undefined : window.location.origin,
  warn: (message: string) => void = (m) => console.warn(m),
): string {
  if (env.DEV) return ''
  const base = (env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')
  if (base && pageOrigin) {
    try {
      if (new URL(base, pageOrigin).origin !== pageOrigin) warn(CROSS_ORIGIN_WARNING)
    } catch {
      warn(CROSS_ORIGIN_WARNING)
    }
  }
  return base
}

/** Resolved once per page load (so the cross-origin warning is logged once). */
export const API_BASE_URL = resolveApiBase(import.meta.env)

/** Listeners told about any 401 from /api (not logged in / session expired): the app goes back to the login page. */
const unauthorizedListeners = new Set<() => void>()

export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener)
  return () => {
    unauthorizedListeners.delete(listener)
  }
}

export function notifyUnauthorized() {
  for (const listener of [...unauthorizedListeners]) listener()
}

/** fetch for /api: always sends the BE session cookie (no token). */
export function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, credentials: 'include' })
}

export async function readJson<T>(response: Response): Promise<T> {
  if (response.status === 401) notifyUnauthorized()
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message =
      typeof data?.error === 'string'
        ? data.error
        : `HTTP ${response.status}`

    throw new Error(message)
  }

  return data as T
}

export async function getAssets(): Promise<AssetsResponse> {
  const response = await apiFetch(`${API_BASE_URL}/api/assets`)
  return readJson<AssetsResponse>(response)
}

export async function uploadExcel(file: File): Promise<UploadResponse> {
  const body = new FormData()
  body.append('file', file)

  const response = await apiFetch(`${API_BASE_URL}/api/upload`, {
    method: 'POST',
    body,
  })

  return readJson<UploadResponse>(response)
}

export async function uploadFromUrl(url: string): Promise<UploadResponse> {
  const response = await apiFetch(`${API_BASE_URL}/api/upload-from-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
  })

  return readJson<UploadResponse>(response)
}