// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Profiler, useCallback, useMemo, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FLOORS } from '../../data/mapData'
import { RelocationFloorMap, resetTextMeasure } from '../relocation/RelocationFloorMap'
import { createScrollSync, MapScene, SCROLL_IDLE_MS, type MapView } from './MapScene'

beforeEach(() => {
  resetTextMeasure()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => ({ font: '', measureText: (t: string) => ({ width: t.length * 7 }) }) as unknown as CanvasRenderingContext2D,
  )
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** jsdom has no layout: give each viewport a scrollable range (2000x1500 content in a 500x400 box). */
function sizeViewports() {
  const els = screen.getAllByTestId('map-viewport')
  for (const el of els) {
    Object.defineProperty(el, 'scrollWidth', { value: 2000, configurable: true })
    Object.defineProperty(el, 'clientWidth', { value: 500, configurable: true })
    Object.defineProperty(el, 'scrollHeight', { value: 1500, configurable: true })
    Object.defineProperty(el, 'clientHeight', { value: 400, configurable: true })
  }
  return els
}
const userScroll = (el: HTMLElement, left: number, top: number) => {
  el.scrollLeft = left
  el.scrollTop = top
  fireEvent.scroll(el)
}
const frame = () => act(() => vi.advanceTimersByTime(16))

describe('MapScene scroll sync (no React state)', () => {
  it('scrolling map A moves map B by fraction, and B does not bounce back to A', async () => {
    const group = createScrollSync()
    const onViewChange = vi.fn()
    render(
      <>
        <MapScene lang="vi" title="A" imageData="a.png" imgW={100} imgH={50} scrollSync={group} view={{ zoomIndex: 0, scrollX: 0, scrollY: 0 }} onViewChange={onViewChange} />
        <MapScene lang="vi" title="B" imageData="b.png" imgW={100} imgH={50} scrollSync={group} view={{ zoomIndex: 0, scrollX: 0, scrollY: 0 }} onViewChange={onViewChange} />
      </>,
    )
    const [a, b] = sizeViewports()
    userScroll(a, 750, 550) // 50% / 50%
    await frame()
    expect(b.scrollLeft).toBe(750)
    expect(b.scrollTop).toBe(550)
    // The scroll event caused by the sync is ignored: A is not written back (loop guard).
    const setA = vi.spyOn(a, 'scrollLeft', 'set')
    fireEvent.scroll(b)
    await frame()
    expect(setA).not.toHaveBeenCalled()
    // A real user scroll on B is synced to A again.
    setA.mockRestore()
    userScroll(b, 1500, 1100)
    await frame()
    expect(a.scrollLeft).toBe(1500)
  })

  it('onViewChange: once after the scroll stops, not per scroll event', async () => {
    const onViewChange = vi.fn()
    render(<MapScene lang="vi" title="A" imageData="a.png" imgW={100} imgH={50} onViewChange={onViewChange} />)
    const [a] = sizeViewports()
    for (let i = 1; i <= 20; i++) {
      userScroll(a, i * 10, 0)
      await frame()
    }
    expect(onViewChange).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(SCROLL_IDLE_MS))
    expect(onViewChange).toHaveBeenCalledTimes(1)
    expect(onViewChange.mock.calls[0][0]).toMatchObject({ zoomIndex: 0, scrollX: 200 / 1500 })
  })

  it('"is-scrolling" while scrolling pauses animations, removed 150ms after the last scroll event', () => {
    render(
      <MapScene lang="vi" title="A" imageData="a.png" imgW={100} imgH={50}>
        <span data-testid="anim" style={{ animation: 'x 1s infinite' }} />
      </MapScene>,
    )
    const [a] = sizeViewports()
    const root = a.closest('.map-scene-root')!
    userScroll(a, 100, 0)
    expect(root.classList).toContain('is-scrolling')
    expect(getComputedStyle(screen.getByTestId('anim')).animationPlayState).toBe('paused')
    act(() => vi.advanceTimersByTime(SCROLL_IDLE_MS - 10))
    expect(root.classList).toContain('is-scrolling')
    act(() => vi.advanceTimersByTime(20))
    expect(root.classList).not.toContain('is-scrolling')
    expect(getComputedStyle(screen.getByTestId('anim')).animationPlayState).not.toBe('paused')
  })
})

describe('RelocationFloorMap while scrolling', () => {
  const layout = FLOORS[0]
  /** Same wiring as RelocationTab: shared zoom state, live scroll through the sync group. */
  function TwoMaps({ onRender }: { onRender: () => void }) {
    const [zoom, setZoom] = useState(0)
    const onViewChange = useCallback((v: MapView) => setZoom(v.zoomIndex), [])
    const scrollSync = useMemo(() => createScrollSync(), [])
    const view = useMemo(() => ({ zoomIndex: zoom, scrollX: 0, scrollY: 0 }), [zoom])
    return (
      <Profiler id="maps" onRender={onRender}>
        <RelocationFloorMap lang="vi" layout={layout} role="before" rows={[]} target={null} view={view} onViewChange={onViewChange} scrollSync={scrollSync} />
        <RelocationFloorMap lang="vi" layout={layout} role="after" rows={[]} target={null} view={view} onViewChange={onViewChange} scrollSync={scrollSync} />
      </Profiler>
    )
  }

  it('about 0 renders for 1s of scrolling (60 events) with sync on; the other map follows', async () => {
    let renders = 0
    render(<TwoMaps onRender={() => renders++} />)
    const [a, b] = sizeViewports()
    renders = 0
    for (let i = 1; i <= 60; i++) {
      userScroll(a, i * 20, i * 15)
      await frame()
    }
    act(() => vi.advanceTimersByTime(SCROLL_IDLE_MS * 2))
    expect(renders).toBe(0)
    expect(b.scrollLeft).toBe(1200)
  })

  it('zoom is still shared state: zooming one map zooms both', () => {
    render(<TwoMaps onRender={() => {}} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Phóng to' })[0])
    expect(screen.getAllByText('125%')).toHaveLength(2)
  })
})
