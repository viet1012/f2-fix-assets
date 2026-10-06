// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAssets, onUnauthorized, uploadExcel, uploadFromUrl } from './fixedAssetApi'
import { fetchAssetLocation, fetchAssetsWithLocation, fetchLocations } from './locationApi'
import { ApiRelocationRequestRepository } from './relocationRequests'
import { login, logout, me } from './authApi'

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('/api requests send the session cookie', () => {
  it('every helper uses credentials: "include"', async () => {
    const fetchMock = vi.fn(() => json({ items: [], fileName: 'x.png', account: 'a' }))
    vi.stubGlobal('fetch', fetchMock)
    const repo = new ApiRelocationRequestRepository('')
    await Promise.allSettled([
      getAssets(),
      uploadExcel(new File(['x'], 'a.xlsx')),
      uploadFromUrl('https://x'),
      fetchLocations(),
      fetchAssetsWithLocation(),
      fetchAssetLocation('A-1'),
      repo.list(),
      repo.get('R0001'),
      repo.uploadDrawing('R0001', new Blob(['png'])),
      login('a', 'b'),
      me(),
      logout(),
    ])
    expect(fetchMock).toHaveBeenCalledTimes(12)
    for (const call of fetchMock.mock.calls as unknown as [string, RequestInit][]) expect(call[1].credentials).toBe('include')
  })

  it('a 401 from /api notifies the auth layer; GET /me 401 is just "not logged in"', async () => {
    const listener = vi.fn()
    const off = onUnauthorized(listener)
    vi.stubGlobal('fetch', vi.fn(() => json({ error: 'Unauthorized' }, 401)))
    await expect(getAssets()).rejects.toThrow('Unauthorized')
    await expect(new ApiRelocationRequestRepository('').list()).rejects.toMatchObject({ status: 401 })
    expect(listener).toHaveBeenCalledTimes(2)
    expect(await me()).toBeNull()
    await expect(login('a', 'b')).rejects.toMatchObject({ status: 401 })
    expect(listener).toHaveBeenCalledTimes(2)
    off()
  })
})
