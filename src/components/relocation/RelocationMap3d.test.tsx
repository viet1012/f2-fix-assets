// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FLOORS } from '../../data/mapData'
import { useMapViewSettings } from '../../hooks/useMapViewSettings'
import { RelocationFloorMap, resetTextMeasure } from './RelocationFloorMap'
import { RelocationMapToolbar } from './RelocationMapToolbar'

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

beforeEach(() => {
  window.localStorage.clear()
  resetTextMeasure()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => ({ font: '', measureText: (t: string) => ({ width: t.length * 7 }) }) as unknown as CanvasRenderingContext2D,
  )
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

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

  it('toolbar "Ảnh 3D": off by default, saved to localStorage and read back', () => {
    function Harness() {
      const [settings, update] = useMapViewSettings()
      return <RelocationMapToolbar lang="vi" settings={settings} onChange={update} />
    }
    const view = render(<Harness />)
    const toggle = () => screen.getByRole('switch', { name: 'Ảnh 3D' }) as HTMLInputElement
    expect(toggle().checked).toBe(false)
    fireEvent.click(toggle())
    expect(JSON.parse(window.localStorage.getItem('f2.relocation.mapView')!)).toMatchObject({ image3d: true })
    view.unmount()
    render(<Harness />)
    expect(toggle().checked).toBe(true)
  })

  it('use3d: normal zones fill at 0.08 (0.14 otherwise); from / to keep their own fill', () => {
    const layout = FLOORS.find((f) => f.id === 'floor1')!
    const fillOf = (c: HTMLElement) => c.querySelector('.reloc-zone[data-zone="A1-1"]')!.getAttribute('fill')
    const { container, rerender } = render(<RelocationFloorMap lang="vi" layout={layout} role="after" rows={[]} target={null} use3d />)
    expect(fillOf(container)).toMatch(/0\.08\)$/)
    rerender(<RelocationFloorMap lang="vi" layout={layout} role="after" rows={[]} target={null} />)
    expect(fillOf(container)).toMatch(/0\.14\)$/)
    rerender(<RelocationFloorMap lang="vi" layout={layout} role="after" rows={[]} target={{ layoutId: 'floor1', zone: 'A1-1' }} use3d />)
    const to = container.querySelector<HTMLElement>('.reloc-zone[data-zone="A1-1"]')!
    expect(to.getAttribute('data-state')).toBe('to')
    expect(getComputedStyle(to).fill).not.toMatch(/0\.08\)$/)
  })

  it('use3d: the <img> shows the -3d file without grayscale; off: the original', () => {
    const layout = FLOORS.find((f) => f.id === 'floor1')!
    const { container, rerender } = render(<RelocationFloorMap lang="vi" layout={layout} role="after" rows={[]} target={null} use3d />)
    const img = () => container.querySelector('img')!
    expect(img().getAttribute('src')).toBe(layout.imageData3d)
    expect(getComputedStyle(img()).filter).not.toContain('grayscale')
    expect(getComputedStyle(img()).opacity).toBe('0.85')
    rerender(<RelocationFloorMap lang="vi" layout={layout} role="after" rows={[]} target={null} />)
    expect(img().getAttribute('src')).toBe(layout.imageData)
    expect(getComputedStyle(img()).filter).toContain('grayscale')
    expect(getComputedStyle(img()).opacity).toBe('0.6')
  })
})
