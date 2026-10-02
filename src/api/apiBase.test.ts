import { afterEach, describe, expect, it, vi } from 'vitest'
import { API_BASE_URL, CROSS_ORIGIN_WARNING, getAssets, resolveApiBase } from './fixedAssetApi'
import { login, me } from './authApi'
import { fetchLocations } from './locationApi'
import { ApiRelocationRequestRepository } from './relocationRequests'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('API base URL (same-origin session cookie)', () => {
  it('dev: always "" even when VITE_API_BASE_URL is set (the Vite proxy forwards /api)', () => {
    const warn = vi.fn()
    expect(resolveApiBase({ DEV: true, VITE_API_BASE_URL: 'http://192.168.122.16:9097' }, 'http://localhost:5173', warn)).toBe('')
    expect(warn).not.toHaveBeenCalled()
    // The module value in the test run (DEV) is relative too.
    expect(API_BASE_URL).toBe('')
  })

  it('build: "" by default; a same-origin base is used without warning', () => {
    const warn = vi.fn()
    expect(resolveApiBase({ DEV: false }, 'https://f2.example', warn)).toBe('')
    expect(resolveApiBase({ DEV: false, VITE_API_BASE_URL: '  ' }, 'https://f2.example', warn)).toBe('')
    expect(resolveApiBase({ DEV: false, VITE_API_BASE_URL: 'https://f2.example/' }, 'https://f2.example', warn)).toBe('https://f2.example')
    expect(warn).not.toHaveBeenCalled()
  })

  it('build: a base on another origin is kept but warns that the login cookie will not work', () => {
    const warn = vi.fn()
    expect(resolveApiBase({ DEV: false, VITE_API_BASE_URL: 'http://192.168.122.16:9097' }, 'https://f2.example', warn)).toBe('http://192.168.122.16:9097')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(CROSS_ORIGIN_WARNING)
  })

  it('every API call is relative (/api/...) and sends credentials: include', async () => {
    const fn = vi.fn(() => Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })))
    vi.stubGlobal('fetch', fn)
    await Promise.allSettled([getAssets(), login('a', 'b'), me(), fetchLocations(), new ApiRelocationRequestRepository().list()])
    expect(fn).toHaveBeenCalledTimes(5)
    for (const [url, init] of fn.mock.calls as unknown as [string, RequestInit][]) {
      expect(url.startsWith('/api/')).toBe(true)
      expect(init.credentials).toBe('include')
    }
  })
})
