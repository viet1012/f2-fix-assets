import { OPEN_RELOCATION_STATUSES } from '../config/relocation'
import type { FixedAsset } from '../types/fixedAsset'
import type { AssetLocation } from '../types/location'
import type { MoveType, RelocationItem, RelocationRequest, RelocationStatus, RelocationTarget } from '../types/relocation'
import { DEFAULT_CONTEXT, eligibleForRelocation, moveTypeOf, rowFac, targetFac, type RelocationContext, type RelocationRow } from './relocation'
import { majorZone } from './zone'

/** Splits pasted text on whitespace, commas and semicolons ("A-1, A-2;A-3\nA-4"). Order kept, empties dropped. */
export function parseCodes(text: string): string[] {
  return text.split(/[\s,;]+/).filter(Boolean)
}

export interface CodeCheck {
  accepted: string[]
  notFound: string[]
  /** Repeated in the input or already selected. */
  duplicate: string[]
  wrongKind: string[]
  /** Currently at an Outside location. */
  outside: string[]
  /** Already in a PENDING request. */
  pending: string[]
}

export function checkCodes<R extends Pick<FixedAsset, 'kind'>>(
  codes: readonly string[],
  opts: {
    byCode: ReadonlyMap<string, R>
    selected: readonly string[]
    allowedKinds: Iterable<string>
    pendingCodes: ReadonlySet<string>
    isOutside?: (row: R) => boolean
  },
): CodeCheck {
  const out: CodeCheck = { accepted: [], notFound: [], duplicate: [], wrongKind: [], outside: [], pending: [] }
  const seen = new Set(opts.selected)
  for (const code of codes) {
    const row = opts.byCode.get(code)
    if (!row) out.notFound.push(code)
    else if (seen.has(code)) out.duplicate.push(code)
    else if (!eligibleForRelocation(row, opts.allowedKinds)) out.wrongKind.push(code)
    else if (opts.isOutside?.(row)) out.outside.push(code)
    else if (opts.pendingCodes.has(code)) out.pending.push(code)
    else out.accepted.push(code)
    seen.add(code)
  }
  for (const key of ['notFound', 'duplicate', 'wrongKind', 'outside', 'pending'] as const) out[key] = [...new Set(out[key])]
  return out
}

/** Codes of every item of an open request (pending PE/BoD or approved); item status wins when the API gives one. */
export function pendingCodesOf(requests: readonly Pick<RelocationRequest, 'status' | 'items'>[]): Set<string> {
  const open = (s: RelocationStatus | null | undefined) => !!s && OPEN_RELOCATION_STATUSES.includes(s)
  return new Set(requests.flatMap((r) => r.items.filter((i) => open(i.status ?? r.status)).map((i) => i.code)))
}

type Row = RelocationRow & Pick<AssetLocation, 'code' | 'name'>

/** Items for the request; rows already at the target ("none") are not sent. */
export function buildRequestItems(rows: readonly Row[], target: RelocationTarget, ctx: RelocationContext = DEFAULT_CONTEXT): RelocationItem[] {
  return rows
    .map((r) => ({ code: r.code, name: r.name ?? '', fromZone: r.currentZone, fromFloor: r.floor, moveType: moveTypeOf(r, target, ctx) }))
    .filter((i) => i.moveType !== 'none')
}

export type MoveBadge = MoveType | 'unknownBuilding'

/** Summary badge: "unknownBuilding" when a moving row's building (API fac) is unknown on either side. */
export function moveBadgeOf(row: RelocationRow, target: RelocationTarget, ctx: RelocationContext = DEFAULT_CONTEXT): MoveBadge {
  const type = moveTypeOf(row, target, ctx)
  if (type === 'none') return type
  return rowFac(row, ctx) && targetFac(target, ctx) ? type : 'unknownBuilding'
}

/** "A15" is a major area, "A15-3" a sub-zone. */
export function isMajorZone(zone: string) {
  return !zone.includes('-')
}

type ZoneLayout = { zones: readonly { code: string }[]; areas?: readonly { code: string }[]; subAreas?: readonly { code: string }[] }

export interface ZoneOption {
  code: string
  group: string
  /** Major area that has sub-zones on this layout: not a valid destination. */
  disabled: boolean
}

const byCode = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })

/** Destination options of a layout: every drawn code, grouped by major area (major first), majors with sub-zones disabled. */
export function zoneOptions(layout: ZoneLayout): ZoneOption[] {
  const codes = [...new Set([...layout.zones, ...(layout.areas ?? []), ...(layout.subAreas ?? [])].map((z) => z.code))]
  const withSubs = new Set(codes.filter((c) => !isMajorZone(c)).map(majorZone))
  return codes
    .map((code) => ({ code, group: majorZone(code), disabled: isMajorZone(code) && withSubs.has(code) }))
    .sort((a, b) => byCode(a.group, b.group) || Number(!isMajorZone(a.code)) - Number(!isMajorZone(b.code)) || byCode(a.code, b.code))
}

/** Whether a code may be the destination (used for map clicks as well as the select). */
export function isPickableZone(layout: ZoneLayout, code: string) {
  return zoneOptions(layout).some((o) => o.code === code && !o.disabled)
}

export type BlockReason = 'pending' | 'wrongKind' | 'outside'

/** Why an asset cannot be selected (same order as checkCodes), or null when it can. */
export function blockReason<R extends Pick<FixedAsset, 'code' | 'kind'>>(
  row: R,
  opts: { allowedKinds: Iterable<string>; pendingCodes: ReadonlySet<string>; isOutside?: (row: R) => boolean },
): BlockReason | null {
  if (!eligibleForRelocation(row, opts.allowedKinds)) return 'wrongKind'
  if (opts.isOutside?.(row)) return 'outside'
  if (opts.pendingCodes.has(row.code)) return 'pending'
  return null
}

/** Assets in a zone: its own current zone, and for a major zone also its sub-zones (API positionA). */
export function rowsInZone<R extends Pick<RelocationRow, 'currentZone' | 'positionA'>>(rows: readonly R[], zone: string): R[] {
  return rows.filter((r) => r.currentZone === zone || (isMajorZone(zone) && r.positionA === zone))
}

/** Number of distinct current zones among the rows (rows without a zone count as one). */
export function zoneCountOf(rows: readonly Pick<RelocationRow, 'currentZone'>[]): number {
  return new Set(rows.map((r) => r.currentZone ?? '')).size
}

export interface SourceZone {
  code: string
  count: number
}

/** Where assets are now: building (fac, '' when unknown) -> current zones with their asset count, sorted by code. */
export function sourceZonesByFac(rows: readonly RelocationRow[], ctx: RelocationContext = DEFAULT_CONTEXT): Map<string, SourceZone[]> {
  const counts = new Map<string, Map<string, number>>()
  for (const r of rows) {
    if (!r.currentZone) continue
    const fac = rowFac(r, ctx) ?? ''
    const byZone = counts.get(fac) ?? new Map<string, number>()
    counts.set(fac, byZone)
    byZone.set(r.currentZone, (byZone.get(r.currentZone) ?? 0) + 1)
  }
  return new Map(
    [...counts]
      .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : byCode(a, b)))
      .map(([fac, byZone]) => [fac, [...byZone].map(([code, count]) => ({ code, count })).sort((a, b) => byCode(a.code, b.code))]),
  )
}
