import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchAssetsWithLocation, fetchLocations } from '../api/locationApi'
import { RELOCATION_FACTORY } from '../config/relocation'
import type { AssetLocation, LocationZone } from '../types/location'

export type LoadStatus = { type: 'loading' } | { type: 'ready' } | { type: 'error'; message: string }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** One in-flight/settled request per session; a failed request is dropped so the next call retries. */
function sessionCache<T>(load: () => Promise<T>) {
  let cached: Promise<T> | null = null
  return {
    get: () =>
      (cached ??= load().catch((error: unknown) => {
        cached = null
        throw error
      })),
    clear: () => {
      cached = null
    },
  }
}

const locationsCache = sessionCache(() => fetchLocations({ assetFactory: RELOCATION_FACTORY }))
const assetsCache = sessionCache(() => fetchAssetsWithLocation({ factory: RELOCATION_FACTORY }))

/** Drops the session caches (tests). */
export function clearLocationCache() {
  locationsCache.clear()
  assetsCache.clear()
}

function useSessionResource<T>(cache: ReturnType<typeof sessionCache<T[]>>) {
  const [data, setData] = useState<T[]>([])
  const [status, setStatus] = useState<LoadStatus>({ type: 'loading' })
  // Only the latest request may update state (reload while the first load is still running).
  const requestId = useRef(0)

  const load = useCallback(
    (fresh: boolean) => {
      if (fresh) cache.clear()
      const id = ++requestId.current
      setStatus({ type: 'loading' })
      cache.get().then(
        (next) => {
          if (id !== requestId.current) return
          setData(next)
          setStatus({ type: 'ready' })
        },
        (error: unknown) => {
          if (id !== requestId.current) return
          setStatus({ type: 'error', message: errorMessage(error) })
        },
      )
    },
    [cache],
  )

  useEffect(() => load(false), [load])
  const reload = useCallback(() => load(true), [load])

  return { data, status, reload }
}

/** F2_FIXED_ASSET_MAP zones; assetCount counts Factory 2 assets. Fetched once per session. */
export function useLocations() {
  return useSessionResource<LocationZone>(locationsCache)
}

/** Factory 2 assets with their matched location. Fetched once per session. */
export function useAssetsWithLocation() {
  return useSessionResource<AssetLocation>(assetsCache)
}
