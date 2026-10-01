import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { facLabel } from '../config/relocation'
import { EXPORT_FONT, FOCUS, RelocationFloorMap, type RelocationLayout } from '../components/relocation/RelocationFloorMap'
import { sceneRotation } from '../components/map/MapScene'
import { FLOORS } from '../data/mapData'
import type { Lang } from '../types/fixedAsset'
import type { AssetLocation } from '../types/location'
import type { MoveType, RelocationRequest, RelocationTarget } from '../types/relocation'
import { tokens } from '../theme/palette'
import { buildTray, DEFAULT_CONTEXT, moveTypeOf, rowFac, rowLayoutId, targetFac, type RelocationContext } from './relocation'
import { formatRequestDate } from './relocationForm'
import { isMajorZone } from './relocationInput'
import { majorZone } from './zone'

const MAP = tokens.light

export type ExportRow = Pick<AssetLocation, 'code' | 'name' | 'currentZone' | 'positionA' | 'floor' | 'matchLevel'> &
  Partial<Pick<AssetLocation, 'mapFac' | 'mapFloor' | 'floorMismatch'>>

export interface RelocationExportInput {
  /** UI language of the caller; the image itself is always in English. */
  lang?: Lang
  request: Pick<RelocationRequest, 'id' | 'requestedBy' | 'plannedMoveDate' | 'plannedDoneDate' | 'createdAt'> & Partial<Pick<RelocationRequest, 'reason'>>
  /** Machines that move (current location = where they leave). */
  rows: readonly ExportRow[]
  target: RelocationTarget
  /** Null when the zone is not drawn: a placeholder box is painted instead. */
  beforeLayout: RelocationLayout | null
  afterLayout: RelocationLayout | null
  layouts?: readonly RelocationLayout[]
  ctx?: RelocationContext
}

/** Browser hooks, replaceable in tests (jsdom has no canvas nor image decoding). */
export interface ExportDeps {
  /** Any image URL -> data URL (the SVG is loaded as an image, so it cannot fetch anything itself). */
  toDataUrl: (src: string) => Promise<string>
  loadImage: (src: string) => Promise<CanvasImageSource>
  createCanvas: (w: number, h: number) => HTMLCanvasElement
  /** Clock of the footer (and of "Created" when the request has no createdAt yet). */
  now?: () => Date
}

/** Canvas width and vertical rhythm (px) of the PNG; the height follows the content. */
export const EXPORT = {
  width: 2400,
  pad: 40,
  gap: 40,
  titleH: 52,
  metaH: 40,
  routeH: 52,
  reasonLineH: 32,
  reasonMaxLines: 4,
  sectionGap: 20,
  mapTitleH: 40,
  mapMaxH: 620,
  placeholderH: 200,
  trayLineH: 40,
  legendH: 52,
  rowH: 40,
  noteH: 34,
  footerH: 30,
  /** Column widths of the machine table (share of the table width). */
  cols: { code: 0.12, name: 0.38, fromTo: 0.38, type: 0.12 },
} as const

/** The image is always in English. */
const LANG: Lang = 'en'

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'))
    reader.readAsDataURL(blob)
  })
}

export const browserDeps: ExportDeps = {
  async toDataUrl(src) {
    if (src.startsWith('data:')) return src
    const response = await fetch(src)
    if (!response.ok) throw new Error(`HTTP ${response.status} (${src})`)
    return blobToDataUrl(await response.blob())
  },
  loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Could not load the map image'))
      img.src = src
    })
  },
  createCanvas(w, h) {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    return canvas
  },
}

/**
 * Export input of a stored request, from its snapshot only (GET detail: from = *_BF, to = *_AT per machine, dates,
 * creator), never from where the machines are now. `names` only supplies the machine names (not stored in the row).
 */
export function snapshotExportInput(
  request: RelocationRequest,
  opts: { lang: Lang; layouts: readonly RelocationLayout[]; ctx?: RelocationContext; names?: ReadonlyMap<string, string | null> },
): RelocationExportInput {
  const ctx = opts.ctx ?? DEFAULT_CONTEXT
  const layoutOf = (zone: string | null | undefined) => {
    const id = zone ? (ctx.index.get(zone) ?? ctx.index.get(majorZone(zone))) : undefined
    return opts.layouts.find((l) => l.id === id) ?? null
  }
  const rows: ExportRow[] = request.items.map((i) => {
    const zone = i.fromZone
    return {
      code: i.code,
      name: opts.names?.get(i.code) ?? (i.name || null),
      currentZone: zone,
      positionA: i.fromPositionA ?? (zone ? majorZone(zone) : null),
      floor: layoutOf(zone)?.dbFloor ?? null,
      matchLevel: !zone ? 'NONE' : isMajorZone(zone) ? 'MAJOR' : 'SUB',
      mapFac: zone ? (ctx.zoneFac.get(zone) ?? null) : null,
    }
  })
  const toZone = request.items.find((i) => i.toZone)?.toZone ?? request.to.zone
  const afterLayout = layoutOf(toZone)
  const beforeLayout = layoutOf(rows.find((r) => r.currentZone)?.currentZone)
  // A destination not drawn on any layout: no After map (placeholder), no "to" pin on the Before map.
  const layoutId = afterLayout?.id ?? beforeLayout?.id ?? opts.layouts[0].id
  return { lang: opts.lang, request, rows, target: { layoutId, zone: toZone }, beforeLayout, afterLayout, layouts: opts.layouts, ctx }
}

/** Visual (rotated) size of a layout drawn at scene width `w`. */
function visualSize(layout: RelocationLayout, w: number) {
  const rad = (sceneRotation(layout.rotationDeg) * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  const h = (w * layout.imgH) / layout.imgW
  return { w: w * cos + h * sin, h: w * sin + h * cos }
}

/** Scene width so that the (possibly rotated) layout fits in a box. */
function fitSceneWidth(layout: RelocationLayout, boxW: number, boxH: number) {
  const v = visualSize(layout, layout.imgW)
  return layout.imgW * Math.min(boxW / v.w, boxH / v.h)
}

/** Standalone SVG markup of one map (RelocationFloorMap in export mode, always English, no machine counts). */
export function renderExportSvg(input: RelocationExportInput, role: 'before' | 'after', layout: RelocationLayout, imageHref: string, box: { w: number; h: number }): string {
  const width = Math.floor(fitSceneWidth(layout, box.w, box.h))
  return renderToStaticMarkup(
    createElement(RelocationFloorMap, {
      lang: LANG,
      layout,
      role,
      rows: input.rows,
      target: input.target,
      layouts: input.layouts,
      ctx: input.ctx ?? DEFAULT_CONTEXT,
      showCounts: false,
      exportMode: { width, imageHref },
    }),
  )
}

const svgDataUrl = (markup: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`

/** "Building A / 1F" of a layout + building (English). */
function placeOf(layout: RelocationLayout | null, fac: string | null, floor?: string | null) {
  const building = fac ? facLabel(fac, false) : layout ? (layout.title.split(' - ').pop() ?? layout.title) : null
  return [building ?? '-', layout?.dbFloor ?? floor ?? '-'].join(' / ')
}

const p2 = (n: number) => String(n).padStart(2, '0')
/** Local "yyyy-MM-dd HH:mm". */
export function localStamp(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`
}
/** API CreateDate "yyyy-MM-ddTHH:mm[:ss]" -> "yyyy-MM-dd HH:mm" (string only, no timezone shift). */
function stampOf(iso: string | null | undefined, now: Date) {
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(iso ?? '')
  if (!m) return localStamp(now)
  return m[2] ? `${m[1]} ${m[2]}` : m[1]
}

export const MOVE_LABELS: Record<MoveType, string> = { building: 'Building change', floor: 'Floor change', same: 'Same floor', none: 'No change' }

interface BadgeStyle {
  bg: string
  fg: string
  border?: string
}
/** Badge colours as on the UI: building/floor solid purple; same floor info blue (table) / light green (route); none outlined. */
const TABLE_BADGE: Record<MoveType, BadgeStyle> = {
  building: { bg: MAP.relocCross, fg: '#ffffff' },
  floor: { bg: MAP.relocCross, fg: '#ffffff' },
  same: { bg: MAP.info, fg: '#ffffff' },
  none: { bg: '#ffffff', fg: '#475569', border: '#94a3b8' },
}
const ROUTE_BADGE: Record<MoveType, BadgeStyle> = {
  ...TABLE_BADGE,
  same: { bg: 'rgba(4, 120, 87, 0.14)', fg: MAP.relocTo, border: 'rgba(4, 120, 87, 0.4)' },
}

function font(size: number, weight = 400) {
  return `${weight} ${size}px ${EXPORT_FONT}`
}

/** Text cut with "…" to fit maxW. */
function fitText(g: CanvasRenderingContext2D, text: string, maxW: number) {
  if (g.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && g.measureText(`${t}…`).width > maxW) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}

/** Word-wraps `text` (keeps its line breaks; breaks over-long words) into at most `maxLines`; the last one ends in "…" when cut. */
export function wrapText(g: Pick<CanvasRenderingContext2D, 'measureText'>, text: string, maxW: number, maxLines: number): string[] {
  const fits = (t: string) => g.measureText(t).width <= maxW
  const lines: string[] = []
  for (const para of text.replace(/\r\n?/g, '\n').split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (fits(next)) {
        line = next
        continue
      }
      if (line) lines.push(line)
      // A word longer than the line: hard break.
      let rest = word
      while (!fits(rest)) {
        let k = rest.length - 1
        while (k > 1 && !fits(rest.slice(0, k))) k -= 1
        lines.push(rest.slice(0, k))
        rest = rest.slice(k)
      }
      line = rest
    }
    lines.push(line)
  }
  while (lines.length > 1 && !lines[lines.length - 1]) lines.pop()
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]
  while (last && !fits(`${last}…`)) last = last.slice(0, -1)
  kept[maxLines - 1] = `${last.trimEnd()}…`
  return kept
}

/** Rounded badge (fill + optional border + centred text) left-aligned at x, centred on cy; returns its width. */
function drawBadge(g: CanvasRenderingContext2D, x: number, cy: number, text: string, style: BadgeStyle, size = 18) {
  g.font = font(size, 700)
  const w = g.measureText(text).width + size * 1.2
  const h = size + 12
  g.fillStyle = style.bg
  g.beginPath()
  if (typeof g.roundRect === 'function') g.roundRect(x, cy - h / 2, w, h, h / 2)
  else g.rect(x, cy - h / 2, w, h)
  g.fill()
  if (style.border) {
    g.strokeStyle = style.border
    g.lineWidth = 1.5
    g.stroke()
  }
  g.fillStyle = style.fg
  g.textAlign = 'center'
  g.fillText(text, x + w / 2, cy + 1)
  g.textAlign = 'left'
  return w
}

/** Zones a layout draws (major areas and sub-zones). */
const drawnZones = (l: RelocationLayout) => new Set([...l.areas, ...l.subAreas].map((a) => a.code))

interface TrayChip {
  code: string
  color: string
  suffix?: string
}

/**
 * PNG (Blob) of a relocation request, drawn from data (no DOM / screen capture), always in English: header (route,
 * badges, reason), Before / After maps side by side with their trays, legend of what is shown, machine table, footer.
 * 2400 px wide; the height is exactly the content plus a 40 px bottom margin.
 */
export async function exportRelocationPng(input: RelocationExportInput, deps: ExportDeps = browserDeps): Promise<Blob> {
  const started = performance.now()
  const blob = await drawRelocationPng(input, deps)
  console.debug(`[relocation] PNG ${input.request.id}: ${(performance.now() - started).toFixed(0)} ms, ${blob.size} bytes`)
  return blob
}

async function drawRelocationPng(input: RelocationExportInput, deps: ExportDeps): Promise<Blob> {
  const ctx = input.ctx ?? DEFAULT_CONTEXT
  const now = (deps.now ?? (() => new Date()))()
  const { width: Wc, pad, gap } = EXPORT
  const innerW = Wc - pad * 2
  const mapW = (innerW - gap) / 2
  const { rows, target } = input
  const r = input.request
  const layouts = input.layouts ?? FLOORS

  // Maps: SVG markup -> image (drawing embedded as data URL).
  const mapImage = async (role: 'before' | 'after', layout: RelocationLayout | null) => {
    if (!layout) return null
    const href = await deps.toDataUrl(layout.imageData)
    return deps.loadImage(svgDataUrl(renderExportSvg(input, role, layout, href, { w: mapW, h: EXPORT.mapMaxH })))
  }
  const [beforeImg, afterImg] = await Promise.all([mapImage('before', input.beforeLayout), mapImage('after', input.afterLayout)])
  if (typeof document !== 'undefined') await document.fonts?.ready

  const canvas = deps.createCanvas(Wc, 100)
  const g = canvas.getContext('2d')
  if (!g) throw new Error('Canvas 2D is not available')

  // ---- Content (computed first: the canvas height follows it).
  const n = rows.length
  const toPlace = `${placeOf(input.afterLayout, targetFac(target, ctx))} / ${target.zone}`
  const fromPlace = (row: ExportRow) => {
    const id = rowLayoutId(row, ctx.index)
    const layout = layouts.find((l) => l.id === id) ?? null
    return `${placeOf(layout, rowFac(row, ctx), row.floor)} / ${row.currentZone ?? '-'}`
  }
  const types = rows.map((row) => moveTypeOf(row, target, ctx))
  const kinds = (['building', 'floor', 'same'] as const).filter((k) => types.includes(k))
  const routeBadges: MoveType[] = kinds.length ? kinds : ['none']

  const reasonLabel = 'Reason / Note: '
  g.font = font(22, 700)
  const reasonLabelW = g.measureText(reasonLabel).width
  g.font = font(22)
  const reasonLines = wrapText(g, (r.reason ?? '').trim() || '-', innerW - reasonLabelW, EXPORT.reasonMaxLines)

  // Map height: the taller fitted map (capped), or a placeholder box when neither is drawn.
  const fittedH = (img: CanvasImageSource | null) => {
    if (!img) return 0
    const iw = (img as { width: number }).width || mapW
    const ih = (img as { height: number }).height || EXPORT.mapMaxH
    return ih * Math.min(mapW / iw, EXPORT.mapMaxH / ih)
  }
  const mapH = Math.ceil(Math.max(fittedH(beforeImg), fittedH(afterImg)) || EXPORT.placeholderH)

  // Trays: zones of the rows / destination that the drawing does not show.
  const beforeTray: TrayChip[] = input.beforeLayout ? buildTray(input.beforeLayout, rows, ctx).map((t) => ({ code: t.code, color: FOCUS.from.color })) : []
  const afterTray: TrayChip[] = []
  if (input.afterLayout) {
    const drawn = drawnZones(input.afterLayout)
    for (const t of buildTray(input.afterLayout, rows, ctx)) if (t.code !== target.zone) afterTray.push({ code: t.code, color: FOCUS.old.color, suffix: ' (old)' })
    if (target.layoutId === input.afterLayout.id && !drawn.has(target.zone)) afterTray.push({ code: target.zone, color: MAP.relocTo })
  } else {
    afterTray.push({ code: target.zone, color: MAP.relocTo })
  }
  g.font = font(18, 700)
  const chipW = (c: TrayChip) => g.measureText(`${c.code}${c.suffix ?? ''}`).width + 24
  const trayLabel = 'Zones not on the drawing:'
  const trayLines = (chips: readonly TrayChip[]) => {
    if (!chips.length) return 0
    g.font = font(18)
    let x = g.measureText(trayLabel).width + 12
    let lines = 1
    g.font = font(18, 700)
    for (const c of chips) {
      const w = chipW(c)
      if (x + w > mapW && x > 0) {
        lines += 1
        x = 0
      }
      x += w + 8
    }
    return lines
  }
  const trayH = Math.max(trayLines(beforeTray), trayLines(afterTray)) * EXPORT.trayLineH

  // Legend: only what the image shows.
  const onLayout = (l: RelocationLayout | null) => {
    if (!l) return false
    const drawn = drawnZones(l)
    return rows.some((row) => row.currentZone && row.matchLevel !== 'NONE' && rowLayoutId(row, ctx.index) === l.id && drawn.has(row.currentZone))
  }
  const crossShown = rows.some((row) => {
    const id = rowLayoutId(row, ctx.index)
    return id !== null && id !== target.layoutId
  })
  const legend = [
    onLayout(input.beforeLayout) && { key: 'current', label: 'Current location', fill: FOCUS.from.color, alpha: 1, dash: false, stroke: FOCUS.from.color },
    onLayout(input.afterLayout) && { key: 'old', label: 'Old location', fill: FOCUS.old.color, alpha: FOCUS.old.fill, dash: true, stroke: FOCUS.old.stroke },
    input.afterLayout && drawnZones(input.afterLayout).has(target.zone) && { key: 'new', label: 'New location', fill: MAP.relocTo, alpha: FOCUS.to.fill, dash: false, stroke: FOCUS.to.stroke },
    crossShown && { key: 'cross', label: 'From/To another building', fill: MAP.relocCross, alpha: 0.28, dash: false, stroke: MAP.relocCross },
  ].filter((x): x is Exclude<typeof x, false | null | undefined | ''> => Boolean(x))

  const mismatch = rows.some((row) => row.floorMismatch)

  // ---- Vertical layout.
  let y = pad
  const titleY = y + EXPORT.titleH / 2
  y += EXPORT.titleH
  const metaY = y + EXPORT.metaH / 2
  y += EXPORT.metaH
  const routeY = y + EXPORT.routeH / 2
  y += EXPORT.routeH
  const reasonTop = y
  y += reasonLines.length * EXPORT.reasonLineH + EXPORT.sectionGap
  const mapTitleY = y + EXPORT.mapTitleH / 2
  y += EXPORT.mapTitleH
  const mapTop = y
  y += mapH
  const trayTop = y
  y += trayH
  const legendY = y + EXPORT.legendH / 2
  if (legend.length) y += EXPORT.legendH
  else y += EXPORT.sectionGap
  const tableTop = y
  y += EXPORT.rowH * (n + 1)
  const noteY = y + EXPORT.noteH / 2
  if (mismatch) y += EXPORT.noteH
  y += EXPORT.sectionGap
  const footerY = y + EXPORT.footerH / 2
  y += EXPORT.footerH
  const height = Math.ceil(y + pad)

  // Setting the size resets the context state.
  canvas.width = Wc
  canvas.height = height
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, Wc, height)
  g.textBaseline = 'middle'
  g.textAlign = 'left'
  const ink = '#0f172a'
  const muted = '#475569'

  // ---- Header.
  g.fillStyle = ink
  g.font = font(40, 800)
  g.fillText(`Machine Relocation Request ${r.id}`, pad, titleY)
  g.font = font(24)
  g.fillStyle = muted
  g.fillText(
    [
      `Created: ${stampOf(r.createdAt, now)}`,
      `Requested by: ${r.requestedBy || '-'}`,
      `Planned move: ${formatRequestDate(r.plannedMoveDate, false)}`,
      `Planned completion: ${formatRequestDate(r.plannedDoneDate, false)}`,
    ].join('   ·   '),
    pad,
    metaY,
  )
  g.font = font(30, 700)
  g.fillStyle = ink
  const route = `${n} ${n === 1 ? 'machine' : 'machines'} → ${toPlace}`
  g.fillText(route, pad, routeY)
  let bx = pad + g.measureText(route).width + 20
  for (const k of routeBadges) bx += drawBadge(g, bx, routeY, MOVE_LABELS[k], ROUTE_BADGE[k], 20) + 10
  reasonLines.forEach((line, i) => {
    const ly = reasonTop + EXPORT.reasonLineH * (i + 0.5)
    if (i === 0) {
      g.font = font(22, 700)
      g.fillStyle = ink
      g.fillText(reasonLabel, pad, ly)
    }
    g.font = font(22)
    g.fillStyle = ink
    g.fillText(line, pad + reasonLabelW, ly)
  })

  // ---- Maps (+ trays).
  const drawMap = (img: CanvasImageSource | null, x: number, title: string, color: string, tray: readonly TrayChip[]) => {
    g.fillStyle = color
    g.fillRect(x, mapTitleY - 8, 16, 16)
    g.fillStyle = ink
    g.font = font(24, 700)
    g.fillText(fitText(g, title, mapW - 28), x + 26, mapTitleY)
    g.strokeStyle = '#cbd5e1'
    g.lineWidth = 2
    g.strokeRect(x, mapTop, mapW, mapH)
    if (!img) {
      g.fillStyle = muted
      g.font = font(22)
      g.textAlign = 'center'
      g.fillText('Zone not on the drawing', x + mapW / 2, mapTop + mapH / 2)
      g.textAlign = 'left'
    } else {
      const iw = (img as { width: number }).width || mapW
      const ih = (img as { height: number }).height || mapH
      const s = Math.min(mapW / iw, mapH / ih)
      g.drawImage(img, x + (mapW - iw * s) / 2, mapTop + (mapH - ih * s) / 2, iw * s, ih * s)
    }
    if (!tray.length) return
    let tx = x
    let ty = trayTop + EXPORT.trayLineH / 2
    g.font = font(18)
    g.fillStyle = muted
    g.fillText(trayLabel, tx, ty)
    tx += g.measureText(trayLabel).width + 12
    for (const c of tray) {
      g.font = font(18, 700)
      const w = chipW(c)
      if (tx + w > x + mapW && tx > x) {
        tx = x
        ty += EXPORT.trayLineH
      }
      g.globalAlpha = 0.1
      g.fillStyle = c.color
      g.fillRect(tx, ty - 14, w, 28)
      g.globalAlpha = 1
      g.strokeStyle = c.color
      g.lineWidth = 1.5
      g.setLineDash([4, 3])
      g.strokeRect(tx, ty - 14, w, 28)
      g.setLineDash([])
      g.fillStyle = c.color
      g.fillText(`${c.code}${c.suffix ?? ''}`, tx + 12, ty + 1)
      tx += w + 8
    }
  }
  const beforePlace = placeOf(input.beforeLayout, rows[0] ? rowFac(rows[0], ctx) : null)
  drawMap(beforeImg, pad, `Before · ${beforePlace}`, MAP.relocFrom, beforeTray)
  drawMap(afterImg, pad + mapW + gap, `After · ${toPlace}`, MAP.relocTo, afterTray)

  // ---- Legend.
  let lx = pad
  g.font = font(20)
  for (const item of legend) {
    g.globalAlpha = item.alpha
    g.fillStyle = item.fill
    g.fillRect(lx, legendY - 11, 32, 22)
    g.globalAlpha = 1
    g.strokeStyle = item.stroke
    g.lineWidth = 2
    g.setLineDash(item.dash ? [6, 4] : [])
    g.strokeRect(lx, legendY - 11, 32, 22)
    g.setLineDash([])
    g.fillStyle = muted
    g.fillText(item.label, lx + 42, legendY)
    lx += 42 + g.measureText(item.label).width + 40
  }

  // ---- Machine table: Code | Name | From → To | Type.
  const share = EXPORT.cols
  const widths = [share.code, share.name, share.fromTo, share.type].map((s) => innerW * s)
  const xs = widths.map((_, i) => pad + widths.slice(0, i).reduce((a, b) => a + b, 0))
  g.fillStyle = '#f1f5f9'
  g.fillRect(pad, tableTop, innerW, EXPORT.rowH)
  g.fillStyle = ink
  g.font = font(20, 700)
  ;['Code', 'Name', 'From → To', 'Type'].forEach((title, i) => g.fillText(title, xs[i] + 10, tableTop + EXPORT.rowH / 2))
  rows.forEach((row, i) => {
    const top = tableTop + EXPORT.rowH * (i + 1)
    const cy = top + EXPORT.rowH / 2
    g.strokeStyle = '#e2e8f0'
    g.lineWidth = 1
    g.beginPath()
    g.moveTo(pad, top + EXPORT.rowH)
    g.lineTo(pad + innerW, top + EXPORT.rowH)
    g.stroke()
    g.font = font(20)
    g.fillStyle = ink
    const fromTo = `${fromPlace(row)} → ${toPlace}${row.floorMismatch ? ' ⚠' : ''}`
    ;[row.code, row.name ?? '', fromTo].forEach((text, k) => g.fillText(fitText(g, text, widths[k] - 20), xs[k] + 10, cy))
    const type = types[i]
    g.font = font(16, 700)
    const label = fitText(g, MOVE_LABELS[type], widths[3] - 40)
    drawBadge(g, xs[3] + 10, cy, label, TABLE_BADGE[type], 16)
  })
  if (mismatch) {
    g.font = font(18)
    g.fillStyle = muted
    g.fillText('⚠ The asset floor in the data differs from the floor of its zone on the drawing.', pad, noteY)
  }

  // ---- Footer.
  g.font = font(16)
  g.fillStyle = '#94a3b8'
  g.fillText(`Generated by Fixed Asset System · ${localStamp(now)}`, pad, footerY)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the PNG'))), 'image/png')
  })
}

/** Saves a Blob as a file (the "Download PNG" button). */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
