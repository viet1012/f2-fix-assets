import { FLOORS, ZONE_INDEX, type LayoutId } from '../data/mapData'
import type { FixedAsset } from '../types/fixedAsset'
import type { AssetLocation } from '../types/location'
import type { MoveType, RelocationTarget } from '../types/relocation'
import { normalize } from './zone'

/** Location fields from GET /api/assets/with-location; `position` is never split here. `mapFac` = building of the matched MAP row. */
export type RelocationRow = Pick<AssetLocation, 'currentZone' | 'positionA' | 'floor' | 'matchLevel'> & Partial<Pick<AssetLocation, 'mapFac'>>
type Row = RelocationRow

interface LayoutInfo {
  id: LayoutId
  dbFloor: string | null
  zones: readonly { code: string }[]
  areas?: readonly { code: string }[]
  subAreas?: readonly { code: string }[]
}

export interface RelocationContext {
  layouts: readonly LayoutInfo[]
  index: ReadonlyMap<string, LayoutId>
  /** Zone code -> building (API fac), e.g. LocationCatalog.fac. Empty = building unknown everywhere. */
  zoneFac: ReadonlyMap<string, string>
}

export const DEFAULT_CONTEXT: RelocationContext = { layouts: FLOORS, index: ZONE_INDEX, zoneFac: new Map() }

/** Building of an asset: its matched MAP fac, else the fac of its current zone, else of its major zone. */
export function rowFac(row: RelocationRow, ctx: RelocationContext = DEFAULT_CONTEXT): string | null {
  if (row.mapFac) return row.mapFac
  if (!row.currentZone) return null
  return ctx.zoneFac.get(row.currentZone) ?? (row.positionA ? ctx.zoneFac.get(row.positionA) : undefined) ?? null
}

/** Building of a destination zone (API fac); null when unknown. */
export function targetFac(target: RelocationTarget, ctx: RelocationContext = DEFAULT_CONTEXT): string | null {
  return ctx.zoneFac.get(target.zone) ?? null
}

/** Layout drawing the asset's current zone, else its major zone (API positionA); null when neither is drawn. */
export function rowLayoutId(row: Pick<AssetLocation, 'currentZone' | 'positionA'>, index: ReadonlyMap<string, LayoutId>): LayoutId | null {
  if (!row.currentZone) return null
  return index.get(row.currentZone) ?? (row.positionA ? index.get(row.positionA) : undefined) ?? null
}

/**
 * Compared by `currentZone`. Building (API fac) differs only when both sides are known.
 * Source floor comes from the layout of the asset's zone, falling back to its `floor` when the zone is not drawn.
 */
export function moveTypeOf(row: Row, target: RelocationTarget, ctx: RelocationContext = DEFAULT_CONTEXT): MoveType {
  if (row.currentZone === target.zone) return 'none'
  const to = ctx.layouts.find((l) => l.id === target.layoutId)
  const fromId = rowLayoutId(row, ctx.index)
  const from = fromId === null ? undefined : ctx.layouts.find((l) => l.id === fromId)
  const fromFac = rowFac(row, ctx)
  const toFac = targetFac(target, ctx)
  if (fromFac && toFac && fromFac !== toFac) return 'building'
  const fromFloor = from?.dbFloor ?? row.floor
  if (normalize(fromFloor) !== normalize(to?.dbFloor)) return 'floor'
  return 'same'
}

/** Rows that actually change location for the target. */
export function movers<R extends Row>(rows: readonly R[], target: RelocationTarget, ctx: RelocationContext = DEFAULT_CONTEXT): R[] {
  return rows.filter((r) => moveTypeOf(r, target, ctx) !== 'none')
}

/** layoutId (null when the zone is not drawn anywhere) -> currentZone ('' when empty) -> rows. */
export function groupByLayoutZone<R extends Row>(
  rows: readonly R[],
  ctx: RelocationContext = DEFAULT_CONTEXT,
): Map<LayoutId | null, Map<string, R[]>> {
  const groups = new Map<LayoutId | null, Map<string, R[]>>()
  for (const r of rows) {
    const layoutId = rowLayoutId(r, ctx.index)
    const zone = r.currentZone ?? ''
    const byZone = groups.get(layoutId) ?? new Map<string, R[]>()
    groups.set(layoutId, byZone)
    byZone.set(zone, [...(byZone.get(zone) ?? []), r])
  }
  return groups
}

export interface TrayZone {
  code: string
  count: number
}

/**
 * Zones of this layout's rows (via their major area) that cannot be placed on the drawing: not drawn, or the asset
 * has no MAP match (matchLevel NONE). Sorted by code.
 */
export function buildTray(layout: LayoutInfo, rows: readonly Row[], ctx: RelocationContext = DEFAULT_CONTEXT): TrayZone[] {
  const drawn = new Set([...layout.zones, ...(layout.areas ?? []), ...(layout.subAreas ?? [])].map((z) => z.code))
  const counts = new Map<string, number>()
  for (const r of rows) {
    const zone = r.currentZone
    if (!zone || (drawn.has(zone) && r.matchLevel !== 'NONE') || rowLayoutId(r, ctx.index) !== layout.id) continue
    counts.set(zone, (counts.get(zone) ?? 0) + 1)
  }
  return [...counts]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
}

/**
 * Asset types allowed to be relocated. The list must come from decisions.md (not in the repo yet), so the caller
 * passes it; comparison is case/whitespace-insensitive.
 */
export function eligibleForRelocation(row: Pick<FixedAsset, 'kind'>, allowedKinds: Iterable<string>): boolean {
  const kind = normalize(row.kind)
  if (!kind) return false
  for (const k of allowedKinds) if (normalize(k) === kind) return true
  return false
}

/** code -> row, and zone -> count (counted at the current zone and at its major area, once each). */
export function buildIndexes<R extends Pick<AssetLocation, 'code' | 'currentZone' | 'positionA'>>(rows: readonly R[]) {
  const byCode = new Map<string, R>()
  const zoneCount = new Map<string, number>()
  for (const r of rows) {
    byCode.set(r.code, r)
    const zone = r.currentZone
    if (!zone) continue
    for (const z of new Set([zone, r.positionA ?? zone])) zoneCount.set(z, (zoneCount.get(z) ?? 0) + 1)
  }
  return { byCode, zoneCount }
}
