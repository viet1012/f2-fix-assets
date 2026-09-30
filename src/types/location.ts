/** Number when the MAP value is numeric, otherwise the original string. */
export type MapPos = number | string | null

export type MatchLevel = 'SUB' | 'MAJOR' | 'NONE'

/** One row of F2_FIXED_ASSET_MAP (GET /api/locations). */
export interface LocationZone {
  id: number
  fac: string | null
  div: string | null
  floor: string | null
  positionA: string | null
  positionAA: string | null
  aPos: MapPos
  aaPos: MapPos
  /** For a major zone this includes assets in its sub-zones. */
  assetCount: number
}

/** GET /api/assets/with-location and GET /api/assets/{code}/location. */
export interface AssetLocation {
  code: string
  name: string | null
  kind: string | null
  faType: string | null
  status: string | null
  div: string | null
  factory: string | null
  floor: string | null
  positionA: string | null
  positionAA: string | null
  currentZone: string | null
  mapId: number | null
  mapFac: string | null
  mapFloor: string | null
  aPos: MapPos
  aaPos: MapPos
  matchLevel: MatchLevel
  floorMismatch: boolean
}

export interface LocationFilters {
  fac?: string
  div?: string
  floor?: string
  assetFactory?: string
}

export interface AssetLocationFilters {
  factory?: string
  div?: string
}
