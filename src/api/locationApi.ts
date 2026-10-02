import type { AssetLocation, AssetLocationFilters, LocationFilters, LocationZone } from '../types/location'
import { API_BASE_URL, apiFetch, readJson } from './fixedAssetApi'

function query(params: object) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.trim() !== '') search.set(key, value.trim())
  }
  const s = search.toString()
  return s ? `?${s}` : ''
}

export async function fetchLocations(filters: LocationFilters = {}): Promise<LocationZone[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/locations${query(filters)}`)
  return readJson<LocationZone[]>(response)
}

export async function fetchAssetsWithLocation(filters: AssetLocationFilters = {}): Promise<AssetLocation[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/assets/with-location${query(filters)}`)
  return readJson<AssetLocation[]>(response)
}

/** Rejects with the API's `error` message (e.g. 404 for an unknown code). */
export async function fetchAssetLocation(code: string): Promise<AssetLocation> {
  const response = await apiFetch(`${API_BASE_URL}/api/assets/${encodeURIComponent(code)}/location`)
  return readJson<AssetLocation>(response)
}
