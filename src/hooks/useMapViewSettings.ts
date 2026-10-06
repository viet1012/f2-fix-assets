import { useCallback, useState } from 'react'

export interface MapViewSettings {
  /** false = only zones involved in the move. */
  showAll: boolean
  showCounts: boolean
  /** Before and After maps share zoom and scroll. */
  syncZoom: boolean
}

export const DEFAULT_MAP_SETTINGS: MapViewSettings = { showAll: true, showCounts: true, syncZoom: true }
const STORAGE_KEY = 'f2.relocation.mapView'
/** Keys no longer used, dropped from the stored settings on read. */
const OBSOLETE_KEYS = ['image3d']

function read(): MapViewSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (!parsed || typeof parsed !== 'object') return DEFAULT_MAP_SETTINGS
    if (OBSOLETE_KEYS.some((k) => k in parsed)) {
      const rest = Object.fromEntries(Object.entries(parsed).filter(([k]) => !OBSOLETE_KEYS.includes(k)))
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rest))
    }
    const out = { ...DEFAULT_MAP_SETTINGS }
    for (const key of Object.keys(out) as (keyof MapViewSettings)[]) {
      const v = (parsed as Record<string, unknown>)[key]
      if (typeof v === 'boolean') out[key] = v
    }
    return out
  } catch {
    return DEFAULT_MAP_SETTINGS
  }
}

/** Relocation map toggles, remembered per browser (a convenience: falls back to defaults when storage is blocked). */
export function useMapViewSettings() {
  const [settings, setSettings] = useState<MapViewSettings>(read)
  const update = useCallback((patch: Partial<MapViewSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Not persisted; the choice still applies for this session.
      }
      return next
    })
  }, [])
  return [settings, update] as const
}
