import { OUTSIDE_FAC } from '../config/relocation'
import type { LayoutId } from '../data/mapData'
import type { LocationZone } from '../types/location'
import type { TrayZone } from './relocation'
import type { ZoneOption } from './relocationInput'
import { normalize } from './zone'

/** A destination zone from GET /api/locations, joined with the drawings by zone code. */
export interface CatalogZone {
  code: string
  /** Major zone (API positionA). */
  major: string
  isMajor: boolean
  /** API fac values of the zone (normally one). */
  facs: string[]
  /** The building when the zone has exactly one fac, else null. */
  fac: string | null
  /** Layout drawing the zone, else the one drawing its major zone; null when neither is drawn. */
  layoutId: LayoutId | null
  /** Has coordinates on a drawing. */
  drawn: boolean
  /** Major zone with sub-zones in the API: not a valid destination. */
  hasSubs: boolean
  /** Sum of assetCount over the merged MAP rows (majors include their sub-zones). */
  count: number
}

export interface LocationCatalog {
  /** Destination zones by code; Outside zones are excluded. */
  zones: ReadonlyMap<string, CatalogZone>
  /** Zone code -> assetCount, for labels. */
  count: ReadonlyMap<string, number>
  /** Zone code -> fac, only for zones with a single fac (building of a zone). */
  fac: ReadonlyMap<string, string>
  /** Zone codes whose fac is Outside. */
  outside: ReadonlySet<string>
}

export interface CatalogOption extends ZoneOption {
  drawn: boolean
  count: number
}

export const EMPTY_CATALOG: LocationCatalog = { zones: new Map(), count: new Map(), fac: new Map(), outside: new Set() }

export const isOutsideFac = (fac: string | null | undefined) => normalize(fac) === normalize(OUTSIDE_FAC)

/**
 * Only zones present in the API are destinations; drawings only add coordinates. MAP rows are merged by
 * (fac, positionA, positionAA) with assetCount summed; the row `floor`, aPos and aaPos are ignored (the floor is the
 * layout's, found through the zone index).
 */
export function buildLocationCatalog(locations: readonly LocationZone[], index: ReadonlyMap<string, LayoutId>): LocationCatalog {
  const rows = locations.filter((z) => z.positionA)
  const outside = new Set<string>()
  const merged = new Map<string, { fac: string; major: string; code: string; count: number }>()
  for (const z of rows) {
    const major = z.positionA!
    const code = z.positionAA ?? major
    const fac = (z.fac ?? '').trim()
    if (isOutsideFac(fac)) {
      outside.add(code)
      continue
    }
    const key = JSON.stringify([fac, major, z.positionAA ?? null])
    const prev = merged.get(key)
    if (prev) prev.count += z.assetCount
    else merged.set(key, { fac, major, code, count: z.assetCount })
  }

  const majorsWithSubs = new Set([...merged.values()].filter((m) => m.code !== m.major).map((m) => m.major))
  const zones = new Map<string, CatalogZone>()
  for (const m of merged.values()) {
    const zone = zones.get(m.code)
    if (zone) {
      if (m.fac && !zone.facs.includes(m.fac)) zone.facs.push(m.fac)
      zone.count += m.count
      continue
    }
    zones.set(m.code, {
      code: m.code,
      major: m.major,
      isMajor: m.code === m.major,
      facs: m.fac ? [m.fac] : [],
      fac: null,
      layoutId: index.get(m.code) ?? index.get(m.major) ?? null,
      drawn: index.has(m.code),
      hasSubs: m.code === m.major && majorsWithSubs.has(m.code),
      count: m.count,
    })
  }

  const count = new Map<string, number>()
  const fac = new Map<string, string>()
  for (const z of zones.values()) {
    z.fac = z.facs.length === 1 ? z.facs[0] : null
    count.set(z.code, z.count)
    if (z.fac) fac.set(z.code, z.fac)
  }
  return { zones, count, fac, outside }
}

const byCode = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })

/** Destination options of a layout (drawn and not drawn), optionally of one fac, grouped by major zone, major first. */
export function catalogOptions(catalog: LocationCatalog, layoutId: LayoutId, fac?: string): CatalogOption[] {
  return [...catalog.zones.values()]
    .filter((z) => z.layoutId === layoutId && (fac === undefined || z.facs.includes(fac)))
    .map((z) => ({ code: z.code, group: z.major, disabled: z.hasSubs, drawn: z.drawn, count: z.count }))
    .sort((a, b) => byCode(a.group, b.group) || Number(a.code !== a.group) - Number(b.code !== b.group) || byCode(a.code, b.code))
}

/** API zones of a layout without coordinates on it. */
export function catalogTray(catalog: LocationCatalog, layoutId: LayoutId): TrayZone[] {
  return [...catalog.zones.values()]
    .filter((z) => z.layoutId === layoutId && !z.drawn)
    .map((z) => ({ code: z.code, count: z.count }))
    .sort((a, b) => byCode(a.code, b.code))
}

/** API zones that cannot be tied to any layout (neither the zone nor its major is drawn). */
export function unplacedZones(catalog: LocationCatalog): string[] {
  return [...catalog.zones.values()].filter((z) => z.layoutId === null).map((z) => z.code).sort(byCode)
}

/** Whether a code may be the destination on this layout: in the API (not Outside), tied to the layout, not a major with sub-zones. */
export function isCatalogTarget(catalog: LocationCatalog, layoutId: LayoutId, code: string): boolean {
  const z = catalog.zones.get(code)
  return !!z && z.layoutId === layoutId && !z.hasSubs
}

/** Buildings (fac) with at least one zone tied to a layout (to `layoutId`, when given), sorted. */
export function catalogFacs(catalog: LocationCatalog, layoutId?: LayoutId): string[] {
  const zones = [...catalog.zones.values()].filter((z) => z.layoutId !== null && (layoutId === undefined || z.layoutId === layoutId))
  return [...new Set(zones.flatMap((z) => z.facs))].sort(byCode)
}

/** Layouts with at least one API zone (of `fac`, when given). */
export function catalogLayouts<L extends { id: LayoutId }>(catalog: LocationCatalog, layouts: readonly L[], fac?: string): L[] {
  const ids = new Set([...catalog.zones.values()].filter((z) => fac === undefined || z.facs.includes(fac)).map((z) => z.layoutId))
  return layouts.filter((l) => ids.has(l.id))
}

/** Asset at an Outside location: its matched MAP fac, else the fac of its current zone. */
export function isOutsideAsset(row: { mapFac?: string | null; currentZone: string | null }, catalog: LocationCatalog): boolean {
  if (row.mapFac) return isOutsideFac(row.mapFac)
  return !!row.currentZone && catalog.outside.has(row.currentZone) && !catalog.zones.has(row.currentZone)
}
