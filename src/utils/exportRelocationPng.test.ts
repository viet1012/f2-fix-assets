// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FLOORS } from '../data/mapData'
import { resetTextMeasure } from '../components/relocation/RelocationFloorMap'
import type { AssetLocation } from '../types/location'
import { DEFAULT_CONTEXT, type RelocationContext } from './relocation'
import { EXPORT, exportRelocationPng, renderExportSvg, snapshotExportInput, wrapText, type ExportDeps, type RelocationExportInput } from './exportRelocationPng'
import type { RelocationRequest } from '../types/relocation'

const IMG = 'data:image/png;base64,iVBORw0KGgo='
const row = (code: string, name: string, zone: string, extra: Partial<AssetLocation> = {}) =>
  ({ code, name, currentZone: zone, positionA: zone.split('-')[0], floor: '1F', matchLevel: 'SUB', ...extra }) as unknown as AssetLocation

const floor1 = FLOORS.find((l) => l.id === 'floor1')!
const floor2 = FLOORS.find((l) => l.id === 'floor2')!
const floor2Zone = floor2.subAreas[0]?.code ?? floor2.areas[0].code
const ctx: RelocationContext = { ...DEFAULT_CONTEXT, zoneFac: new Map([['A2-3', 'Fac_A'], ['A2', 'Fac_A'], ['A3-1', 'Fac_A'], ['A1-1', 'Fac_A'], [floor2Zone, 'Fac_B']]) }
const REASON = 'Di dời để bố trí lại dây chuyền ép'
const input: RelocationExportInput = {
  lang: 'vi',
  request: { id: 'RL-2026-0001', requestedBy: 'E001', plannedMoveDate: '2026-10-05', plannedDoneDate: '2026-10-31', createdAt: '2026-10-01T09:15:00', reason: REASON },
  rows: [row('A-006-1', 'Máy dập thủy lực', 'A2-3')],
  target: { layoutId: 'floor1', zone: 'A3-1' },
  beforeLayout: floor1,
  afterLayout: floor1,
  layouts: FLOORS,
  ctx,
}

interface Drawn {
  text: string
  x: number
  y: number
}

/** Fake 2D context: records drawn text with its position; 10px per character. */
function fakeCanvas() {
  const drawn: Drawn[] = []
  const images: unknown[] = []
  const g = new Proxy(
    {
      fillText: (text: string, x: number, y: number) => drawn.push({ text, x, y }),
      measureText: (t: string) => ({ width: t.length * 10 }),
      drawImage: (img: unknown) => images.push(img),
    } as Record<string, unknown>,
    { get: (target, key: string) => (key in target ? target[key] : () => {}), set: () => true },
  )
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => g,
    toBlob: (cb: (b: Blob | null) => void, type: string) => cb(new Blob(['\x89PNG'], { type })),
  } as unknown as HTMLCanvasElement
  const texts = () => drawn.map((d) => d.text)
  return { canvas, drawn, texts, images }
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
    now: () => new Date(2026, 9, 1, 14, 5),
  }
}

async function run(over: Partial<RelocationExportInput> = {}) {
  const fake = fakeCanvas()
  const d = deps(fake.canvas)
  const blob = await exportRelocationPng({ ...input, ...over }, d)
  return { ...fake, d, blob }
}

beforeEach(() => {
  resetTextMeasure()
  vi.spyOn(console, 'debug').mockImplementation(() => {})
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => ({ font: '', measureText: (t: string) => ({ width: t.length * 7 }) }) as unknown as CanvasRenderingContext2D,
  )
})
afterEach(() => vi.restoreAllMocks())

describe('exportRelocationPng', () => {
  it('returns a PNG Blob, 2400 px wide, both maps as SVG with the drawing embedded', async () => {
    const { blob, canvas, images, d } = await run()
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('image/png')
    expect(canvas.width).toBe(EXPORT.width)
    expect(images).toHaveLength(2)
    expect(d.loaded).toHaveLength(2)
    for (const src of d.loaded) {
      expect(src.startsWith('data:image/svg+xml')).toBe(true)
      expect(decodeURIComponent(src)).toContain(`href="${IMG}"`)
    }
    expect(d.toDataUrl).toHaveBeenCalledWith(floor1.imageData)
    // The export always uses the original drawing, never the 3D variant.
    expect(d.toDataUrl).not.toHaveBeenCalledWith(floor1.imageData3d)
  })

  it('"Requested by" shows the requester name (English placeholder when unknown)', async () => {
    const { texts } = await run({ request: { ...input.request, requesterName: 'Nguyễn Trọng Ngữ' } })
    expect(texts().some((t) => t.includes('Requested by: Nguyễn Trọng Ngữ (E001)'))).toBe(true)
  })

  it('always English (lang="vi"): title, header fields, yyyy-MM-dd dates, buildings, Before / After, badges', async () => {
    const { texts, d } = await run()
    const all = texts()
    expect(all).toContain('Machine Relocation Request RL-2026-0001')
    expect(all).toContain('Created: 2026-10-01 09:15   ·   Requested by: Unknown name (E001)   ·   Planned move: 2026-10-05   ·   Planned completion: 2026-10-31')
    expect(all).toContain('1 machine → Building A / 1F / A3-1')
    expect(all).toContain('Before · Building A / 1F')
    expect(all).toContain('After · Building A / 1F / A3-1')
    expect(all.filter((t) => t === 'Same floor')).toHaveLength(2) // route badge + table badge
    expect(all.join('\n')).not.toMatch(/Yêu cầu|Ngày|Người|Toà|Trước|Sau ·|Vị trí|máy →|Cùng tầng/)
    // Map captions in English too.
    const after = decodeURIComponent(d.loaded[1])
    expect(after).toContain('A-006-1 (old)')
    expect(after).not.toContain('(cũ)')
  })

  it('"Created" falls back to the local clock when the request has no createdAt yet', async () => {
    const { texts } = await run({ request: { ...input.request, createdAt: null } })
    expect(texts().some((t) => t.startsWith('Created: 2026-10-01 14:05'))).toBe(true)
  })

  it('"Reason / Note:" with the reason as typed (Vietnamese kept)', async () => {
    const { texts } = await run()
    expect(texts()).toContain('Reason / Note: ')
    expect(texts()).toContain(REASON)
  })

  it('a long reason wraps to at most 4 lines, the last one cut with "…"', async () => {
    const long = Array.from({ length: 400 }, (_, i) => `từ${i}`).join(' ')
    const { drawn } = await run({ request: { ...input.request, reason: long } })
    const label = drawn.find((d) => d.text === 'Reason / Note: ')!
    const lines = drawn.filter((d) => d.text.startsWith('từ') && d.x > label.x)
    expect(lines).toHaveLength(EXPORT.reasonMaxLines)
    expect(lines[3].text.endsWith('…')).toBe(true)
    for (const l of lines) expect(l.text.length * 10).toBeLessThanOrEqual(EXPORT.width - EXPORT.pad * 2)
  })

  it('wrapText keeps line breaks, hard-breaks long words and cuts with "…"', () => {
    const g = { measureText: (t: string) => ({ width: t.length }) as TextMetrics }
    expect(wrapText(g, 'ab cd\nef', 5, 4)).toEqual(['ab cd', 'ef'])
    expect(wrapText(g, 'abcdefghij', 4, 4)).toEqual(['abcd', 'efgh', 'ij'])
    expect(wrapText(g, 'aa bb cc dd ee', 2, 3)).toEqual(['aa', 'bb', 'c…'])
  })

  it('legend: same layout -> current / old / new only (no "other building")', async () => {
    const { texts } = await run()
    const all = texts()
    expect(all).toEqual(expect.arrayContaining(['Current location', 'Old location', 'New location']))
    expect(all).not.toContain('From/To another building')
  })

  it('legend: other layout -> current / new / other building, no "old" (no old zone on the After map)', async () => {
    const { texts } = await run({ target: { layoutId: 'floor2', zone: floor2Zone }, afterLayout: floor2 })
    const all = texts()
    expect(all).toEqual(expect.arrayContaining(['Current location', 'New location', 'From/To another building']))
    expect(all).not.toContain('Old location')
  })

  it('machine table: Code | Name | From → To | Type at 12 / 38 / 38 / 12 %, full locations, Type badge', async () => {
    const { drawn, texts } = await run()
    const innerW = EXPORT.width - EXPORT.pad * 2
    const xs = ['Code', 'Name', 'From → To', 'Type'].map((t) => drawn.find((d) => d.text === t)!.x)
    const expected = [0, 0.12, 0.5, 0.88].map((s) => EXPORT.pad + innerW * s + 10)
    xs.forEach((x, i) => expect(x).toBeCloseTo(expected[i], 5))
    expect(texts()).toContain('Building A / 1F / A2-3 → Building A / 1F / A3-1')
    expect(texts()).toContain('Máy dập thủy lực')
    expect(texts()).toContain('A-006-1')
  })

  it('long names are cut with "…"; floorMismatch adds ⚠ and a note under the table', async () => {
    const { texts } = await run({ rows: [row('A-006-1', 'X'.repeat(300), 'A2-3', { floorMismatch: true, mapFloor: '2F' })] })
    const name = texts().find((t) => t.startsWith('XXX'))!
    expect(name.endsWith('…')).toBe(true)
    expect(name.length * 10).toBeLessThanOrEqual((EXPORT.width - EXPORT.pad * 2) * EXPORT.cols.name)
    expect(texts()).toContain('Building A / 1F / A2-3 → Building A / 1F / A3-1 ⚠')
    expect(texts().some((t) => t.startsWith('⚠ '))).toBe(true)
  })

  it('footer "Generated by Fixed Asset System · yyyy-MM-dd HH:mm"', async () => {
    const { texts } = await run()
    expect(texts()).toContain('Generated by Fixed Asset System · 2026-10-01 14:05')
  })

  it('height = content + 40 px bottom margin, and grows by exactly one row height per machine', async () => {
    const one = await run()
    const footer = one.drawn.find((d) => d.text.startsWith('Generated by'))!
    expect(one.canvas.height).toBe(Math.ceil(footer.y + EXPORT.footerH / 2 + EXPORT.pad))
    const maxY = Math.max(...one.drawn.map((d) => d.y))
    expect(maxY).toBe(footer.y)
    const four = await run({ rows: ['A-1', 'A-2', 'A-3', 'A-4'].map((c) => row(c, c, 'A2-3')) })
    expect(four.canvas.height - one.canvas.height).toBe(3 * EXPORT.rowH)
  })

  it('a destination not drawn on any layout: placeholder + tray chip with the zone', async () => {
    const { texts, images } = await run({ afterLayout: null, target: { layoutId: 'floor1', zone: 'Z99' } })
    expect(images).toHaveLength(1)
    expect(texts()).toContain('Zone not on the drawing')
    expect(texts()).toContain('Zones not on the drawing:')
    expect(texts()).toContain('Z99')
  })

  it('no tray when every zone is drawn', async () => {
    const { texts } = await run()
    expect(texts()).not.toContain('Zones not on the drawing:')
  })

  it('logs the export time (performance.now) with console.debug', async () => {
    const now = vi.spyOn(performance, 'now')
    await run()
    expect(now).toHaveBeenCalled()
    expect(console.debug).toHaveBeenCalledWith(expect.stringMatching(/^\[relocation\] PNG RL-2026-0001: \d+ ms, \d+ bytes$/))
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
    status: 'REQ_PENDING',
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
  it('standalone SVG: fixed size, embedded drawing, inline from / to / old styles', () => {
    const before = renderExportSvg(input, 'before', floor1, IMG, { w: 1140, h: 620 })
    expect(before.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(before).toMatch(/width="\d+" height="\d+"/)
    expect(before).toContain(`href="${IMG}"`)
    expect(before).toContain('data-state="from"')
    expect(before).not.toContain('class="reloc-zone')
    expect(before).not.toMatch(/zoom|reloc-zoom/i)
    const after = renderExportSvg(input, 'after', floor1, IMG, { w: 1140, h: 620 })
    expect(after).toContain('data-state="to"')
    expect(after).toContain('data-state="old"')
    // Old zone: pale amber fill, amber dashed stroke (same tokens as the live map).
    expect(after).toMatch(/data-zone="A2-3" data-state="old">[^]*?fill="rgba\(183, 121, 31, 0\.25\)"[^]*?stroke="#b7791f"[^]*?stroke-dasharray="6 4"/)
  })

  it('zone chips carry no machine count', () => {
    const svg = renderExportSvg(input, 'after', floor1, IMG, { w: 1140, h: 620 })
    expect(svg).toContain('>A3-1</text>')
    expect(svg).not.toMatch(/>[A-Z]\d+(-\d+)? · \d+</)
  })

  it('same-layout arrow: flat (lift <= 15% of the distance) and bowed downward', () => {
    const svg = renderExportSvg(input, 'after', floor1, IMG, { w: 1140, h: 620 })
    const m = /data-from="A2-3"><path d="M([\d.]+),([\d.]+) Q([\d.]+),([\d.]+) ([\d.]+),([\d.]+)"/.exec(svg)!
    const [x0, y0, cx, cy, x1, y1] = m.slice(1).map(Number)
    const px = (x: number, y: number) => ({ x: (x * floor1.imgW) / 100, y: (y * floor1.imgH) / 100 })
    const a = px(x0, y0)
    const c = px(cx, cy)
    const b = px(x1, y1)
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    // Distance of the control point to the chord: twice the curve's lift.
    const dist = Math.abs((b.x - a.x) * (a.y - c.y) - (a.x - c.x) * (b.y - a.y)) / len
    expect(dist / 2 / len).toBeLessThanOrEqual(0.15)
    expect(dist / len).toBeLessThanOrEqual(0.15)
    expect(c.y).toBeGreaterThanOrEqual((a.y + b.y) / 2)
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
