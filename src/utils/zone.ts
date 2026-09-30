import type { FixedAsset } from '../types/fixedAsset'

export function normalize(value?: string | null) {
  return (value ?? '').trim().toLowerCase()
}

/** `position` = PositionA PositionAA PositionAAA joined by spaces, e.g. "A2 A2-3" (parent, then child). */
export function posTokens(position?: string | null) {
  return (position ?? '').trim().split(/\s+/).filter(Boolean)
}

/** Hierarchical match used for counting: zone "A2" matches "A2 A2-3"; zone "A2-3" matches only its own token. */
export function matchesZone(row: Pick<FixedAsset, 'position'>, code: string) {
  return posTokens(row.position).some((token) => token === code || token.startsWith(`${code}-`))
}

/** DB floor value for a layout, taken from its title ("Floor 1 - Press" -> "1F"). */
export function layoutDbFloor(title: string): string | null {
  const m = /^Floor\s+(\d+)\b/i.exec(title)
  return m ? `${m[1]}F` : null
}

/** Fixes the malformed "A-15-3" / "A-15" form to "A15-3" / "A15". */
export function normalizeZoneCode(code: string): string {
  return code.trim().replace(/^([A-Za-z]+)-(?=\d)/, '$1')
}

/** Deepest zone of an asset (last `position` token), normalized; null when position is empty. */
export function currentZone(row: Pick<FixedAsset, 'position'>): string | null {
  const tokens = posTokens(row.position)
  return tokens.length ? normalizeZoneCode(tokens[tokens.length - 1]) : null
}

/** Major area of a zone: "A15-3" -> "A15", "A7" -> "A7". */
export function majorZone(zone: string): string {
  return normalizeZoneCode(zone).split('-')[0]
}

interface ZoneLayout {
  id: string
  zones: readonly { code: string }[]
  areas?: readonly { code: string }[]
  subAreas?: readonly { code: string }[]
}

/** Zone code -> layout id over markers, major areas and sub-areas. The first layout wins if a code repeats. */
export function buildZoneIndex<L extends ZoneLayout>(layouts: readonly L[]): Map<string, L['id']> {
  const index = new Map<string, L['id']>()
  for (const layout of layouts) {
    for (const item of [...layout.zones, ...(layout.areas ?? []), ...(layout.subAreas ?? [])]) {
      if (!index.has(item.code)) index.set(item.code, layout.id)
    }
  }
  return index
}

/** Like `matchesZone`, but normalizes malformed tokens first ("A-15 A-15-3" matches "A15" and "A15-3"). */
export function matchesZoneNormalized(row: Pick<FixedAsset, 'position'>, code: string) {
  return posTokens(row.position).some((raw) => {
    const token = normalizeZoneCode(raw)
    return token === code || token.startsWith(`${code}-`)
  })
}

/** Layout an asset belongs to by its zone: current zone first, then its major area; null if neither is drawn. */
export function assetLayoutId<Id>(row: Pick<FixedAsset, 'position'>, index: ReadonlyMap<string, Id>): Id | null {
  const zone = currentZone(row)
  if (!zone) return null
  return index.get(zone) ?? index.get(majorZone(zone)) ?? null
}

/**
 * Rows shown on a layout: those whose zone resolves to it (whatever their `floor` says), plus rows with no
 * resolvable zone whose `floor` equals the layout's `dbFloor`. `mismatched` = rows placed by zone whose (non-empty) floor differs.
 */
export function rowsForLayout<R extends Pick<FixedAsset, 'position' | 'floor'>, Id>(
  rows: readonly R[],
  layout: { id: Id; dbFloor: string | null },
  index: ReadonlyMap<string, Id>,
): { rows: R[]; mismatched: R[] } {
  const result: R[] = []
  const mismatched: R[] = []
  for (const r of rows) {
    const id = assetLayoutId(r, index)
    if (id === null) {
      if (!layout.dbFloor || normalize(r.floor) === normalize(layout.dbFloor)) result.push(r)
    } else if (id === layout.id) {
      result.push(r)
      if (layout.dbFloor && normalize(r.floor) && normalize(r.floor) !== normalize(layout.dbFloor)) mismatched.push(r)
    }
  }
  return { rows: result, mismatched }
}
