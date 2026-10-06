// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { FLOORS } from '../../data/mapData'

/** The map PNGs as base64 data URLs (Vite inlines them; no Node fs in the browser test env). */
const PNGS = import.meta.glob<string>('../../assets/maps/*.png', { query: '?inline', import: 'default', eager: true })
const fileOf = (path: string) => path.split('/').pop()!.split('?')[0]
const DATA = new Map(Object.entries(PNGS).map(([path, url]) => [fileOf(path), url]))

/** Width / height from the PNG IHDR chunk (bytes 16-23, big-endian). */
function pngSize(file: string) {
  const url = DATA.get(file)
  expect(url, file).toBeTruthy()
  const bin = atob(url!.slice(url!.indexOf(',') + 1, url!.indexOf(',') + 1 + 44))
  expect(bin.slice(1, 4)).toBe('PNG')
  const u32 = (o: number) => ((bin.charCodeAt(o) << 24) | (bin.charCodeAt(o + 1) << 16) | (bin.charCodeAt(o + 2) << 8) | bin.charCodeAt(o + 3)) >>> 0
  return { w: u32(16), h: u32(20) }
}

describe('3D drawings', () => {
  it('every original has a -3d.png of exactly the same size (and FLOORS imgW/imgH match)', () => {
    const originals = [...DATA.keys()].filter((f) => !f.endsWith('-3d.png'))
    expect(originals).toHaveLength(5)
    for (const f of originals) expect(pngSize(f.replace('.png', '-3d.png'))).toEqual(pngSize(f))
    for (const l of FLOORS) {
      expect(l.imageData3d).toMatch(/-3d\.png/)
      expect(pngSize(fileOf(l.imageData))).toEqual({ w: l.imgW, h: l.imgH })
    }
  })
})
