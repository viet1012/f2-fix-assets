import { ALLOWED_KINDS } from '../config/relocation'
import { FLOORS, type LayoutId } from '../data/mapData'
import type { AssetLocation } from '../types/location'
import type { RelocationTarget } from '../types/relocation'
import { catalogOptions, type LocationCatalog } from '../utils/locationCatalog'
import { eligibleForRelocation, rowFac, rowLayoutId, type RelocationContext } from '../utils/relocation'
import { isMajorZone } from '../utils/relocationInput'
import { todayIso, type RelocationFormValues } from '../utils/relocationForm'

/** Building and floor the tour demo is taken from. */
export const DEMO_FAC = 'Fac_A'
export const DEMO_FLOOR = '1F'

/** Sample state shown by the relocation tour: picked from the loaded data, never saved. */
export interface RelocationDemo {
  fac: string
  layoutId: LayoutId
  /** Sub-zone both machines are in now. */
  sourceZone: string
  codes: readonly [string, string]
  /** Another sub-zone of the same layout, from GET /api/locations. */
  target: RelocationTarget
  form: RelocationFormValues
}

const byCode = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })

function plusDays(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return todayIso(d)
}

/**
 * Two eligible machines (allowed kind, not in an open request, not Outside) in one sub-zone of Building A / 1F, and
 * a different sub-zone of that layout as the destination. Null when the data has no such pair (annotation-only tour).
 */
export function pickRelocationDemo({ rows, pendingCodes, isOutside, ctx, catalog, vi }: {
  rows: readonly AssetLocation[]
  pendingCodes: ReadonlySet<string>
  isOutside: (row: AssetLocation) => boolean
  ctx: RelocationContext
  catalog: LocationCatalog
  vi: boolean
}): RelocationDemo | null {
  const floorOf = new Map(FLOORS.map((l) => [l.id, l.dbFloor ?? null]))
  const byZone = new Map<string, { layoutId: LayoutId; codes: string[] }>()
  for (const r of rows) {
    const zone = r.currentZone
    if (!zone || isMajorZone(zone)) continue
    if (!eligibleForRelocation(r, ALLOWED_KINDS) || pendingCodes.has(r.code) || isOutside(r)) continue
    if (rowFac(r, ctx) !== DEMO_FAC) continue
    const layoutId = rowLayoutId(r, ctx.index)
    if (!layoutId || floorOf.get(layoutId) !== DEMO_FLOOR) continue
    const g = byZone.get(zone) ?? { layoutId, codes: [] }
    g.codes.push(r.code)
    byZone.set(zone, g)
  }
  for (const [zone, g] of [...byZone].sort(([a], [b]) => byCode(a, b))) {
    if (g.codes.length < 2) continue
    const dest = catalogOptions(catalog, g.layoutId, DEMO_FAC).find((o) => !o.disabled && o.drawn && !isMajorZone(o.code) && o.code !== zone)
    if (!dest) continue
    const [a, b] = [...g.codes].sort(byCode)
    return {
      fac: DEMO_FAC,
      layoutId: g.layoutId,
      sourceZone: zone,
      codes: [a, b],
      target: { layoutId: g.layoutId, zone: dest.code },
      form: {
        plannedMoveDate: plusDays(1),
        plannedDoneDate: plusDays(3),
        reason: vi ? 'Ví dụ hướng dẫn: gom máy về một line' : 'Tour example: group machines into one line',
      },
    }
  }
  return null
}
