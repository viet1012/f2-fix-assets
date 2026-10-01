import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { facLabel } from '../config/relocation'
import { EXPORT_FONT, FOCUS, RelocationFloorMap, type RelocationLayout } from '../components/relocation/RelocationFloorMap'
import { sceneRotation } from '../components/map/MapScene'
import type { Lang } from '../types/fixedAsset'
import type { AssetLocation } from '../types/location'
import type { RelocationRequest, RelocationTarget } from '../types/relocation'
import { tokens } from '../theme/palette'
import { DEFAULT_CONTEXT, rowFac, targetFac, type RelocationContext } from './relocation'
import { formatRequestDate, todayIso } from './relocationForm'
import { isMajorZone } from './relocationInput'
import { majorZone } from './zone'

const MAP = tokens.light

export type ExportRow = Pick<AssetLocation, 'code' | 'name' | 'currentZone' | 'positionA' | 'floor' | 'matchLevel'> & Partial<Pick<AssetLocation, 'mapFac'>>

export interface RelocationExportInput {
  lang: Lang
  request: Pick<RelocationRequest, 'id' | 'requestedBy' | 'plannedMoveDate' | 'plannedDoneDate' | 'createdAt'>
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
}

/** Canvas size (px) and layout of the PNG. */
export const EXPORT = {
  width: 2400,
  minHeight: 1100,
  pad: 40,
  gap: 40,
  headerH: 150,
  mapTitleH: 34,
  mapH: 620,
  legendH: 50,
  rowH: 32,
} as const

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

/** Scene width so that the (possibly rotated) layout fits in a box. */
function fitSceneWidth(layout: RelocationLayout, boxW: number, boxH: number) {
  const rad = (sceneRotation(layout.rotationDeg) * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  const vw = layout.imgW * cos + layout.imgH * sin
  const vh = layout.imgW * sin + layout.imgH * cos
  return layout.imgW * Math.min(boxW / vw, boxH / vh)
}

/** Standalone SVG markup of one map (RelocationFloorMap in export mode). */
export function renderExportSvg(input: RelocationExportInput, role: 'before' | 'after', layout: RelocationLayout, imageHref: string, box: { w: number; h: number }): string {
  const width = Math.floor(fitSceneWidth(layout, box.w, box.h))
  return renderToStaticMarkup(
    createElement(RelocationFloorMap, {
      lang: input.lang,
      layout,
      role,
      rows: input.rows,
      target: input.target,
      layouts: input.layouts,
      ctx: input.ctx ?? DEFAULT_CONTEXT,
      exportMode: { width, imageHref },
    }),
  )
}

const svgDataUrl = (markup: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`

/** "Toà A / 1F" of a layout + building. */
function placeOf(layout: RelocationLayout | null, fac: string | null, vi: boolean) {
  if (!layout) return fac ? facLabel(fac, vi) : '-'
  return `${fac ? facLabel(fac, vi) : (layout.title.split(' - ').pop() ?? layout.title)} / ${layout.dbFloor ?? '-'}`
}

function font(size: number, weight = 400) {
  return `${weight} ${size}px ${EXPORT_FONT}`
}

/** Text cut with "…" to fit maxW. */
function fitText(g: CanvasRenderingContext2D, text: string, maxW: number) {
  if (g.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && g.measureText(`${t}…`).width > maxW) t = t.slice(0, -1)
  return `${t}…`
}

/**
 * PNG (Blob) of a relocation request, drawn from data (no DOM / screen capture): header, Before / After maps side by
 * side, legend and the machine table. About 2400 x 1100 px; taller when the table needs it.
 */
export async function exportRelocationPng(input: RelocationExportInput, deps: ExportDeps = browserDeps): Promise<Blob> {
  const started = performance.now()
  const blob = await drawRelocationPng(input, deps)
  console.debug(`[relocation] PNG ${input.request.id}: ${(performance.now() - started).toFixed(0)} ms, ${blob.size} bytes`)
  return blob
}

async function drawRelocationPng(input: RelocationExportInput, deps: ExportDeps): Promise<Blob> {
  const vi = input.lang === 'vi'
  const ctx = input.ctx ?? DEFAULT_CONTEXT
  const { width: Wc, pad, gap } = EXPORT
  const mapW = (Wc - pad * 2 - gap) / 2
  const mapTop = pad + EXPORT.headerH + EXPORT.mapTitleH
  const legendTop = mapTop + EXPORT.mapH + 16
  const tableTop = legendTop + EXPORT.legendH
  const height = Math.max(EXPORT.minHeight, tableTop + EXPORT.rowH * (input.rows.length + 1) + pad)

  // Maps: SVG markup -> image (drawing embedded as data URL).
  const mapImage = async (role: 'before' | 'after', layout: RelocationLayout | null) => {
    if (!layout) return null
    const href = await deps.toDataUrl(layout.imageData)
    return deps.loadImage(svgDataUrl(renderExportSvg(input, role, layout, href, { w: mapW, h: EXPORT.mapH })))
  }
  const [beforeImg, afterImg] = await Promise.all([mapImage('before', input.beforeLayout), mapImage('after', input.afterLayout)])
  if (typeof document !== 'undefined') await document.fonts?.ready

  const canvas = deps.createCanvas(Wc, height)
  canvas.width = Wc
  canvas.height = height
  const g = canvas.getContext('2d')
  if (!g) throw new Error('Canvas 2D is not available')
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, Wc, height)
  g.textBaseline = 'middle'
  const ink = '#0f172a'
  const muted = '#475569'

  // Header.
  const r = input.request
  const firstFac = input.rows[0] ? rowFac(input.rows[0], ctx) : null
  const dest = `${placeOf(input.afterLayout, targetFac(input.target, ctx), vi)} / ${input.target.zone}`
  g.fillStyle = ink
  g.font = font(40, 800)
  g.fillText(`${vi ? 'Yêu cầu di dời máy' : 'Machine relocation request'} ${r.id}`, pad, pad + 22)
  g.font = font(24)
  g.fillStyle = muted
  const meta = [
    `${vi ? 'Ngày tạo' : 'Created'}: ${formatRequestDate(r.createdAt ?? todayIso(), vi)}`,
    `${vi ? 'Người yêu cầu' : 'Requested by'}: ${r.requestedBy || '-'}`,
    `${vi ? 'Ngày dự kiến' : 'Planned'}: ${formatRequestDate(r.plannedMoveDate, vi)}`,
    `${vi ? 'Hoàn thành' : 'Completion'}: ${formatRequestDate(r.plannedDoneDate, vi)}`,
  ].join('   ·   ')
  g.fillText(meta, pad, pad + 70)
  g.font = font(30, 700)
  g.fillStyle = ink
  const n = input.rows.length
  g.fillText(`${n} ${vi ? 'máy' : n === 1 ? 'machine' : 'machines'} → ${dest}`, pad, pad + 118)

  // Maps.
  const drawMap = (img: CanvasImageSource | null, x: number, title: string, color: string) => {
    g.fillStyle = color
    g.fillRect(x, mapTop - EXPORT.mapTitleH, 14, 14)
    g.fillStyle = ink
    g.font = font(24, 700)
    g.fillText(title, x + 24, mapTop - EXPORT.mapTitleH + 7)
    g.strokeStyle = '#cbd5e1'
    g.lineWidth = 2
    g.strokeRect(x, mapTop, mapW, EXPORT.mapH)
    if (!img) {
      g.fillStyle = muted
      g.font = font(22)
      g.textAlign = 'center'
      g.fillText(vi ? 'Zone không có trên bản vẽ' : 'Zone not on the drawing', x + mapW / 2, mapTop + EXPORT.mapH / 2)
      g.textAlign = 'left'
      return
    }
    const iw = (img as { width: number }).width || mapW
    const ih = (img as { height: number }).height || EXPORT.mapH
    const s = Math.min(mapW / iw, EXPORT.mapH / ih)
    g.drawImage(img, x + (mapW - iw * s) / 2, mapTop + (EXPORT.mapH - ih * s) / 2, iw * s, ih * s)
  }
  drawMap(beforeImg, pad, `${vi ? 'Trước' : 'Before'} · ${placeOf(input.beforeLayout, firstFac, vi)}`, MAP.relocFrom)
  drawMap(afterImg, pad + mapW + gap, `${vi ? 'Sau' : 'After'} · ${dest}`, MAP.relocTo)

  // Legend.
  const legend = [
    { label: vi ? 'Vị trí hiện tại' : 'Current location', fill: FOCUS.from.color, alpha: 1, dash: false, stroke: FOCUS.from.color },
    { label: vi ? 'Vị trí cũ' : 'Old location', fill: FOCUS.old.color, alpha: FOCUS.old.fill, dash: true, stroke: FOCUS.old.stroke },
    { label: vi ? 'Vị trí mới' : 'New location', fill: MAP.relocTo, alpha: 0.75, dash: false, stroke: FOCUS.to.stroke },
    { label: vi ? 'Từ/Sang toà khác' : 'From/To another building', fill: MAP.relocCross, alpha: 0.28, dash: false, stroke: MAP.relocCross },
  ]
  let lx = pad
  const ly = legendTop + EXPORT.legendH / 2 - 8
  g.font = font(20)
  for (const item of legend) {
    g.globalAlpha = item.alpha
    g.fillStyle = item.fill
    g.fillRect(lx, ly - 10, 32, 22)
    g.globalAlpha = 1
    g.strokeStyle = item.stroke
    g.lineWidth = 2
    g.setLineDash(item.dash ? [6, 4] : [])
    g.strokeRect(lx, ly - 10, 32, 22)
    g.setLineDash([])
    g.fillStyle = muted
    g.fillText(item.label, lx + 42, ly + 1)
    lx += 42 + g.measureText(item.label).width + 40
  }

  // Machine table: code, name, from -> to.
  const cols = [
    { title: vi ? 'Mã máy' : 'Code', x: pad, w: 280 },
    { title: vi ? 'Tên máy' : 'Name', x: pad + 300, w: 1100 },
    { title: vi ? 'Từ → Đến' : 'From → To', x: pad + 1420, w: Wc - pad * 2 - 1420 },
  ]
  g.fillStyle = '#f1f5f9'
  g.fillRect(pad, tableTop, Wc - pad * 2, EXPORT.rowH)
  g.fillStyle = ink
  g.font = font(20, 700)
  for (const c of cols) g.fillText(c.title, c.x + 8, tableTop + EXPORT.rowH / 2)
  g.font = font(20)
  input.rows.forEach((row, i) => {
    const y = tableTop + EXPORT.rowH * (i + 1)
    g.strokeStyle = '#e2e8f0'
    g.lineWidth = 1
    g.beginPath()
    g.moveTo(pad, y + EXPORT.rowH)
    g.lineTo(Wc - pad, y + EXPORT.rowH)
    g.stroke()
    g.fillStyle = ink
    const cells = [row.code, row.name ?? '', `${row.currentZone ?? '-'} → ${input.target.zone}`]
    cells.forEach((text, k) => g.fillText(fitText(g, text, cols[k].w - 16), cols[k].x + 8, y + EXPORT.rowH / 2))
  })

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
