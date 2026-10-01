// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FLOORS } from '../data/mapData'
import { resetTextMeasure } from '../components/relocation/RelocationFloorMap'
import type { AssetLocation } from '../types/location'
import { DEFAULT_CONTEXT } from './relocation'
import { EXPORT, exportRelocationPng, renderExportSvg, snapshotExportInput, type ExportDeps, type RelocationExportInput } from './exportRelocationPng'
import type { RelocationRequest } from '../types/relocation'

const IMG = 'data:image/png;base64,iVBORw0KGgo='
const row = (code: string, name: string, zone: string) =>
  ({ code, name, currentZone: zone, positionA: zone.split('-')[0], floor: '1F', matchLevel: 'EXACT' }) as unknown as AssetLocation

const floor1 = FLOORS.find((l) => l.id === 'floor1')!
const input: RelocationExportInput = {
  lang: 'vi',
  request: { id: 'RL-2026-0001', requestedBy: 'E001', plannedMoveDate: '2026-10-05', plannedDoneDate: '2026-10-31', createdAt: '2026-10-01T09:15:00' },
  rows: [row('A-006-1', 'Máy dập thủy lực', 'A2-3')],
  target: { layoutId: 'floor1', zone: 'A3-1' },
  beforeLayout: floor1,
  afterLayout: floor1,
  ctx: DEFAULT_CONTEXT,
}

/** Fake 2D context: records drawn text; 10px per character. */
function fakeCanvas() {
  const texts: string[] = []
  const images: unknown[] = []
  const g = new Proxy(
    { fillText: (t: string) => texts.push(t), measureText: (t: string) => ({ width: t.length * 10 }), drawImage: (img: unknown) => images.push(img) } as Record<string, unknown>,
    { get: (target, key: string) => (key in target ? target[key] : () => {}), set: () => true },
  )
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => g,
    toBlob: (cb: (b: Blob | null) => void, type: string) => cb(new Blob(['\x89PNG'], { type })),
  } as unknown as HTMLCanvasElement
  return { canvas, texts, images }
}

function deps(canvas: HTMLCanvasElement): ExportDeps & { loaded: string[] } {
  const loaded: string[] = []
  return {
    loaded,
    toDataUrl: vi.fn(async () => IMG),
    loadImage: vi.fn(async (src: string) => {
      loaded.push(src)
      return { width: 1100, height: 600 } as unknown as CanvasImageSource
    }),
    createCanvas: vi.fn(() => canvas),
  }
}

beforeEach(() => {
  resetTextMeasure()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => ({ font: '', measureText: (t: string) => ({ width: t.length * 7 }) }) as unknown as CanvasRenderingContext2D,
  )
})
afterEach(() => vi.restoreAllMocks())

describe('exportRelocationPng', () => {
  it('returns a PNG Blob of about 2400 x 1100 drawn from data (header, both maps, legend, machine table)', async () => {
    const { canvas, texts, images } = fakeCanvas()
    const d = deps(canvas)
    const blob = await exportRelocationPng(input, d)
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('image/png')
    expect(canvas.width).toBe(EXPORT.width)
    expect(canvas.height).toBe(EXPORT.minHeight)
    const all = texts.join('\n')
    expect(all).toContain('Yêu cầu di dời máy RL-2026-0001')
    expect(all).toContain('Ngày tạo: 01/10/2026')
    expect(all).toContain('Người yêu cầu: E001')
    expect(all).toContain('Ngày dự kiến: 05/10/2026')
    expect(all).toContain('Hoàn thành: 31/10/2026')
    expect(texts.some((t) => /^1 máy → .* \/ 1F \/ A3-1$/.test(t))).toBe(true)
    expect(all).toContain('Vị trí hiện tại')
    expect(all).toContain('Vị trí cũ')
    expect(all).toContain('Máy dập thủy lực')
    expect(all).toContain('A2-3 → A3-1')
    // Two maps, each an SVG with the drawing embedded as a data URL.
    expect(images).toHaveLength(2)
    expect(d.loaded).toHaveLength(2)
    for (const src of d.loaded) {
      expect(src.startsWith('data:image/svg+xml')).toBe(true)
      expect(decodeURIComponent(src)).toContain(`href="${IMG}"`)
    }
    expect(d.toDataUrl).toHaveBeenCalledWith(floor1.imageData)
  })

  it('logs the export time (performance.now) with console.debug', async () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const now = vi.spyOn(performance, 'now')
    await exportRelocationPng(input, deps(fakeCanvas().canvas))
    expect(now).toHaveBeenCalled()
    expect(debug).toHaveBeenCalledWith(expect.stringMatching(/^\[relocation\] PNG RL-2026-0001: \d+ ms, \d+ bytes$/))
  })

  it('grows with the machine table', async () => {
    const { canvas } = fakeCanvas()
    const many = Array.from({ length: 30 }, (_, i) => row(`A-${100 + i}`, `Máy ${i}`, 'A2-3'))
    await exportRelocationPng({ ...input, rows: many }, deps(canvas))
    expect(canvas.height).toBeGreaterThan(EXPORT.minHeight)
  })

  it('a destination not drawn on any layout: placeholder instead of the After map', async () => {
    const { canvas, texts, images } = fakeCanvas()
    await exportRelocationPng({ ...input, afterLayout: null }, deps(canvas))
    expect(images).toHaveLength(1)
    expect(texts).toContain('Zone không có trên bản vẽ')
  })

  it('rejects when the canvas cannot encode', async () => {
    const { canvas } = fakeCanvas()
    ;(canvas as unknown as { toBlob: (cb: (b: Blob | null) => void) => void }).toBlob = (cb) => cb(null)
    await expect(exportRelocationPng(input, deps(canvas))).rejects.toThrow('Could not encode the PNG')
  })
})

describe('snapshotExportInput', () => {
  const snapshot: RelocationRequest = {
    id: 'RL-2026-0007',
    items: [
      { code: 'A-006-1', name: '', fromZone: 'A1-1', fromFloor: null, moveType: null, fromPositionA: 'A1', toZone: 'A3-1' },
      { code: 'A-009-9', name: '', fromZone: 'A7', fromFloor: null, moveType: null, fromPositionA: 'A7', toZone: 'A3-1' },
    ],
    to: { layoutId: 'floor1', zone: 'A3-1' },
    requestedBy: 'E777',
    plannedMoveDate: '2026-11-02',
    plannedDoneDate: '2026-11-09',
    reason: 'x',
    status: 'REQ_PENDING_PE',
    createdAt: '2026-10-20T08:00:00',
  }

  it('uses only the snapshot: from = *_BF, to = *_AT, dates and creator; names from the lookup', () => {
    const out = snapshotExportInput(snapshot, { lang: 'vi', layouts: FLOORS, names: new Map([['A-006-1', 'Máy dập']]) })
    expect(out.rows).toEqual([
      expect.objectContaining({ code: 'A-006-1', name: 'Máy dập', currentZone: 'A1-1', positionA: 'A1', floor: '1F', matchLevel: 'SUB' }),
      expect.objectContaining({ code: 'A-009-9', name: null, currentZone: 'A7', positionA: 'A7', matchLevel: 'MAJOR' }),
    ])
    expect(out.target).toEqual({ layoutId: 'floor1', zone: 'A3-1' })
    expect(out.beforeLayout?.id).toBe('floor1')
    expect(out.afterLayout?.id).toBe('floor1')
    expect(out.request).toBe(snapshot)
  })

  it('a destination not drawn on any layout: no After layout', () => {
    const out = snapshotExportInput({ ...snapshot, to: { layoutId: null, zone: 'Z99' }, items: snapshot.items.map((i) => ({ ...i, toZone: 'Z99' })) }, { lang: 'en', layouts: FLOORS })
    expect(out.afterLayout).toBeNull()
    expect(out.target.zone).toBe('Z99')
  })
})

describe('renderExportSvg (RelocationFloorMap export mode)', () => {
  it('standalone SVG: fixed size, embedded drawing, inline from / to / old styles, Vietnamese captions', () => {
    const before = renderExportSvg(input, 'before', floor1, IMG, { w: 1140, h: 620 })
    expect(before.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(before).toMatch(/width="\d+" height="\d+"/)
    expect(before).toContain(`href="${IMG}"`)
    expect(before).toContain('data-state="from"')
    expect(before).not.toContain('class="reloc-zone')
    const after = renderExportSvg(input, 'after', floor1, IMG, { w: 1140, h: 620 })
    expect(after).toContain('data-state="to"')
    expect(after).toContain('data-state="old"')
    expect(after).toContain('A-006-1 (cũ)')
    // Old zone: pale amber fill, amber dashed stroke (same tokens as the live map).
    expect(after).toMatch(/data-zone="A2-3" data-state="old">[^]*?fill="rgba\(183, 121, 31, 0\.25\)"[^]*?stroke="#b7791f"[^]*?stroke-dasharray="6 4"/)
  })

  it('fits the scene into the box (rotated Mold layout included)', () => {
    for (const layout of FLOORS) {
      const svg = renderExportSvg({ ...input, rows: [] }, 'before', layout, IMG, { w: 1140, h: 620 })
      const [, w, h] = /width="(\d+)" height="(\d+)"/.exec(svg)!.map(Number)
      expect(w).toBeLessThanOrEqual(1141)
      expect(h).toBeLessThanOrEqual(621)
    }
  })
})
