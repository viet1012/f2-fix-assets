import { alpha, Box, Stack, Typography, useTheme } from '@mui/material'
import { memo, useMemo, useState, type KeyboardEvent } from 'react'
import { facLabel } from '../../config/relocation'
import { FLOORS, type LayoutId, type MapArea } from '../../data/mapData'
import type { Lang } from '../../types/fixedAsset'
import type { AssetLocation } from '../../types/location'
import type { RelocationTarget } from '../../types/relocation'
import { tokens, zonePalette } from '../../theme/palette'
import { glassRadius, px } from '../../theme/liquidGlass'
import { buildIndexes, buildTray, DEFAULT_CONTEXT, groupByLayoutZone, movers, type RelocationContext, type RelocationRow, type TrayZone, rowFac, targetFac } from '../../utils/relocation'
import { majorZone } from '../../utils/zone'
import { MapScene, sceneRotation, uprightTransform, type MapView, type ScrollSyncGroup } from '../map/MapScene'

export interface RelocationLayout {
  id: LayoutId
  title: string
  imageData: string
  /** "3D look" drawing of the same size (scripts/make3dMaps.py); never used by the PNG export. */
  imageData3d?: string
  imgW: number
  imgH: number
  rotationDeg?: number
  dbFloor: string | null
  zones: readonly { code: string; x: number; y: number }[]
  areas: readonly MapArea[]
  subAreas: readonly MapArea[]
}

type Row = RelocationRow & Pick<AssetLocation, 'code'>
/**
 * from: selected machines are here (Before); to: destination; old: where movers leave (After); dim: unrelated while
 * machines are selected or a destination is set ("focus mode", still clickable); disabled: not in GET /api/locations;
 * idle: neutral.
 */
export type ZoneState = 'from' | 'to' | 'old' | 'dim' | 'disabled' | 'idle'

interface Props {
  lang: Lang
  layout: RelocationLayout
  role: 'before' | 'after'
  /** Selected assets. */
  rows: readonly Row[]
  target: RelocationTarget | null
  /** Only called on the After map. */
  onPickZone?: (target: RelocationTarget) => void
  /** Only called on the Before map: open the machine list of a zone (click / Enter / Space). */
  onOpenZone?: (zone: string) => void
  /** Zone whose machine list is open (Before map), marked aria-pressed. */
  openZone?: string | null
  /** Zone to flash, e.g. the zone of the row hovered in the selected-machines table. */
  highlightZone?: string | null
  /** Machines per zone for labels and aria-labels (e.g. LocationCatalog.count); defaults to the selected rows. */
  zoneCount?: ReadonlyMap<string, number>
  /** Whether a zone may be picked (e.g. it exists in GET /api/locations); zones rejected here are drawn disabled. */
  isPickable?: (code: string) => boolean
  /** More tray zones (destinations without coordinates), merged after the rows' own tray zones. */
  extraTray?: readonly TrayZone[]
  /** false = only zones involved in the move (from / to / old, their major areas and the open zone). */
  showAll?: boolean
  /** Machine count in the zone labels ("A6-1 · 26"). */
  showCounts?: boolean
  /** Show the "3D look" drawing (layout.imageData3d) instead of the original; ignored by exportMode. */
  use3d?: boolean
  /** Controlled zoom/scroll, e.g. shared with the other map. */
  view?: MapView
  onViewChange?: (view: MapView) => void
  /** Live scroll sync with the other map (no React state while scrolling). */
  scrollSync?: ScrollSyncGroup
  /** Frame aspect ratio; both maps use the same one so their frames are equal. */
  frameRatio?: string
  /** All layouts, used to describe a destination/source on another layout. */
  layouts?: readonly RelocationLayout[]
  ctx?: RelocationContext
  /**
   * Export mode (PNG of a request): a standalone <svg> of fixed scene width, without zoom toolbar, tray or
   * interaction; every style is inline and the drawing is the given (data URL) image, so it can be serialized.
   */
  exportMode?: { width: number; imageHref: string }
}

/** Font stack of the exported SVG (system fonts with Vietnamese glyphs as fallback). */
export const EXPORT_FONT = 'Inter, "Segoe UI", Roboto, "Noto Sans", "Helvetica Neue", Arial, sans-serif'

const MAP = tokens.light // The layout image is always white, in both theme modes.
/** Amber shared by from (Before) and old (After): base colour, dark ink / stroke, pale chip background. */
export const AMBER = { base: MAP.relocFrom, ink: '#92400e', paper: '#fef3c7' } as const
/**
 * Look of the maps. Focus mode (at least one machine selected, both maps): the drawing fades, unrelated zones keep
 * their major-area colour but go pale (still clickable on the After map, full opacity on hover), major areas holding a
 * related zone stay solid, and from / old / to stand out in amber / white / green.
 */
export const FOCUS = {
  /** Layout image opacity (always grayscale): no machine selected / focus mode. */
  image: { idle: 0.6, focus: 0.5 },
  /** The 3D drawing is already light (slate on #f8fafc): one opacity, idle and focus. */
  image3d: 0.85,
  /** Normal zone fill; majors with sub-zones stay lighter so their sub-zones do not get a double tint. */
  zoneFill: 0.14,
  /** Normal zone fill over the (already tinted) 3D drawing; from / to / old keep their own fills. */
  zoneFill3d: 0.08,
  majorFill: 0.05,
  dim: { fill: 0.06, strokeWidth: 1, strokeOpacity: 0.45, chipOpacity: 0.6, majorChipOpacity: 0.55 },
  parent: { strokeWidth: 2 },
  from: { color: AMBER.base, fill: 0.6, stroke: AMBER.ink, strokeWidth: 2.5, pinBorder: 3 },
  /** Old zone: pale amber fill, dashed amber stroke; chip "A-341 (cũ)" pale amber with dark ink; hollow pin. */
  old: { color: AMBER.base, fill: 0.25, stroke: AMBER.base, strokeWidth: 2, dash: '6 4', chipBg: AMBER.paper, chipInk: AMBER.ink, pinBorder: 2.5 },
  to: { color: MAP.relocTo, fill: 0.75, stroke: '#065f46', strokeWidth: 2.5 },
  arrow: { strokeWidth: 2.5, dash: '8 6' },
  /** Tries per pin caption to get out of an overlap ("(cũ)" chips: up/down, left, right). */
  labelTries: 4,
  transitionMs: 200,
} as const
const FROM = FOCUS.from.color
const TO = FOCUS.to.color
const CROSS = MAP.relocCross
/** Major areas without sub-zones (A7-A11...): neutral slate stroke and chip. */
export const SLATE = '#64748b'
const TRANSITION = ['opacity', 'fill', 'fill-opacity', 'stroke', 'stroke-opacity', 'stroke-width'].map((p) => `${p} ${FOCUS.transitionMs}ms`).join(', ')
/** Distance (px) between a pin dot and its caption above; inset of edge pills from the map edge. */
const PIN_GAP = 9
const EDGE_INSET = 8
const REDUCED_MOTION = '@media (prefers-reduced-motion: reduce)'
/** States that are part of the move: drawn on top, with halo and solid chip. */
const RELATED: ReadonlySet<ZoneState> = new Set<ZoneState>(['from', 'to', 'old'])
/** Arrowhead length and the gap kept before the target pin, in image pixels. */
const HEAD = 12
const GAP = 10
/** Sub-zone labels are hidden below this rendered size (px). */
const MIN_LABEL_W = 44
/** Horizontal padding (px) of zone chips and pin captions; used both in the styles and when measuring. */
const CHIP_PAD_X = 4
const PIN_PAD_X = 6
const MIN_LABEL_H = 20

interface Box4 {
  x: number
  y: number
  w: number
  h: number
}

function center(area: MapArea) {
  const n = area.points.length
  return { x: area.points.reduce((s, p) => s + p.x, 0) / n, y: area.points.reduce((s, p) => s + p.y, 0) / n }
}

function bbox(area: MapArea): Box4 {
  const xs = area.points.map((p) => p.x)
  const ys = area.points.map((p) => p.y)
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}

/**
 * Corners of a box (in scene %) that appear top-left and bottom-right on screen once the scene is rotated clockwise
 * by `rotation`, so labels stay in the same visual corner on the rotated Mold layout.
 */
function visualCorners(b: Box4, rotation: number, imgW: number, imgH: number) {
  const rad = (rotation * Math.PI) / 180
  const corners = [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x, y: b.y + b.h },
    { x: b.x + b.w, y: b.y + b.h },
  ]
  const score = (p: { x: number; y: number }) => {
    const x = p.x * imgW
    const y = p.y * imgH
    return x * Math.cos(rad) - y * Math.sin(rad) + (x * Math.sin(rad) + y * Math.cos(rad))
  }
  const sorted = [...corners].sort((a, b2) => score(a) - score(b2))
  return { tl: sorted[0], br: sorted[3] }
}

export interface LabelBox {
  id: string
  /** tab: chip of a related zone (fixed); pin: pin caption (pushed down); major: major-area label (pushed up, else hidden). */
  kind: 'tab' | 'pin' | 'major'
  /** Desired top-left and size in on-screen px. A tab's desired y is just above its zone's top edge. */
  x: number
  y: number
  w: number
  h: number
  /** tab: top edge of its zone, where it flips inside when there is no room above. */
  zoneTop?: number
  /** Push direction on overlap: 1 = down, -1 = up. Default: pins down, majors up. */
  dir?: 1 | -1
  /** Pin caption that may also move sideways: tries `dir`, left, right, then the opposite of `dir`. */
  spread?: boolean
}

export interface PlacedLabel {
  x: number
  y: number
  /** tab: flipped inside the zone because it would leave the image. */
  flipped: boolean
  /** Number of pushes applied to resolve an overlap. */
  shifts: number
  hidden: boolean
}

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/**
 * Places label boxes (on-screen px) inside `bounds` without overlaps, by bbox collision. Tabs are placed first and
 * never move (flipped inside their zone when above the image edge); pin captions are pushed down (or up, `dir: -1`),
 * major labels pushed up, at most `maxTries` times each (leaving the image counts as a collision). `spread` captions
 * also try left / right. A major label that is still blocked is hidden; a pin caption keeps its last position (a
 * `spread` one goes back to where it was asked).
 */
export function layoutLabels(boxes: readonly LabelBox[], bounds: { w: number; h: number }, gap = 2, maxTries = 3): Map<string, PlacedLabel> {
  const out = new Map<string, PlacedLabel>()
  const placed: { x: number; y: number; w: number; h: number }[] = []
  const clampX = (b: LabelBox) => Math.max(0, Math.min(b.x, bounds.w - b.w))
  const order = { tab: 0, pin: 1, major: 2 } as const
  for (const b of [...boxes].sort((a, c) => order[a.kind] - order[c.kind])) {
    const x = clampX(b)
    if (b.kind === 'tab') {
      const flipped = b.y < 0
      const y = flipped ? (b.zoneTop ?? 0) + gap : b.y
      placed.push({ x, y, w: b.w, h: b.h })
      out.set(b.id, { x, y, flipped, shifts: 0, hidden: false })
      continue
    }
    const dir = b.dir ?? (b.kind === 'pin' ? 1 : -1)
    // Leaving the image counts as a collision too.
    const blocked = (p: { x: number; y: number }) =>
      p.x < 0 || p.x + b.w > bounds.w || p.y < 0 || p.y + b.h > bounds.h || placed.some((o) => overlaps({ ...p, w: b.w, h: b.h }, o))
    const moves = [[0, dir], [-1, 0], [1, 0], [0, -dir]] as const
    const tryAt = (k: number) => {
      if (!b.spread) return { x, y: b.y + dir * k * (b.h + gap) }
      const [mx, my] = moves[(k - 1) % moves.length]
      const n = Math.ceil(k / moves.length)
      return { x: x + mx * n * (b.w + gap), y: b.y + my * n * (b.h + gap) }
    }
    let shifts = 0
    let pos = { x, y: b.y }
    while (blocked(pos) && shifts < maxTries) {
      shifts += 1
      pos = tryAt(shifts)
    }
    const clash = blocked(pos)
    if (clash && b.spread) pos = { x, y: b.y }
    const hidden = b.kind === 'major' && clash
    if (!hidden) placed.push({ ...pos, w: b.w, h: b.h })
    out.set(b.id, { ...pos, flipped: false, shifts, hidden })
  }
  return out
}

const textWidthCache = new Map<string, number>()
let measureCtx: CanvasRenderingContext2D | null | undefined

/** Rendered text width in px, measured with a canvas and cached per font + text. */
export function measureTextWidth(text: string, font: string): number {
  const key = `${font}|${text}`
  const cached = textWidthCache.get(key)
  if (cached !== undefined) return cached
  if (measureCtx === undefined) measureCtx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  if (!measureCtx) return 0 // No canvas (non-browser): nothing to measure; no cache so a later call can measure.
  measureCtx.font = font
  const width = measureCtx.measureText(text).width
  textWidthCache.set(key, width)
  return width
}

/** Drops the measurement cache and canvas (tests). */
export function resetTextMeasure() {
  textWidthCache.clear()
  measureCtx = undefined
}

/** Size of a one-line chip: measured text + horizontal padding and borders; height from the line height. */
function chipSize(text: string, fontSize: number, fontWeight: number, fontFamily: string, padX: number, lineHeight = fontSize * 1.35, borderY = 2) {
  const w = measureTextWidth(text, `${fontWeight} ${fontSize}px ${fontFamily}`)
  return { w: Math.ceil(w + padX * 2 + 2), h: Math.ceil(lineHeight + borderY) }
}

/** Scene % -> on-screen px inside the visual (rotated) bounding box of a W x H scene. */
function visualMapper(W: number, H: number, rotation: number) {
  const rad = (rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const vw = Math.abs(W * cos) + Math.abs(H * sin)
  const vh = Math.abs(W * sin) + Math.abs(H * cos)
  const map = (p: { x: number; y: number }) => {
    const x = (p.x / 100) * W - W / 2
    const y = (p.y / 100) * H - H / 2
    return { x: x * cos - y * sin + vw / 2, y: x * sin + y * cos + vh / 2 }
  }
  const box = (b: Box4) => {
    const pts = [map({ x: b.x, y: b.y }), map({ x: b.x + b.w, y: b.y }), map({ x: b.x, y: b.y + b.h }), map({ x: b.x + b.w, y: b.y + b.h })]
    const xs = pts.map((q) => q.x)
    const ys = pts.map((q) => q.y)
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
  }
  /** On-screen px -> scene %. */
  const unmap = (v: { x: number; y: number }) => {
    const x = v.x - vw / 2
    const y = v.y - vh / 2
    return { x: ((x * cos + y * sin + W / 2) / W) * 100, y: ((-x * sin + y * cos + H / 2) / H) * 100 }
  }
  return { map, unmap, box, bounds: { w: vw, h: vh } }
}

/** "A-006-1 +2": first machine code plus the number of others. */
function pinLabel(rows: readonly Row[]) {
  return rows.length > 1 ? `${rows[0].code} +${rows.length - 1}` : rows[0]?.code ?? ''
}

/** Building label of the API fac ("Toà B", "Kho"), or the layout name when the fac is unknown ("Warehouse (WH)"). */
function placeName(layout: RelocationLayout, fac: string | null, vi: boolean) {
  if (fac) return facLabel(fac, vi)
  return layout.title.split(' - ').pop() ?? layout.title
}

/** Control-point offset of same-layout arrows (share of their length): live map / export (flatter, lift <= 15%). */
export const ARROW_BOW = { live: 0.22, export: 0.12 } as const

/**
 * Curved arrow (quadratic, bowed to the left of travel) from a to b, in the 0-100 viewBox. Geometry is computed in
 * image pixels so the curve and head keep their shape although the viewBox is stretched to the image aspect ratio.
 * `downward`: bow towards the bottom of the drawing instead (export: the arrow does not loop up over other zones).
 */
function arrowGeometry(a: { x: number; y: number }, b: { x: number; y: number }, imgW: number, imgH: number, bow: number = ARROW_BOW.live, downward = false) {
  const toPx = (p: { x: number; y: number }) => ({ x: (p.x * imgW) / 100, y: (p.y * imgH) / 100 })
  const toPct = (p: { x: number; y: number }) => `${((p.x / imgW) * 100).toFixed(3)},${((p.y / imgH) * 100).toFixed(3)}`
  const p0 = toPx(a)
  const p2 = toPx(b)
  const dx = p2.x - p0.x
  const dy = p2.y - p0.y
  const len = Math.hypot(dx, dy) || 1
  const flip = downward && -dx / len < 0 ? -1 : 1
  const c = { x: (p0.x + p2.x) / 2 + flip * dy * bow, y: (p0.y + p2.y) / 2 - flip * dx * bow }
  const tx = p2.x - c.x
  const ty = p2.y - c.y
  const tl = Math.hypot(tx, ty) || 1
  const ux = tx / tl
  const uy = ty / tl
  const tip = { x: p2.x - ux * GAP, y: p2.y - uy * GAP }
  const base = { x: tip.x - ux * HEAD, y: tip.y - uy * HEAD }
  const half = HEAD * 0.55
  return {
    d: `M${toPct(p0)} Q${toPct(c)} ${toPct(base)}`,
    head: [tip, { x: base.x - uy * half, y: base.y + ux * half }, { x: base.x + uy * half, y: base.y - ux * half }].map(toPct).join(' '),
  }
}

interface Shape {
  code: string
  major: boolean
  color: string
  /** Polygon points (majors) or rect (sub-zones), in the 0-100 viewBox. */
  points?: string
  rect?: Box4
  box: Box4
  corners: ReturnType<typeof visualCorners>
}

interface Pin {
  code: string
  kind: 'from' | 'to' | 'old'
  label: string
}

interface Arrow {
  key: string
  /** From another layout (purple) instead of an old zone on this one (green). */
  cross: boolean
  d: string
  head: string
}

interface CrossPill {
  key: string
  text: string
  /** Scene % point on the visual left edge. */
  anchor: { x: number; y: number }
  box: { x: number; y: number; w: number; h: number }
}

/** Static per-layout geometry: shapes, colours, label corners and zone centres. */
function useLayoutGeometry(layout: RelocationLayout) {
  return useMemo(() => {
    const rotation = sceneRotation(layout.rotationDeg)
    const majorsWithSubs = new Set(layout.subAreas.map((sa) => majorZone(sa.code)))
    let next = 0
    const colorOf = new Map(layout.areas.map((a) => [a.code, majorsWithSubs.has(a.code) ? zonePalette[next++ % zonePalette.length] : SLATE]))
    const shape = (area: MapArea, major: boolean): Shape => {
      const box = bbox(area)
      return {
        code: area.code,
        major,
        color: (major ? colorOf.get(area.code) : colorOf.get(majorZone(area.code))) ?? SLATE,
        ...(major ? { points: area.points.map((p) => `${p.x},${p.y}`).join(' ') } : { rect: box }),
        box,
        corners: visualCorners(box, rotation, layout.imgW, layout.imgH),
      }
    }
    const shapes = [...layout.areas.map((a) => shape(a, true)), ...layout.subAreas.map((a) => shape(a, false))]
    const centers = new Map<string, { x: number; y: number }>([
      ...layout.zones.map((z) => [z.code, { x: z.x, y: z.y }] as const),
      ...layout.areas.map((a) => [a.code, center(a)] as const),
      ...layout.subAreas.map((a) => [a.code, center(a)] as const),
    ])
    return { shapes, centers, majorsWithSubs, colorOf }
  }, [layout])
}

function RelocationFloorMapImpl({
  lang,
  layout,
  role,
  rows,
  target,
  onPickZone,
  onOpenZone,
  openZone = null,
  highlightZone = null,
  zoneCount,
  isPickable,
  extraTray = [],
  showAll = true,
  showCounts = true,
  use3d = false,
  view,
  onViewChange,
  scrollSync,
  frameRatio = '16 / 10',
  layouts = FLOORS,
  ctx = DEFAULT_CONTEXT,
  exportMode,
}: Props) {
  // The export is always in English.
  const vi = lang === 'vi' && !exportMode
  const theme = useTheme()
  const upright = uprightTransform(layout.rotationDeg)
  const interactive = role === 'after' ? onPickZone !== undefined : onOpenZone !== undefined
  const { shapes, centers, majorsWithSubs, colorOf } = useLayoutGeometry(layout)
  const [measuredW, setSceneW] = useState(0)
  const sceneW = exportMode?.width ?? measuredW
  /** Pickable zone under the pointer: its faded chip goes back to full opacity. */
  const [hovered, setHovered] = useState<string | null>(null)

  const groups = useMemo(() => groupByLayoutZone(rows, ctx), [rows, ctx])
  const here = groups.get(layout.id) ?? new Map<string, Row[]>()
  // Assets without a MAP match (matchLevel NONE) are only shown in the tray, never on a drawn zone.
  const placed = new Map([...here].map(([zone, rs]) => [zone, rs.filter((r) => r.matchLevel !== 'NONE')] as const).filter(([, rs]) => rs.length))
  const toZone = target?.layoutId === layout.id ? target.zone : null
  const counts = zoneCount ?? buildIndexes(rows).zoneCount
  const rowTray = buildTray(layout, rows, ctx)
  const tray = [...rowTray, ...extraTray.filter((t) => !rowTray.some((r) => r.code === t.code))]

  const hasSubs = (code: string) => majorsWithSubs.has(code) && majorZone(code) === code
  /** Rejected by isPickable (not in the API); majors with sub-zones are not "disabled", their sub-zones are the targets. */
  const isDisabled = (code: string) => interactive && isPickable !== undefined && !hasSubs(code) && !isPickable(code)
  const canPick = (code: string) => interactive && !hasSubs(code) && !isDisabled(code)

  // Focus mode: once machines are selected, everything not involved in the move recedes (both maps).
  const focus = rows.length > 0
  const stateOf = (code: string, at: ReadonlyMap<string, readonly Row[]> = placed): ZoneState => {
    if (role === 'before') return at.has(code) ? 'from' : isDisabled(code) ? 'disabled' : focus ? 'dim' : 'idle'
    if (code === toZone) return 'to'
    if (at.has(code)) return 'old'
    if (isDisabled(code)) return 'disabled'
    return toZone || focus ? 'dim' : 'idle'
  }
  const countText = (n: number) => `${n} ${vi ? 'máy' : n === 1 ? 'machine' : 'machines'}`
  const ariaLabel = (code: string, state: ZoneState) => {
    const suffix = state === 'to' ? (vi ? ' (đích)' : ' (destination)') : state === 'old' || state === 'from' ? (vi ? ' (vị trí hiện tại)' : ' (current location)') : ''
    return `${code}: ${countText(counts.get(code) ?? 0)}${suffix}`
  }
  const actionOf = (code: string, state: ZoneState) => {
    if (state === 'disabled') return vi ? 'Không có trong danh mục vị trí (API), không chọn được' : 'Not in the location list (API), cannot be picked'
    if (interactive && hasSubs(code)) return vi ? 'Chọn một khu con' : 'Pick a sub-zone'
    if (canPick(code)) {
      if (role === 'before') return vi ? 'Click để xem máy trong zone' : 'Click to list the machines in this zone'
      return state === 'to' ? (vi ? 'Đích đã chọn' : 'Selected destination') : vi ? 'Click để chọn làm đích' : 'Click to set as destination'
    }
    if (state === 'from' || state === 'old') return vi ? 'Vị trí hiện tại của máy đã chọn' : 'Current location of the selected machines'
    return ''
  }
  const tooltip = (code: string, state: ZoneState) => {
    const n = countText(counts.get(code) ?? 0)
    // A major area's count already includes its sub-zones (API assetCount).
    const total = hasSubs(code) ? `${n} (${vi ? 'gồm khu con' : 'incl. sub-zones'})` : n
    return [code, total, actionOf(code, state)].filter(Boolean).join(' · ')
  }

  const pick = (zone: string) => (role === 'after' ? onPickZone?.({ layoutId: layout.id, zone }) : onOpenZone?.(zone))
  const pressed = (code: string, state: ZoneState) => (role === 'after' ? state === 'to' : code === openZone)
  const pickProps = (code: string, state: ZoneState) => ({
    role: 'button',
    tabIndex: 0,
    'aria-label': ariaLabel(code, state),
    'aria-pressed': pressed(code, state),
    onClick: () => pick(code),
    onMouseEnter: () => setHovered(code),
    onMouseLeave: () => setHovered((h) => (h === code ? null : h)),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        pick(code)
      }
    },
  })

  // Related = part of the move (from / to / old) or flashed; parents = major areas holding a related sub-zone.
  const states = new Map(shapes.map((s) => [s.code, stateOf(s.code)] as const))
  const isRelated = (code: string) => RELATED.has(states.get(code)!) || code === highlightZone
  const related = new Set(shapes.filter((s) => isRelated(s.code)).map((s) => s.code))
  const parents = new Set([...related].map(majorZone).filter((m) => !related.has(m)))
  // Zones drawn: all, or only those involved in the move (plus their major areas and the open zone).
  const visible = showAll ? shapes : shapes.filter((s) => related.has(s.code) || parents.has(s.code) || s.code === openZone)
  // Paint order: plain sub-zones, then major areas, then related zones (majors first) on top.
  const layers = [
    visible.filter((s) => !s.major && !related.has(s.code)),
    visible.filter((s) => s.major && !related.has(s.code)),
    visible.filter((s) => s.major && related.has(s.code)),
    visible.filter((s) => !s.major && related.has(s.code)),
  ]

  // Pins. Before: every source zone ("A-012-K +N"). After: destination (machine code, or "N máy") and old zones.
  const moving = target ? movers(rows, target, ctx) : []
  const toRows = moving.length ? moving : rows
  const pins: Pin[] =
    role === 'before'
      ? [...placed].filter(([zone]) => centers.has(zone)).map(([zone, rs]) => ({ code: zone, kind: 'from', label: pinLabel(rs) }))
      : [
          ...(toZone && centers.has(toZone) && toRows.length ? [{ code: toZone, kind: 'to' as const, label: toRows.length === 1 ? toRows[0].code : countText(toRows.length) }] : []),
          ...[...placed]
            .filter(([zone]) => zone !== toZone && centers.has(zone))
            .map(([zone, rs]) => ({ code: zone, kind: 'old' as const, label: `${pinLabel(rs)} (${vi ? 'cũ' : 'old'})` })),
        ]

  // Same-layout arrows (After): green, dashed, curved, from each old zone to the destination.
  const toCenter = role === 'after' && toZone ? centers.get(toZone) : undefined
  const arrows: Arrow[] = toCenter
    ? [...placed.keys()]
        .filter((zone) => zone !== toZone && centers.has(zone))
        .map((zone) => ({
          key: zone,
          cross: false,
          ...(exportMode
            ? arrowGeometry(centers.get(zone)!, toCenter, layout.imgW, layout.imgH, ARROW_BOW.export, true)
            : arrowGeometry(centers.get(zone)!, toCenter, layout.imgW, layout.imgH)),
        }))
    : []

  // On-screen px layout (a nominal width until the scene is measured, e.g. in tests).
  const fontFamily = exportMode ? EXPORT_FONT : String(theme.typography.fontFamily)
  const W = sceneW || layout.imgW
  const H = (W * layout.imgH) / layout.imgW
  const vis = visualMapper(W, H, sceneRotation(layout.rotationDeg))
  const layoutOf = (id: LayoutId) => layouts.find((l) => l.id === id)

  // After map, machines coming from other layouts: purple pills on the left edge + dashed purple arrows to the target.
  const crossPills: CrossPill[] = []
  if (role === 'after' && toZone) {
    const sources = [...groups].flatMap(([id, byZone]) => {
      const from = id === null || id === layout.id ? undefined : layoutOf(id)
      if (!from) return []
      const rs = [...byZone.values()].flat()
      return [{ id: id!, text: `◂ ${vi ? 'Từ' : 'From'} ${placeName(from, rowFac(rs[0], ctx), vi)} / ${from.dbFloor ?? '-'} / ${[...byZone.keys()].join(', ')} (${rs.length})` }]
    })
    const dest = toCenter ? vis.map(toCenter) : { x: vis.bounds.w / 2, y: vis.bounds.h / 2 }
    sources.forEach((src, i) => {
      const size = chipSize(src.text, 12, 700, fontFamily, 10, 16, 6)
      const half = size.h / 2
      const y = Math.max(half + 4, Math.min(vis.bounds.h - half - 4, dest.y + (i - (sources.length - 1) / 2) * (size.h + 6)))
      const anchor = vis.unmap({ x: EDGE_INSET, y })
      crossPills.push({ key: src.id, text: src.text, anchor, box: { x: EDGE_INSET, y: y - half, ...size } })
      if (toCenter) arrows.push({ key: `layout:${src.id}`, cross: true, ...arrowGeometry(vis.unmap({ x: EDGE_INSET + size.w + 4, y }), toCenter, layout.imgW, layout.imgH) })
    })
  }
  // Before map, destination on another layout: purple pill on the right edge.
  const toOther = role === 'before' && target && target.layoutId !== layout.id ? layoutOf(target.layoutId) : undefined
  const toOtherText = toOther && target ? `${vi ? 'Sang' : 'To'} ${placeName(toOther, targetFac(target, ctx), vi)} / ${toOther.dbFloor ?? '-'} / ${target.zone} ▸` : null

  // Chips: sub-zones top-left (white, major colour), major areas bottom-right (solid major colour, code only).
  const labels = visible.flatMap((s) => {
    const w = (s.box.w * W) / 100
    const h = (s.box.h * H) / 100
    const isRel = related.has(s.code)
    const state = states.get(s.code)!
    // From / old zones carry a pin with the machine codes; their own chip would sit under it.
    if (state === 'from' || state === 'old') return []
    if (sceneW > 0 && !s.major && !isRel && (w < MIN_LABEL_W || h < MIN_LABEL_H)) return []
    const muted = focus && !isRel && !parents.has(s.code)
    const fontSize = sceneW > 0 ? Math.round(Math.min(s.major ? 14 : 13, Math.max(9, Math.min(w, h) * 0.2))) : 11
    const n = counts.get(s.code) ?? 0
    // Export: zone chips never carry machine counts.
    const text = s.major ? s.code : showCounts && !muted && !exportMode ? `${s.code} · ${n}` : s.code
    return [{ ...s, fontSize, fontWeight: s.major ? 800 : 700, related: isRel, muted, text, state }]
  })
  // Collision layout: related sub-zone chips and edge pills stay put; pin captions (above the dot) move up, the
  // labels of major areas around related zones move up or hide, so nothing covers the chips.
  const boxes: LabelBox[] = crossPills.map((p) => ({ id: `cross:${p.key}`, kind: 'tab', ...p.box }))
  for (const l of labels) {
    if (!l.related && !parents.has(l.code)) continue
    const size = chipSize(l.text, l.fontSize, l.fontWeight, fontFamily, CHIP_PAD_X)
    const zb = vis.box(l.box)
    if (!l.major) boxes.push({ id: `label:${l.code}`, kind: 'tab', x: zb.x + 3, y: zb.y + 3, ...size })
    else boxes.push({ id: `label:${l.code}`, kind: 'major', x: zb.x + zb.w - size.w - 3, y: zb.y + zb.h - size.h - 3, ...size })
  }
  for (const p of pins) {
    const size = chipSize(p.label, 11, 800, fontFamily, PIN_PAD_X, 14, 4)
    const c = vis.map(centers.get(p.code)!)
    boxes.push({ id: `pin:${p.code}`, kind: 'pin', dir: -1, spread: p.kind === 'old', x: c.x - size.w / 2, y: c.y - PIN_GAP - size.h, ...size })
  }
  const boxesKey = JSON.stringify(boxes)
  // Dependency = the content of `boxes` (rebuilt each render), not its identity.
  const placedLabels = useMemo(() => layoutLabels(boxes, vis.bounds, 2, FOCUS.labelTries), [boxesKey, vis.bounds.w, vis.bounds.h])
  /** Transform putting a label anchored at scene point `at` to its placed on-screen position. */
  const placedTransform = (id: string, at: { x: number; y: number }) => {
    const pl = placedLabels.get(id)
    if (!pl) return undefined
    const a = vis.map(at)
    return { hidden: pl.hidden, transform: `${upright} translate(${(pl.x - a.x).toFixed(1)}px, ${(pl.y - a.y).toFixed(1)}px)`.trim() }
  }

  const drawing3d = use3d && !!layout.imageData3d
  if (exportMode) {
    return (
      <ExportSvg
        exportMode={exportMode}
        layout={layout}
        vis={vis}
        W={W}
        H={H}
        focus={focus}
        layers={layers}
        states={states}
        related={related}
        parents={parents}
        hasSubs={hasSubs}
        arrows={arrows}
        labels={labels}
        pins={pins}
        centers={centers}
        crossPills={crossPills}
        toOtherText={toOtherText}
        placedLabels={placedLabels}
      />
    )
  }

  const paper = 'rgba(255,255,255,.92)' // Chips sit on the always-light drawing, in both theme modes.
  const pill = { px: '10px', py: '3px', borderRadius: px(glassRadius.capsule), fontSize: 12, fontWeight: 700, lineHeight: '16px', color: '#ffffff', bgcolor: CROSS, whiteSpace: 'nowrap', boxShadow: '0 2px 6px rgba(15,23,42,.25)' }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Box sx={{ aspectRatio: frameRatio, minHeight: 0 }} data-testid="reloc-map-frame">
        <MapScene
          lang={lang}
          title={layout.title}
          imageData={drawing3d ? layout.imageData3d! : layout.imageData}
          imgW={layout.imgW}
          imgH={layout.imgH}
          rotationDeg={layout.rotationDeg}
          fit="contain"
          view={view}
          onViewChange={onViewChange}
          scrollSync={scrollSync}
          onSceneWidth={setSceneW}
          svgProps={{ className: 'reloc-svg', ...(interactive ? { role: 'group', 'aria-label': layout.title } : { 'aria-hidden': true, focusable: 'false' }) }}
          sceneSx={{
            // The drawing recedes (grey, lighter; more in focus mode) so the coloured zones carry the information.
            // The 3D drawing is already slate-toned: no grayscale, same opacity.
            // willChange: the filtered drawing gets its own layer, so scrolling does not re-run the filter.
            '& > img': { willChange: 'transform', filter: drawing3d ? 'none' : 'grayscale(1)', opacity: drawing3d ? FOCUS.image3d : focus ? FOCUS.image.focus : FOCUS.image.idle, transition: `opacity ${FOCUS.transitionMs}ms` },
            '& .reloc-svg': { pointerEvents: 'none' },
            '& .reloc-zone': {
              strokeLinejoin: 'round',
              vectorEffect: 'non-scaling-stroke',
              transition: TRANSITION,
              outline: 'none',
            },
            '& .reloc-zone.is-major': { strokeWidth: 2 },
            '& .reloc-zone.is-sub': { strokeWidth: 1.5 },
            '& .reloc-zone.is-pickable': { pointerEvents: 'visiblePainted', cursor: 'pointer' },
            '& .reloc-zone.is-pickable:hover': { strokeWidth: 3, opacity: 1, strokeOpacity: 1, fillOpacity: 1 },
            '& .reloc-zone:focus-visible': { stroke: theme.palette.primary.main, strokeWidth: 3.4, opacity: 1 },
            // Focus mode: unrelated zones keep their colour but go pale (fill 0.06, thin faded stroke); major areas
            // holding a related zone get a solid 2px stroke.
            '& .reloc-zone.zone-dim': { fillOpacity: FOCUS.dim.fill / FOCUS.zoneFill, strokeWidth: FOCUS.dim.strokeWidth, strokeOpacity: FOCUS.dim.strokeOpacity },
            '& .reloc-zone.zone-disabled': { fill: alpha(MAP.relocDim, 0.06), stroke: MAP.relocDim, strokeDasharray: '4 3' },
            '& .reloc-zone.is-parent': { strokeWidth: FOCUS.parent.strokeWidth, strokeOpacity: 1, fillOpacity: 1 },
            '& .reloc-zone.zone-from': { fill: alpha(FROM, FOCUS.from.fill), stroke: FOCUS.from.stroke, strokeWidth: FOCUS.from.strokeWidth },
            '& .reloc-zone.zone-to': { fill: alpha(TO, FOCUS.to.fill), stroke: FOCUS.to.stroke, strokeWidth: FOCUS.to.strokeWidth },
            '& .reloc-zone.zone-old': {
              fill: alpha(FOCUS.old.color, FOCUS.old.fill),
              stroke: FOCUS.old.stroke,
              strokeWidth: FOCUS.old.strokeWidth,
              strokeDasharray: FOCUS.old.dash,
              animation: 'none',
            },
            '& .reloc-zone.zone-from, & .reloc-zone.zone-to': { animation: 'reloc-breathe 2s ease-in-out infinite' },
            '& .reloc-halo': { fill: 'none', stroke: '#ffffff', strokeWidth: 6, strokeLinejoin: 'round', pointerEvents: 'none' },
            '& .reloc-zone.is-highlight': { stroke: theme.palette.primary.main, strokeWidth: 4, opacity: 1, animation: 'reloc-flash .7s ease-in-out infinite alternate' },
            '@keyframes reloc-breathe': { '0%, 100%': { strokeOpacity: 1 }, '50%': { strokeOpacity: 0.55 } },
            '@keyframes reloc-flash': { from: { strokeOpacity: 1 }, to: { strokeOpacity: 0.3 } },
            '& .reloc-arrow': {
              fill: 'none',
              stroke: TO,
              strokeWidth: FOCUS.arrow.strokeWidth,
              strokeLinecap: 'round',
              vectorEffect: 'non-scaling-stroke',
              strokeDasharray: FOCUS.arrow.dash,
              animation: 'reloc-flow 1s linear infinite',
            },
            '& .reloc-arrow-head': { fill: TO },
            '& .reloc-arrow.is-cross': { stroke: CROSS },
            '& .reloc-arrow-head.is-cross': { fill: CROSS },
            '@keyframes reloc-flow': { to: { strokeDashoffset: -14 } },
            '@keyframes reloc-pulse': { '0%': { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.55 }, '100%': { transform: 'translate(-50%, -50%) scale(2.6)', opacity: 0 } },
            // Anchors: zero-size points in scene %, moving with the (rotated) scene; their content is counter-rotated.
            '& .reloc-pin, & .reloc-label, & .reloc-anchor': { position: 'absolute', width: 0, height: 0, pointerEvents: 'none' },
            '& .reloc-label': { zIndex: 1, transition: `opacity ${FOCUS.transitionMs}ms` },
            // Focus mode: unrelated chips fade (back to full opacity while their zone is hovered).
            '& .reloc-label.is-muted': { opacity: FOCUS.dim.chipOpacity },
            '& .reloc-label.is-major.is-muted': { opacity: FOCUS.dim.majorChipOpacity },
            '& .reloc-label.is-muted.is-hover, & .reloc-label.is-major.is-muted.is-hover': { opacity: 1 },
            '& .reloc-label.is-related': { zIndex: 2 },
            '& .reloc-pin, & .reloc-anchor': { zIndex: 3 },
            '& .reloc-pin-dot, & .reloc-pin-ring': { position: 'absolute', left: 0, top: 0, width: 12, height: 12, borderRadius: '50%', transform: 'translate(-50%, -50%)' },
            // Pin: white dot with a border in the state colour.
            '& .reloc-pin-dot': { bgcolor: '#ffffff', border: `${FOCUS.from.pinBorder}px solid`, boxShadow: '0 1px 3px rgba(15,23,42,.35)' },
            '& .pin-from .reloc-pin-dot, & .pin-old .reloc-pin-dot': { borderColor: FROM },
            '& .pin-old .reloc-pin-dot': { borderWidth: `${FOCUS.old.pinBorder}px` },
            '& .pin-to .reloc-pin-dot': { borderColor: TO },
            '& .reloc-pin-ring': { bgcolor: TO, animation: 'reloc-pulse 1.6s ease-out infinite' },
            '& .reloc-pin-label, & .reloc-label-text, & .reloc-anchor-text': { position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', whiteSpace: 'nowrap' },
            '& .reloc-pin-label': {
              px: px(PIN_PAD_X),
              py: '2px',
              borderRadius: '6px',
              fontSize: 11,
              fontWeight: 800,
              lineHeight: '14px',
              color: '#ffffff',
              border: '1px solid transparent',
              boxShadow: '0 2px 6px rgba(15,23,42,.25)',
            },
            '& .pin-from .reloc-pin-label': { bgcolor: FROM },
            '& .pin-to .reloc-pin-label': { bgcolor: TO },
            '& .pin-old .reloc-pin-label': { bgcolor: FOCUS.old.chipBg, color: FOCUS.old.chipInk, borderColor: FOCUS.old.chipInk, boxShadow: 'none' },
            // Sub-zone chip: white, border and text in the major-area colour (inline). Major chip: solid colour, white text.
            '& .reloc-label-text': {
              px: px(CHIP_PAD_X),
              borderRadius: '4px',
              fontWeight: 700,
              lineHeight: 1.35,
              bgcolor: paper,
              borderStyle: 'solid',
              borderWidth: '1px',
            },
            '& .reloc-label.is-major .reloc-label-text': { color: '#ffffff', fontWeight: 800 },
            '& .reloc-anchor-text': pill,
            [REDUCED_MOTION]: {
              '& .reloc-arrow': { animation: 'none' },
              '& .reloc-pin-ring': { animation: 'none', display: 'none' },
              '& .reloc-zone': { transition: 'none', animation: 'none !important' },
              '& > img, & .reloc-label': { transition: 'none' },
            },
          }}
          overlay={
            toOtherText && (
              <Box
                className="reloc-edge-tag reloc-edge-to"
                sx={{ ...pill, position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', zIndex: 3, maxWidth: 'calc(100% - 24px)', overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none' }}
              >
                {toOtherText}
              </Box>
            )
          }
          svg={
            <>
              {layers.flat().map((s) => {
                const state = states.get(s.code)!
                const pickable = canPick(s.code)
                const isRel = related.has(s.code)
                const className = [
                  'reloc-zone',
                  `zone-${state}`,
                  s.major ? 'is-major' : 'is-sub',
                  pickable ? 'is-pickable' : '',
                  isRel ? 'is-related' : '',
                  parents.has(s.code) ? 'is-parent' : '',
                  s.code === highlightZone ? 'is-highlight' : '',
                ].filter(Boolean).join(' ')
                const common = {
                  className,
                  'data-zone': s.code,
                  'data-state': state,
                  fill: alpha(s.color, s.major && hasSubs(s.code) ? FOCUS.majorFill : drawing3d ? FOCUS.zoneFill3d : FOCUS.zoneFill),
                  stroke: s.color,
                  vectorEffect: 'non-scaling-stroke',
                  ...(pickable ? pickProps(s.code, state) : {}),
                }
                const title = <title>{tooltip(s.code, state)}</title>
                // Halo: a wider white stroke under related zones, so they read on any background (no SVG filter).
                const halo = { className: 'reloc-halo', 'aria-hidden': true, vectorEffect: 'non-scaling-stroke' } as const
                const r = s.rect
                return (
                  <g key={s.code} className="reloc-zone-group">
                    {isRel && (s.points ? <polygon points={s.points} {...halo} /> : <rect x={r!.x} y={r!.y} width={r!.w} height={r!.h} {...halo} />)}
                    {s.points ? <polygon points={s.points} {...common}>{title}</polygon> : <rect x={r!.x} y={r!.y} width={r!.w} height={r!.h} {...common}>{title}</rect>}
                  </g>
                )
              })}
              {arrows.map((a) => (
                <g key={`arrow-${a.key}`} className="reloc-arrow-group" data-from={a.key}>
                  <path className={`reloc-arrow${a.cross ? ' is-cross' : ''}`} d={a.d} />
                  <polygon className={`reloc-arrow-head${a.cross ? ' is-cross' : ''}`} points={a.head} />
                </g>
              ))}
            </>
          }
        >
          {labels.map((l) => {
            const at = l.major ? l.corners.br : l.corners.tl
            const placedAt = l.major ? placedTransform(`label:${l.code}`, at) : undefined
            if (placedAt?.hidden) return null
            const offset = l.major ? 'translate(calc(-100% - 3px), calc(-100% - 3px))' : 'translate(3px, 3px)'
            const className = ['reloc-label', l.major ? 'is-major' : 'is-sub', `label-${l.state}`, l.related ? 'is-related' : '', l.muted ? 'is-muted' : '', l.code === hovered ? 'is-hover' : ''].filter(Boolean).join(' ')
            const colors = l.major ? { backgroundColor: l.color, borderColor: l.color } : { borderColor: l.color, color: l.color }
            return (
              <Box key={`label-${l.code}`} className={className} data-zone={l.code} aria-hidden style={{ left: `${at.x}%`, top: `${at.y}%` }}>
                <span className="reloc-label-text" style={{ fontSize: l.fontSize, ...colors, transform: placedAt?.transform ?? `${upright} ${offset}`.trim() }}>
                  {l.text}
                </span>
              </Box>
            )
          })}
          {crossPills.map((p) => (
            <Box key={`cross-${p.key}`} className="reloc-anchor" aria-hidden style={{ left: `${p.anchor.x}%`, top: `${p.anchor.y}%` }}>
              <span className="reloc-anchor-text reloc-edge-tag reloc-edge-from" style={{ transform: `${upright} translate(0, -50%)`.trim() }}>
                {p.text}
              </span>
            </Box>
          ))}
          {pins.map((p) => {
            const c = centers.get(p.code)!
            const caption = placedTransform(`pin:${p.code}`, c)
            return (
              <Box key={`pin-${p.kind}-${p.code}`} className={`reloc-pin pin-${p.kind}`} data-zone={p.code} aria-hidden style={{ left: `${c.x}%`, top: `${c.y}%` }}>
                {p.kind === 'to' && <span className="reloc-pin-ring" />}
                <span className="reloc-pin-dot" />
                {caption && (
                  <span className="reloc-pin-label" style={{ transform: caption.transform }}>
                    {p.label}
                  </span>
                )}
              </Box>
            )
          })}
        </MapScene>
      </Box>

      {tray.length > 0 && (
        <Box sx={{ px: 2, py: 1.25, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.75 }}>
            {vi ? 'Zone có trong dữ liệu nhưng không có trên bản vẽ' : 'Zones in the data but not on the drawing'}
          </Typography>
          <Stack direction="row" useFlexGap spacing={0.75} sx={{ flexWrap: 'wrap' }} role={interactive ? 'group' : undefined} aria-label={vi ? 'Zone không có trên bản vẽ' : 'Zones not on the drawing'}>
            {tray.map((t) => {
              const state = stateOf(t.code, here)
              const pickable = canPick(t.code)
              // Dashed chip in the major-area colour (the state colour for from / to / old, grey when disabled), fill 0.1.
              const color =
                state === 'from' || state === 'old' ? FROM : state === 'to' ? TO : state === 'disabled' ? MAP.relocDim : (colorOf.get(majorZone(t.code)) ?? SLATE)
              return (
                <Box
                  key={t.code}
                  component={pickable ? 'button' : 'span'}
                  type={pickable ? 'button' : undefined}
                  className={`reloc-tray-zone zone-${state}`}
                  data-zone={t.code}
                  data-border={color}
                  title={tooltip(t.code, state)}
                  aria-label={pickable ? ariaLabel(t.code, state) : undefined}
                  aria-pressed={pickable ? pressed(t.code, state) : undefined}
                  onClick={pickable ? () => pick(t.code) : undefined}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.75,
                    px: 1,
                    py: 0.25,
                    font: 'inherit',
                    fontSize: 12,
                    fontWeight: 700,
                    lineHeight: 1.35,
                    color,
                    bgcolor: alpha(color, 0.1),
                    border: `1px dashed ${color}`,
                    borderRadius: '4px',
                    cursor: pickable ? 'pointer' : 'default',
                    transition: 'box-shadow .15s',
                    '&:hover': pickable ? { boxShadow: `0 0 0 2px ${alpha(color, 0.35)}` } : {},
                    '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: '2px' },
                    [REDUCED_MOTION]: { transition: 'none' },
                  }}
                >
                  {t.code}
                  {showCounts && state !== 'old' && <span style={{ fontVariantNumeric: 'tabular-nums' }}>{t.count}</span>}
                  {state === 'old' && <span>({vi ? 'cũ' : 'old'})</span>}
                </Box>
              )
            })}
          </Stack>
        </Box>
      )}
    </Box>
  )
}

interface ExportLabel extends Shape {
  fontSize: number
  fontWeight: number
  related: boolean
  muted: boolean
  text: string
}

interface ExportSvgProps {
  exportMode: { width: number; imageHref: string }
  layout: RelocationLayout
  vis: ReturnType<typeof visualMapper>
  W: number
  H: number
  focus: boolean
  layers: Shape[][]
  states: ReadonlyMap<string, ZoneState>
  related: ReadonlySet<string>
  parents: ReadonlySet<string>
  hasSubs: (code: string) => boolean
  arrows: readonly Arrow[]
  labels: readonly ExportLabel[]
  pins: readonly Pin[]
  centers: ReadonlyMap<string, { x: number; y: number }>
  crossPills: readonly CrossPill[]
  toOtherText: string | null
  placedLabels: ReadonlyMap<string, PlacedLabel>
}

/** Inline zone style of the export SVG: the same cascade as the `.reloc-zone` classes of the live map. */
function exportZoneStyle(s: Shape, state: ZoneState, parent: boolean, majorWithSubs: boolean) {
  const st = {
    fill: alpha(s.color, majorWithSubs ? FOCUS.majorFill : FOCUS.zoneFill),
    fillOpacity: 1,
    stroke: s.color,
    strokeWidth: s.major ? 2 : 1.5,
    strokeOpacity: 1,
    strokeDasharray: undefined as string | undefined,
  }
  if (state === 'dim') Object.assign(st, { fillOpacity: FOCUS.dim.fill / FOCUS.zoneFill, strokeWidth: FOCUS.dim.strokeWidth, strokeOpacity: FOCUS.dim.strokeOpacity })
  if (state === 'disabled') Object.assign(st, { fill: alpha(MAP.relocDim, 0.06), stroke: MAP.relocDim, strokeDasharray: '4 3' })
  if (parent) Object.assign(st, { strokeWidth: FOCUS.parent.strokeWidth, strokeOpacity: 1, fillOpacity: 1 })
  if (state === 'from') Object.assign(st, { fill: alpha(FROM, FOCUS.from.fill), stroke: FOCUS.from.stroke, strokeWidth: FOCUS.from.strokeWidth })
  if (state === 'to') Object.assign(st, { fill: alpha(TO, FOCUS.to.fill), stroke: FOCUS.to.stroke, strokeWidth: FOCUS.to.strokeWidth })
  if (state === 'old') Object.assign(st, { fill: alpha(FOCUS.old.color, FOCUS.old.fill), stroke: FOCUS.old.stroke, strokeWidth: FOCUS.old.strokeWidth, strokeDasharray: FOCUS.old.dash })
  return st
}

/** One-line chip (rect + centred text) at an on-screen top-left position. */
function SvgChip({ x, y, w, h, text, fontSize, fontWeight, fill, stroke, color, rx, opacity, dashed }: {
  x: number; y: number; w: number; h: number; text: string; fontSize: number; fontWeight: number; fill: string; stroke?: string; color: string; rx: number; opacity?: number; dashed?: boolean
}) {
  return (
    <g opacity={opacity}>
      <rect x={x + 0.5} y={y + 0.5} width={Math.max(0, w - 1)} height={Math.max(0, h - 1)} rx={rx} fill={fill} stroke={stroke ?? 'none'} strokeWidth={stroke ? 1 : 0} strokeDasharray={dashed ? '3 2' : undefined} />
      <text x={x + w / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="central" fontSize={fontSize} fontWeight={fontWeight} fill={color}>
        {text}
      </text>
    </g>
  )
}

/** Standalone SVG of a map for the PNG export (fixed size, inline styles, embedded drawing). */
function ExportSvg({ exportMode, layout, vis, W, H, focus, layers, states, related, parents, hasSubs, arrows, labels, pins, centers, crossPills, toOtherText, placedLabels }: ExportSvgProps) {
  const { w: vw, h: vh } = vis.bounds
  const rotation = sceneRotation(layout.rotationDeg)
  const paper = 'rgba(255,255,255,0.92)'
  const nonScaling = { vectorEffect: 'non-scaling-stroke' } as const
  const pillSize = (text: string) => chipSize(text, 12, 700, EXPORT_FONT, 10, 16, 6)
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={Math.round(vw)} height={Math.round(vh)} viewBox={`0 0 ${vw.toFixed(2)} ${vh.toFixed(2)}`} fontFamily={EXPORT_FONT} data-export-layout={layout.id}>
      <defs>
        <filter id={`reloc-gray-${layout.id}`}>
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </defs>
      <rect width={vw} height={vh} fill="#ffffff" />
      <g transform={`translate(${(vw / 2).toFixed(2)} ${(vh / 2).toFixed(2)}) rotate(${rotation}) translate(${(-W / 2).toFixed(2)} ${(-H / 2).toFixed(2)})`}>
        <image href={exportMode.imageHref} width={W} height={H} preserveAspectRatio="none" filter={`url(#reloc-gray-${layout.id})`} opacity={focus ? FOCUS.image.focus : FOCUS.image.idle} />
        <g transform={`scale(${(W / 100).toFixed(4)} ${(H / 100).toFixed(4)})`}>
          {layers.flat().map((s) => {
            const state = states.get(s.code)!
            const st = exportZoneStyle(s, state, parents.has(s.code), s.major && hasSubs(s.code))
            const r = s.rect
            const geom = (extra: Record<string, unknown>) =>
              s.points ? <polygon points={s.points} {...extra} /> : <rect x={r!.x} y={r!.y} width={r!.w} height={r!.h} {...extra} />
            return (
              <g key={s.code} data-zone={s.code} data-state={state}>
                {related.has(s.code) && geom({ fill: 'none', stroke: '#ffffff', strokeWidth: 6, strokeLinejoin: 'round', ...nonScaling })}
                {geom({ ...st, strokeLinejoin: 'round', ...nonScaling })}
              </g>
            )
          })}
          {arrows.map((a) => (
            <g key={`arrow-${a.key}`} data-from={a.key}>
              <path d={a.d} fill="none" stroke={a.cross ? CROSS : TO} strokeWidth={FOCUS.arrow.strokeWidth} strokeLinecap="round" strokeDasharray={FOCUS.arrow.dash} {...nonScaling} />
              <polygon points={a.head} fill={a.cross ? CROSS : TO} />
            </g>
          ))}
        </g>
      </g>
      {labels.map((l) => {
        const size = chipSize(l.text, l.fontSize, l.fontWeight, EXPORT_FONT, CHIP_PAD_X)
        const pl = placedLabels.get(`label:${l.code}`)
        if (pl?.hidden) return null
        const zb = vis.box(l.box)
        const pos = pl ?? (l.major ? { x: zb.x + zb.w - size.w - 3, y: zb.y + zb.h - size.h - 3 } : { x: zb.x + 3, y: zb.y + 3 })
        const opacity = l.muted ? (l.major ? FOCUS.dim.majorChipOpacity : FOCUS.dim.chipOpacity) : undefined
        return (
          <SvgChip
            key={`label-${l.code}`}
            {...pos}
            {...size}
            text={l.text}
            fontSize={l.fontSize}
            fontWeight={l.fontWeight}
            rx={4}
            opacity={opacity}
            {...(l.major ? { fill: l.color, color: '#ffffff' } : { fill: paper, stroke: l.color, color: l.color })}
          />
        )
      })}
      {crossPills.map((p) => (
        <SvgChip key={`cross-${p.key}`} {...p.box} text={p.text} fontSize={12} fontWeight={700} rx={p.box.h / 2} fill={CROSS} color="#ffffff" />
      ))}
      {toOtherText && (() => {
        const size = pillSize(toOtherText)
        return <SvgChip x={vw - 12 - size.w} y={vh / 2 - size.h / 2} {...size} text={toOtherText} fontSize={12} fontWeight={700} rx={size.h / 2} fill={CROSS} color="#ffffff" />
      })()}
      {pins.map((p) => {
        const c = vis.map(centers.get(p.code)!)
        const size = chipSize(p.label, 11, 800, EXPORT_FONT, PIN_PAD_X, 14, 4)
        const pos = placedLabels.get(`pin:${p.code}`) ?? { x: c.x - size.w / 2, y: c.y - PIN_GAP - size.h }
        const color = p.kind === 'to' ? TO : FROM
        const caption =
          p.kind === 'old'
            ? { fill: FOCUS.old.chipBg, stroke: FOCUS.old.chipInk, color: FOCUS.old.chipInk }
            : { fill: color, color: '#ffffff' }
        return (
          <g key={`pin-${p.kind}-${p.code}`} className={`pin-${p.kind}`} data-zone={p.code}>
            {p.kind === 'to' && <circle cx={c.x} cy={c.y} r={11} fill={TO} opacity={0.25} />}
            <circle cx={c.x} cy={c.y} r={6} fill="#ffffff" stroke={color} strokeWidth={p.kind === 'old' ? FOCUS.old.pinBorder : FOCUS.from.pinBorder} />
            <SvgChip x={pos.x} y={pos.y} {...size} text={p.label} fontSize={11} fontWeight={800} rx={6} {...caption} />
          </g>
        )
      })}
    </svg>
  )
}

/** Memoised: re-renders only when its props change (never while scrolling; see MapScene). */
export const RelocationFloorMap = memo(RelocationFloorMapImpl)
