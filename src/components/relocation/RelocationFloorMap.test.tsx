// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { DEFAULT_MAP_VIEW, type MapView } from '../map/MapScene'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FLOORS, type LayoutId } from '../../data/mapData'
import { DEFAULT_CONTEXT } from '../../utils/relocation'
import { tokens, zonePalette } from '../../theme/palette'
import { AMBER, FOCUS, layoutLabels, measureTextWidth, RelocationFloorMap, resetTextMeasure, SLATE, type LabelBox, type RelocationLayout } from './RelocationFloorMap'

/** Buildings come from the API fac of each zone. */
const ctx = { ...DEFAULT_CONTEXT, zoneFac: new Map([['A2', 'Fac_A'], ['A2-3', 'Fac_A'], ['A5', 'Fac_A'], ['A5-3', 'Fac_A'], ['A15-3', 'Fac_B']]) }

afterEach(cleanup)

/** jsdom has no canvas: text is measured as 7px per character. */
const measureText = vi.fn((text: string) => ({ width: text.length * 7 }) as TextMetrics)
beforeEach(() => {
  resetTextMeasure()
  measureText.mockClear()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({ font: '', measureText }) as unknown as CanvasRenderingContext2D)
})
afterEach(() => vi.restoreAllMocks())

const layout = (id: LayoutId) => FLOORS.find((f) => f.id === id)!
const row = (code: string, zone: string, matchLevel: 'SUB' | 'MAJOR' | 'NONE' = 'SUB') => ({ code, currentZone: zone, positionA: zone.split('-')[0], floor: '1F', matchLevel })
const rows = [row('A-006-1', 'A2-3'), row('A-006-2', 'A2-3'), row('A-007-1', 'A5-3')]
const zone = (c: HTMLElement, code: string) => c.querySelector<SVGElement>(`.reloc-zone[data-zone="${code}"]`)!

describe('RelocationFloorMap - before', () => {
  it('marks source zones from, the rest dim (focus mode), pins with labels, tray, edge tag, no arrows, nothing clickable', () => {
    const { container } = render(
      <RelocationFloorMap lang="vi" layout={layout('floor1')} role="before" rows={rows} target={{ layoutId: 'floor2', zone: 'A15-3' }} ctx={ctx} />,
    )
    expect(zone(container, 'A2-3').classList).toContain('zone-from')
    expect(zone(container, 'A1-1').classList).toContain('zone-dim')
    // The from zone chip is hidden: the pin caption (machine codes) takes its place.
    expect(container.querySelector('.reloc-label[data-zone="A2-3"]')).toBeNull()
    expect(container.querySelector('.reloc-pin.pin-from[data-zone="A2-3"] .reloc-pin-label')?.textContent).toBe('A-006-1 +1')
    // Destination on another layout: purple pill on the right edge.
    expect(container.querySelector('.reloc-edge-to')?.textContent).toBe('Sang Toà B / 1F / A15-3 ▸')
    expect(container.querySelector('.reloc-tray-zone[data-zone="A5-3"]')?.classList).toContain('zone-from')
    expect(container.querySelectorAll('[role="button"], button.reloc-tray-zone')).toHaveLength(0)
    expect(container.querySelectorAll('.reloc-arrow')).toHaveLength(0)
  })
})

describe('RelocationFloorMap - after', () => {
  const target = { layoutId: 'floor1' as const, zone: 'A3-1' }

  it('marks to / old / dim, draws an arrow from the old zone and pins the destination', () => {
    const { container } = render(<RelocationFloorMap lang="vi" layout={layout('floor1')} role="after" rows={rows} target={target} onPickZone={() => {}} />)
    expect(zone(container, 'A3-1').classList).toContain('zone-to')
    expect(zone(container, 'A2-3').classList).toContain('zone-old')
    expect(zone(container, 'A1-1').classList).toContain('zone-dim')
    expect(container.querySelector('.reloc-arrow-group')?.getAttribute('data-from')).toBe('A2-3')
    expect(container.querySelector('.reloc-pin.pin-to .reloc-pin-label')?.textContent).toBe('3 máy')
    expect(container.querySelector('.reloc-pin.pin-old[data-zone="A2-3"] .reloc-pin-label')?.textContent).toBe('A-006-1 +1 (cũ)')
    expect(container.querySelector('.reloc-label[data-zone="A3-1"]')?.textContent).toBe('A3-1 · 0')
  })

  it('zones are neutral with no machine selected, dim (focus mode) once machines are selected', () => {
    const { container, rerender } = render(<RelocationFloorMap lang="en" layout={layout('floor1')} role="after" rows={[]} target={null} onPickZone={() => {}} />)
    expect(zone(container, 'A1-1').classList).toContain('zone-idle')
    rerender(<RelocationFloorMap lang="en" layout={layout('floor1')} role="after" rows={rows} target={null} onPickZone={() => {}} />)
    expect(zone(container, 'A1-1').classList).toContain('zone-dim')
  })

  it('click, Enter and Space pick a zone; majors with sub-zones are not targets', () => {
    const onPick = vi.fn()
    const { container } = render(<RelocationFloorMap lang="vi" layout={layout('floor1')} role="after" rows={rows} target={target} onPickZone={onPick} />)
    const a23 = zone(container, 'A2-3')
    expect(a23.getAttribute('role')).toBe('button')
    expect(a23.getAttribute('tabindex')).toBe('0')
    expect(a23.getAttribute('aria-label')).toMatch(/^A2-3: 2 máy/)
    fireEvent.click(zone(container, 'A1-1'))
    fireEvent.keyDown(zone(container, 'A2-1'), { key: 'Enter' })
    fireEvent.keyDown(zone(container, 'A9'), { key: ' ' })
    fireEvent.keyDown(zone(container, 'A9'), { key: 'a' })
    expect(onPick.mock.calls).toEqual([[{ layoutId: 'floor1', zone: 'A1-1' }], [{ layoutId: 'floor1', zone: 'A2-1' }], [{ layoutId: 'floor1', zone: 'A9' }]])
    expect(zone(container, 'A2').hasAttribute('role')).toBe(false)
  })

  it('tray zones are listed and clickable', () => {
    const onPick = vi.fn()
    const { container } = render(<RelocationFloorMap lang="vi" layout={layout('floor1')} role="after" rows={rows} target={target} onPickZone={onPick} />)
    const tray = container.querySelector<HTMLButtonElement>('button.reloc-tray-zone[data-zone="A5-3"]')!
    expect(tray.classList).toContain('zone-old')
    fireEvent.click(tray)
    expect(onPick).toHaveBeenCalledWith({ layoutId: 'floor1', zone: 'A5-3' })
  })

  it('zones rejected by isPickable are not clickable; extraTray zones are listed and pickable', () => {
    const onPick = vi.fn()
    const { container } = render(
      <RelocationFloorMap
        lang="vi"
        layout={layout('floor1')}
        role="after"
        rows={rows}
        target={null}
        onPickZone={onPick}
        isPickable={(code) => code !== 'A1-1'}
        extraTray={[{ code: 'A2-9', count: 1 }]}
      />,
    )
    expect(zone(container, 'A1-1').hasAttribute('role')).toBe(false)
    expect(zone(container, 'A2-1').getAttribute('role')).toBe('button')
    fireEvent.click(container.querySelector<HTMLButtonElement>('button.reloc-tray-zone[data-zone="A2-9"]')!)
    expect(onPick).toHaveBeenCalledWith({ layoutId: 'floor1', zone: 'A2-9' })
  })

  it('assets with matchLevel NONE are only in the tray', () => {
    const none = [row('M-1', 'A1-1', 'NONE')]
    const { container } = render(<RelocationFloorMap lang="vi" layout={layout('floor1')} role="before" rows={none} target={null} />)
    expect(zone(container, 'A1-1').classList).toContain('zone-dim')
    expect(container.querySelector('.reloc-pin')).toBeNull()
    expect(container.querySelector('.reloc-tray-zone[data-zone="A1-1"]')?.classList).toContain('zone-from')
  })

  it('tags sources from another layout', () => {
    const { container } = render(
      <RelocationFloorMap lang="vi" layout={layout('floor2')} role="after" rows={rows} target={{ layoutId: 'floor2', zone: 'A15-3' }} onPickZone={() => {}} ctx={ctx} />,
    )
    expect(container.querySelector('.reloc-edge-from')?.textContent).toBe('◂ Từ Toà A / 1F / A2-3, A5-3 (3)')
    // A dashed purple arrow from the pill to the destination; no green same-layout arrow.
    expect(container.querySelectorAll('.reloc-arrow.is-cross')).toHaveLength(1)
    expect(container.querySelectorAll('.reloc-arrow:not(.is-cross)')).toHaveLength(0)
  })
})

describe('RelocationFloorMap - Mold (rotated 90deg)', () => {
  it('pins and arrows live inside the rotated scene, label text is counter-rotated', () => {
    const mold = [row('M-1', 'A31-1')]
    const { container } = render(
      <RelocationFloorMap lang="vi" layout={layout('floor4')} role="after" rows={mold} target={{ layoutId: 'floor4', zone: 'A34-1' }} onPickZone={() => {}} />,
    )
    const scene = container.querySelector<HTMLElement>('.map-scene')!
    expect(getComputedStyle(scene).transform).toContain('rotate(90deg)')
    expect(scene.querySelector('.reloc-arrow')).not.toBeNull()
    const pin = scene.querySelector<HTMLElement>('.reloc-pin.pin-to')!
    expect(pin.querySelector<HTMLElement>('.reloc-pin-label')!.style.transform).toMatch(/^rotate\(-90deg\)/)
  })
})

describe('RelocationFloorMap - display', () => {
  it('draws every major area and sub-zone of the layout, with labels', () => {
    for (const id of ['floor1', 'floor2', 'floor3', 'floor4', 'floor5'] as const) {
      const l = layout(id)
      const { container, unmount } = render(<RelocationFloorMap lang="vi" layout={l} role="after" rows={[]} target={null} onPickZone={() => {}} />)
      const drawn = [...container.querySelectorAll('.reloc-zone')].map((z) => z.getAttribute('data-zone'))
      expect(drawn.sort()).toEqual([...l.areas, ...l.subAreas].map((a) => a.code).sort())
      expect(container.querySelectorAll('.reloc-label')).toHaveLength(drawn.length)
      unmount()
    }
  })

  it('labels show "code · count" unless counts are hidden', () => {
    const counts = new Map([['A2-3', 26]])
    const { container, rerender } = render(<RelocationFloorMap lang="vi" layout={layout('floor1')} role="before" rows={[]} target={null} zoneCount={counts} />)
    expect(container.querySelector('.reloc-label[data-zone="A2-3"]')?.textContent).toBe('A2-3 · 26')
    rerender(<RelocationFloorMap lang="vi" layout={layout('floor1')} role="before" rows={[]} target={null} zoneCount={counts} showCounts={false} />)
    expect(container.querySelector('.reloc-label[data-zone="A2-3"]')?.textContent).toBe('A2-3')
  })

  it('a disabled zone (not in the API) is dashed, explains why and never calls onPickZone', () => {
    const onPick = vi.fn()
    const { container } = render(
      <RelocationFloorMap lang="vi" layout={layout('floor1')} role="after" rows={rows} target={null} onPickZone={onPick} isPickable={(code) => code !== 'A1-1'} />,
    )
    const a11 = zone(container, 'A1-1')
    expect(a11.classList).toContain('zone-disabled')
    expect(a11.querySelector('title')?.textContent).toContain('Không có trong danh mục vị trí')
    expect(a11.hasAttribute('tabindex')).toBe(false)
    fireEvent.click(a11)
    fireEvent.keyDown(a11, { key: 'Enter' })
    expect(onPick).not.toHaveBeenCalled()
    expect(zone(container, 'A2-1').querySelector('title')?.textContent).toBe('A2-1 · 0 máy · Click để chọn làm đích')
  })

  it('dim zones stay clickable', () => {
    const onPick = vi.fn()
    const { container } = render(<RelocationFloorMap lang="vi" layout={layout('floor1')} role="after" rows={rows} target={{ layoutId: 'floor1', zone: 'A3-1' }} onPickZone={onPick} />)
    expect(zone(container, 'A1-1').classList).toContain('zone-dim')
    fireEvent.click(zone(container, 'A1-1'))
    expect(onPick).toHaveBeenCalledWith({ layoutId: 'floor1', zone: 'A1-1' })
  })

  it('"Related only" hides the zones that are not part of the move', () => {
    const { container } = render(
      <RelocationFloorMap lang="vi" layout={layout('floor1')} role="after" rows={rows} target={{ layoutId: 'floor1', zone: 'A3-1' }} onPickZone={() => {}} showAll={false} />,
    )
    const drawn = [...container.querySelectorAll('.reloc-zone')].map((z) => z.getAttribute('data-zone')).sort()
    // Destination A3-1, old A2-3 and their major areas (A5-3 is not drawn on floor1: it is in the tray).
    expect(drawn).toEqual(['A2', 'A2-3', 'A3', 'A3-1'])
    expect(container.querySelector('.reloc-label[data-zone="A1-1"]')).toBeNull()
  })

  it('shared view: zooming either map zooms both', () => {
    function Pair() {
      const [view, setView] = useState<MapView>(DEFAULT_MAP_VIEW)
      return (
        <>
          <RelocationFloorMap lang="vi" layout={layout('floor1')} role="before" rows={rows} target={null} view={view} onViewChange={setView} />
          <RelocationFloorMap lang="vi" layout={layout('floor2')} role="after" rows={rows} target={null} onPickZone={() => {}} view={view} onViewChange={setView} />
        </>
      )
    }
    render(<Pair />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Phóng to' })[0])
    expect(screen.getAllByText('125%')).toHaveLength(2)
    fireEvent.click(screen.getAllByRole('button', { name: 'Phóng to' })[1])
    expect(screen.getAllByText('150%')).toHaveLength(2)
  })

  it('without a shared view each map zooms on its own', () => {
    render(
      <>
        <RelocationFloorMap lang="vi" layout={layout('floor1')} role="before" rows={rows} target={null} />
        <RelocationFloorMap lang="vi" layout={layout('floor2')} role="after" rows={rows} target={null} onPickZone={() => {}} />
      </>,
    )
    fireEvent.click(screen.getAllByRole('button', { name: 'Phóng to' })[0])
    expect(screen.getAllByText('125%')).toHaveLength(1)
  })

  it('both maps use the same frame ratio', () => {
    const { container } = render(
      <>
        <RelocationFloorMap lang="vi" layout={layout('floor1')} role="before" rows={rows} target={null} />
        <RelocationFloorMap lang="vi" layout={layout('floor4')} role="after" rows={rows} target={null} />
      </>,
    )
    const ratios = [...container.querySelectorAll<HTMLElement>('[data-testid="reloc-map-frame"]')].map((f) => getComputedStyle(f).aspectRatio)
    expect(new Set(ratios).size).toBe(1)
  })
})

describe('RelocationFloorMap - focus mode', () => {
  const target = { layoutId: 'floor1' as const, zone: 'A3-1' }
  const counts = new Map([['A1-1', 26], ['A2-3', 2], ['A3-1', 5]])
  const render1 = (extra: Partial<Parameters<typeof RelocationFloorMap>[0]> = {}) =>
    render(<RelocationFloorMap lang="vi" layout={layout('floor1')} role="after" rows={rows} target={target} onPickZone={() => {}} zoneCount={counts} {...extra} />)

  it('related zones get halo + related class, their major areas the parent class, the rest dim with a muted label', () => {
    const { container } = render1()
    for (const code of ['A3-1', 'A2-3']) {
      expect(zone(container, code).classList).toContain('is-related')
      expect(zone(container, code).parentElement?.querySelector('.reloc-halo')).not.toBeNull()
    }
    expect(zone(container, 'A3').classList).toContain('is-parent')
    expect(zone(container, 'A2').classList).toContain('is-parent')
    expect(zone(container, 'A1-1').classList).toContain('zone-dim')
    expect(zone(container, 'A1-1').parentElement?.querySelector('.reloc-halo')).toBeNull()
    const muted = container.querySelector('.reloc-label[data-zone="A1-1"]')!
    expect(muted.classList).toContain('is-muted')
    expect(muted.textContent).toBe('A1-1')
    const to = container.querySelector('.reloc-label[data-zone="A3-1"]')!
    expect(to.classList).toContain('is-related')
    expect(to.textContent).toBe('A3-1 · 5')
    expect(container.querySelector('.reloc-label[data-zone="A2-3"]')).toBeNull() // Old zone: the pin caption replaces the chip.
    expect(zone(container, 'A3-1').getAttribute('vector-effect')).toBe('non-scaling-stroke')
  })

  it('paints plain sub-zones, then major areas, then related zones on top, then arrows', () => {
    const { container } = render1()
    const order = [...container.querySelectorAll('.reloc-zone, .reloc-arrow-group')].map((el) =>
      el.classList.contains('reloc-arrow-group') ? 'arrow' : el.classList.contains('is-related') ? 'related' : el.classList.contains('is-major') ? 'major' : 'sub',
    )
    const rank = { sub: 0, major: 1, related: 2, arrow: 3 }
    expect(order.map((k) => rank[k as keyof typeof rank])).toEqual([...order.map((k) => rank[k as keyof typeof rank])].sort((a, b) => a - b))
    expect(order.at(-1)).toBe('arrow')
    expect(order.filter((k) => k === 'related')).toHaveLength(2)
  })

  it('"Related only" still applies in focus mode', () => {
    const { container } = render1({ showAll: false })
    expect([...container.querySelectorAll('.reloc-zone')].map((z) => z.getAttribute('data-zone')).sort()).toEqual(['A2', 'A2-3', 'A3', 'A3-1'])
  })

  it('highlightZone flashes that zone and lifts it above the others', () => {
    const { container, rerender } = render1({ highlightZone: 'A1-1' })
    expect(zone(container, 'A1-1').classList).toContain('is-highlight')
    const zones = [...container.querySelectorAll('.reloc-zone')]
    expect(zones.indexOf(zone(container, 'A1-1'))).toBeGreaterThan(zones.indexOf(zone(container, 'A2-1')))
    rerender(<RelocationFloorMap lang="vi" layout={layout('floor1')} role="after" rows={rows} target={target} onPickZone={() => {}} highlightZone={null} />)
    expect(container.querySelector('.is-highlight')).toBeNull()
  })
})

describe('layoutLabels', () => {
  const bounds = { w: 400, h: 300 }
  const tab = (id: string, x: number, zoneTop: number, w = 60, h = 16): LabelBox => ({ id, kind: 'tab', x, y: zoneTop - h, w, h, zoneTop })

  it('keeps boxes that do not overlap where they are', () => {
    const out = layoutLabels([tab('a', 10, 50), { id: 'p', kind: 'pin', x: 200, y: 200, w: 50, h: 16 }], bounds)
    expect(out.get('a')).toEqual({ x: 10, y: 34, flipped: false, shifts: 0, hidden: false })
    expect(out.get('p')).toEqual({ x: 200, y: 200, flipped: false, shifts: 0, hidden: false })
  })

  it('pushes an overlapping pin caption down, at most 3 times', () => {
    // Tab spans y 34-50; the caption at 40 overlaps it, one push (h 16 + gap 2) clears it.
    const pin: LabelBox = { id: 'p', kind: 'pin', x: 10, y: 40, w: 50, h: 16 }
    expect(layoutLabels([tab('a', 10, 50), pin], bounds).get('p')).toMatchObject({ y: 58, shifts: 1, hidden: false })
    // A tall column of tabs: still overlapping after 3 pushes -> stops at the 3rd try, stays visible.
    const wall = [0, 1, 2, 3, 4].map((i) => tab(`t${i}`, 10, 50 + i * 18))
    expect(layoutLabels([...wall, pin], bounds).get('p')).toMatchObject({ shifts: 3, y: 40 + 3 * 18, hidden: false })
  })

  it('pushes a major label up, and hides it when it still overlaps a chip', () => {
    const major: LabelBox = { id: 'm', kind: 'major', x: 10, y: 36, w: 50, h: 16 }
    expect(layoutLabels([tab('a', 10, 50), major], bounds).get('m')).toMatchObject({ y: 18, shifts: 1, hidden: false })
    // Chips fill y 0-52 above it: every push up collides or leaves the image -> hidden.
    const wall = [0, 1, 2].map((i) => tab(`t${i}`, 10, 52 - i * 18))
    expect(layoutLabels([...wall, major], bounds).get('m')).toMatchObject({ hidden: true })
  })

  it('flips a tab inside its zone at the top edge, and keeps it inside the image horizontally', () => {
    const out = layoutLabels([tab('a', 390, 5)], bounds)
    expect(out.get('a')).toEqual({ x: 340, y: 7, flipped: true, shifts: 0, hidden: false })
  })
})

describe('RelocationFloorMap - label placement', () => {
  const dyOf = (el: Element) => Number(/translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec((el as HTMLElement).style.transform)![2])

  it('pin captions sit just above the dot', () => {
    const { container } = render(<RelocationFloorMap lang="vi" layout={layout('floor1')} role="before" rows={rows} target={null} />)
    expect(dyOf(container.querySelector('.reloc-pin[data-zone="A2-3"] .reloc-pin-label')!)).toBeLessThan(0)
  })

  it('on the rotated Mold layout the caption is counter-rotated and still above the dot (A31-1 marker)', () => {
    const { container } = render(<RelocationFloorMap lang="vi" layout={layout('floor4')} role="before" rows={[row('M-1', 'A31-1'), row('M-2', 'A31-1')]} target={null} />)
    const caption = container.querySelector<HTMLElement>('.reloc-pin[data-zone="A31-1"] .reloc-pin-label')!
    expect(caption.textContent).toBe('M-1 +1')
    expect(caption.style.transform).toMatch(/^rotate\(-90deg\) translate\(-[\d.]+px, -[\d.]+px\)$/)
  })

  it('focus mode: unrelated zones keep their major colour but go pale (fill 0.06, 1px stroke 0.45, chips 0.6 / 0.55)', () => {
    const { container } = render(<RelocationFloorMap lang="vi" layout={layout('floor1')} role="before" rows={rows} target={null} />)
    const dim = zone(container, 'A1-1')
    const style = getComputedStyle(dim)
    expect(Number(style.getPropertyValue('fill-opacity')) * FOCUS.zoneFill).toBeCloseTo(0.06, 3)
    expect(style.getPropertyValue('stroke-width')).toBe('1')
    expect(style.getPropertyValue('stroke-opacity')).toBe('0.45')
    expect(dim.getAttribute('stroke')).toBe(zone(container, 'A1').getAttribute('stroke'))
    expect(dim.getAttribute('stroke')).not.toBe(SLATE)
    expect(['', 'none']).toContain(style.getPropertyValue('stroke-dasharray'))
    const chip = container.querySelector<HTMLElement>('.reloc-label[data-zone="A1-1"]')!
    expect(getComputedStyle(chip).opacity).toBe('0.6')
    // The chip text keeps the major colour (not grey).
    expect(chip.querySelector<HTMLElement>('.reloc-label-text')!.style.color).not.toBe('')
    expect(getComputedStyle(container.querySelector('.reloc-label[data-zone="A1"]')!).opacity).toBe('0.55')
  })

  it('focus mode: the major area holding a related zone is solid (2px, opacity 1, solid label); its other sub-zones stay pale', () => {
    const { container } = render(<RelocationFloorMap lang="vi" layout={layout('floor1')} role="before" rows={rows} target={null} />)
    const a2 = getComputedStyle(zone(container, 'A2'))
    expect(a2.getPropertyValue('stroke-width')).toBe('2')
    expect(a2.getPropertyValue('stroke-opacity')).toBe('1')
    const label = container.querySelector<HTMLElement>('.reloc-label[data-zone="A2"]')!
    expect(label.classList).not.toContain('is-muted')
    expect(['', '1']).toContain(getComputedStyle(label).opacity)
    expect(label.querySelector<HTMLElement>('.reloc-label-text')!.style.backgroundColor).not.toBe('')
    expect(zone(container, 'A2-1').classList).toContain('zone-dim')
    expect(getComputedStyle(container.querySelector('.reloc-label[data-zone="A2-1"]')!).opacity).toBe('0.6')
  })

  it('focus mode: hovering a pale zone on the After map brings its chip back to opacity 1', () => {
    const { container } = render(<RelocationFloorMap lang="vi" layout={layout('floor1')} role="after" rows={rows} target={null} onPickZone={() => {}} />)
    fireEvent.mouseEnter(zone(container, 'A1-1'))
    expect(getComputedStyle(container.querySelector('.reloc-label[data-zone="A1-1"]')!).opacity).toBe('1')
    fireEvent.mouseLeave(zone(container, 'A1-1'))
    expect(getComputedStyle(container.querySelector('.reloc-label[data-zone="A1-1"]')!).opacity).toBe('0.6')
  })

  it('dashed strokes: disabled zones (grey) and old zones (amber) only', () => {
    const { container } = render(
      <RelocationFloorMap lang="vi" layout={layout('floor1')} role="after" rows={rows} target={{ layoutId: 'floor1', zone: 'A3-1' }} onPickZone={() => {}} isPickable={(c) => c !== 'A1-1'} />,
    )
    const dashed = [...container.querySelectorAll('.reloc-zone')].filter((z) => !['', 'none'].includes(getComputedStyle(z).getPropertyValue('stroke-dasharray')))
    expect(dashed.map((z) => z.getAttribute('data-zone')).sort()).toEqual(['A1-1', 'A2-3'])
    expect(zone(container, 'A1-1').classList).toContain('zone-disabled')
  })
})

describe('RelocationFloorMap - chips', () => {
  const counts = new Map([['A2', 43], ['A2-3', 2]])

  it('major chips: code only, solid major colour, white text; the tooltip has the total incl. sub-zones', () => {
    const { container } = render(<RelocationFloorMap lang="vi" layout={layout('floor1')} role="before" rows={[]} target={null} zoneCount={counts} />)
    const major = container.querySelector<HTMLElement>('.reloc-label[data-zone="A2"] .reloc-label-text')!
    expect(major.textContent).toBe('A2')
    expect(major.style.backgroundColor).not.toBe('')
    expect(zone(container, 'A2').querySelector('title')?.textContent).toBe('A2 · 43 máy (gồm khu con)')
  })

  it('sub-zone chips: white, 1px border and text in the major colour', () => {
    const { container } = render(<RelocationFloorMap lang="vi" layout={layout('floor1')} role="before" rows={[]} target={null} zoneCount={counts} />)
    const chip = container.querySelector<HTMLElement>('.reloc-label[data-zone="A2-3"] .reloc-label-text')!
    expect(chip.textContent).toBe('A2-3 · 2')
    expect(getComputedStyle(chip).borderWidth).toBe('1px')
    expect(chip.style.borderColor).toBe(chip.style.color)
    expect(chip.style.color).not.toBe('')
  })

  it('major areas without sub-zones are slate', () => {
    const l = layout('floor1')
    const lone = l.areas.find((a) => !l.subAreas.some((s) => s.code.startsWith(`${a.code}-`)))!
    const { container } = render(<RelocationFloorMap lang="vi" layout={l} role="before" rows={[]} target={null} />)
    expect(zone(container, lone.code).getAttribute('stroke')).toBe(SLATE)
    expect(zone(container, 'A2').getAttribute('stroke')).not.toBe(SLATE)
  })

  it('old-location pin caption: "(cũ)" / "(old)"', () => {
    const props = { layout: layout('floor1'), role: 'after' as const, rows, target: { layoutId: 'floor1' as const, zone: 'A3-1' }, onPickZone: () => {} }
    const { container, rerender } = render(<RelocationFloorMap lang="vi" {...props} />)
    expect(container.querySelector('.pin-old[data-zone="A2-3"] .reloc-pin-label')?.textContent).toBe('A-006-1 +1 (cũ)')
    rerender(<RelocationFloorMap lang="en" {...props} />)
    expect(container.querySelector('.pin-old[data-zone="A2-3"] .reloc-pin-label')?.textContent).toBe('A-006-1 +1 (old)')
  })

  it('destination pin caption: the machine code for one machine', () => {
    const { container } = render(<RelocationFloorMap lang="vi" layout={layout('floor1')} role="after" rows={[rows[0]]} target={{ layoutId: 'floor1', zone: 'A3-1' }} onPickZone={() => {}} />)
    expect(container.querySelector('.pin-to .reloc-pin-label')?.textContent).toBe('A-006-1')
  })

  it('measures chip text with the canvas (font + text), once per pair', () => {
    render(<RelocationFloorMap lang="vi" layout={layout('floor1')} role="after" rows={rows} target={{ layoutId: 'floor1', zone: 'A3-1' }} onPickZone={() => {}} />)
    expect(measureText).toHaveBeenCalledWith('A-006-1 +1 (cũ)')
    const calls = measureText.mock.calls.length
    expect(measureTextWidth('A3-1 · x', '800 13px Inter')).toBe(8 * 7)
    measureTextWidth('A3-1 · x', '800 13px Inter')
    expect(measureText.mock.calls.length).toBe(calls + 1)
  })
})

describe('zonePalette', () => {
  it('is the 8-colour pastel set, without the from / to colours', () => {
    expect(zonePalette).toEqual(['#dc2626', '#2563eb', '#7c3aed', '#ca8a04', '#0d9488', '#db2777', '#0284c7', '#65a30d'])
    expect(zonePalette).not.toContain(tokens.light.relocFrom)
    expect(zonePalette).not.toContain(tokens.light.relocTo)
  })
})

describe('RelocationFloorMap - state colours', () => {
  const FROM = tokens.light.relocFrom
  const TO = tokens.light.relocTo
  const rgbOf = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`
  const is = (hex: string) => (v: string) => [hex.toLowerCase(), rgbOf(hex)].includes(v.trim().toLowerCase())
  const target = { layoutId: 'floor1' as const, zone: 'A3-1' }

  it('from: amber #b7791f fill, #92400e 2.5px stroke; pin = white dot with amber border, solid amber caption', () => {
    expect(FROM).toBe('#b7791f')
    const { container } = render(<RelocationFloorMap lang="vi" layout={layout('floor1')} role="before" rows={rows} target={null} />)
    const style = getComputedStyle(zone(container, 'A2-3'))
    expect(is('#92400e')(style.getPropertyValue('stroke'))).toBe(true)
    expect(style.getPropertyValue('stroke-width')).toBe('2.5')
    const dot = getComputedStyle(container.querySelector('.pin-from .reloc-pin-dot')!)
    expect(is('#ffffff')(dot.backgroundColor)).toBe(true)
    expect(is(FROM)(dot.borderColor)).toBe(true)
    expect(is(FROM)(getComputedStyle(container.querySelector('.pin-from .reloc-pin-label')!).backgroundColor)).toBe(true)
  })

  it('old zone uses the amber token: pale amber fill, amber dashed stroke, pale chip with dark ink, hollow pin; no zone chip', () => {
    expect(FOCUS.old.color).toBe(AMBER.base)
    expect(FOCUS.from.color).toBe(AMBER.base)
    expect(FOCUS.old.stroke).toBe(AMBER.base)
    expect(FOCUS.from.stroke).toBe(AMBER.ink)
    expect(AMBER).toEqual({ base: '#b7791f', ink: '#92400e', paper: '#fef3c7' })
    expect(FOCUS.old.fill).toBe(0.25)
    const { container } = render(<RelocationFloorMap lang="vi" layout={layout('floor1')} role="after" rows={rows} target={target} onPickZone={() => {}} />)
    const old = getComputedStyle(zone(container, 'A2-3'))
    expect(old.getPropertyValue('fill').replace(/\s/g, '')).toMatch(/^rgba\(183,121,31,0\.25\)$/)
    expect(container.querySelector('.reloc-label[data-zone="A2-3"]')).toBeNull()
    const chip = getComputedStyle(container.querySelector('.pin-old[data-zone="A2-3"] .reloc-pin-label')!)
    expect(is(AMBER.paper)(chip.backgroundColor)).toBe(true)
    expect(is(AMBER.ink)(chip.color)).toBe(true)
    expect(is(AMBER.ink)(chip.borderColor)).toBe(true)
    const dot = getComputedStyle(container.querySelector('.pin-old .reloc-pin-dot')!)
    expect(is('#ffffff')(dot.backgroundColor)).toBe(true)
    expect(is(AMBER.base)(dot.borderColor)).toBe(true)
    expect(dot.borderWidth).toBe('2.5px')
  })

  it('to: green fill, #065f46 2.5px; old: amber dashed 2px, no animation; same-layout arrow green, dashed', () => {
    const { container } = render(<RelocationFloorMap lang="vi" layout={layout('floor1')} role="after" rows={rows} target={target} onPickZone={() => {}} />)
    const to = getComputedStyle(zone(container, 'A3-1'))
    expect(is('#065f46')(to.getPropertyValue('stroke'))).toBe(true)
    expect(to.getPropertyValue('stroke-width')).toBe('2.5')
    const old = getComputedStyle(zone(container, 'A2-3'))
    expect(is(FROM)(old.getPropertyValue('stroke'))).toBe(true)
    expect(old.getPropertyValue('stroke-width')).toBe('2')
    expect(old.getPropertyValue('stroke-dasharray').replace(/px/g, '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim()).toBe('6 4')
    expect(['', 'none']).toContain(old.getPropertyValue('animation-name'))
    const arrow = container.querySelector('.reloc-arrow')!
    expect(arrow.classList).not.toContain('is-cross')
    expect(is(TO)(getComputedStyle(arrow).getPropertyValue('stroke'))).toBe(true)
    expect(getComputedStyle(arrow).getPropertyValue('stroke-width')).toBe('2.5')
    expect(container.querySelector('linearGradient')).toBeNull()
  })

  it('every arrow has a solid white casing drawn before its line, live and in the export', () => {
    const check = (container: HTMLElement) => {
      const groups = [...container.querySelectorAll('g[data-from]')].filter((g) => g.querySelector('.reloc-arrow'))
      expect(groups.length).toBeGreaterThan(0)
      for (const g of groups) {
        const paths = [...g.querySelectorAll('path')]
        expect(paths.map((p) => p.getAttribute('class'))).toEqual(['reloc-arrow-casing', expect.stringContaining('reloc-arrow')])
        expect(paths[0].getAttribute('d')).toBe(paths[1].getAttribute('d'))
        const casing = getComputedStyle(paths[0])
        expect(paths[0].getAttribute('stroke-dasharray')).toBeNull()
        expect(['', 'none']).toContain(casing.getPropertyValue('stroke-dasharray'))
        expect(['', 'none']).toContain(casing.getPropertyValue('animation-name'))
      }
    }
    const props = { lang: 'vi' as const, layout: layout('floor1'), role: 'after' as const, rows, target, onPickZone: () => {} }
    const live = render(<RelocationFloorMap {...props} />)
    check(live.container)
    const head = getComputedStyle(live.container.querySelector('.reloc-arrow-head')!)
    expect(head.getPropertyValue('stroke-width')).toBe('2')
    expect(head.getPropertyValue('stroke-width')).toBe(String(FOCUS.arrow.headStroke))
    live.unmount()
    const exported = render(<RelocationFloorMap {...props} exportMode={{ width: 800, imageHref: 'data:,' }} />)
    check(exported.container)
    expect(exported.container.querySelector('g[data-from] polygon')?.getAttribute('stroke')).toBe('#ffffff')
  })

  it('cross arrows use the same white casing', () => {
    const { container } = render(<RelocationFloorMap lang="vi" layout={layout('floor2')} role="after" rows={rows} target={{ layoutId: 'floor2', zone: 'A15-3' }} onPickZone={() => {}} ctx={ctx} />)
    const line = container.querySelector('.reloc-arrow.is-cross')!
    expect(line.previousElementSibling?.getAttribute('class')).toBe('reloc-arrow-casing')
  })

  it('arrows from another layout are purple', () => {
    const { container } = render(<RelocationFloorMap lang="vi" layout={layout('floor2')} role="after" rows={rows} target={{ layoutId: 'floor2', zone: 'A15-3' }} onPickZone={() => {}} ctx={ctx} />)
    expect(is(tokens.light.relocCross)(getComputedStyle(container.querySelector('.reloc-arrow.is-cross')!).getPropertyValue('stroke'))).toBe(true)
  })

  it('the drawing is grey and faded (static CSS filter on the image)', () => {
    const { container } = render(<RelocationFloorMap lang="vi" layout={layout('floor1')} role="before" rows={[]} target={null} />)
    const img = getComputedStyle(container.querySelector('.map-scene > img')!)
    expect(img.filter).toBe('grayscale(1)')
    expect(img.opacity).toBe('0.6')
  })

  it('focus mode fades the drawing further (opacity 0.5)', () => {
    const { container } = render(<RelocationFloorMap lang="vi" layout={layout('floor1')} role="after" rows={rows} target={null} onPickZone={() => {}} />)
    const img = getComputedStyle(container.querySelector('.map-scene > img')!)
    expect(img.filter).toBe('grayscale(1)')
    expect(img.opacity).toBe('0.5')
  })
})

describe('RelocationFloorMap - old zones', () => {
  // Three narrow neighbouring sub-zones: their "(cũ)" captions would overlap above the pins.
  const rect = (code: string, x: number, y: number, w: number, h: number) => ({
    code,
    points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }],
  })
  const tight = {
    id: 'floor1',
    title: 'Test - T1',
    imageData: '',
    imgW: 400,
    imgH: 300,
    dbFloor: '1F',
    zones: [],
    areas: [rect('B1', 0, 0, 100, 100)],
    subAreas: [rect('B1-1', 40, 20, 6, 40), rect('B1-2', 47, 20, 6, 40), rect('B1-3', 54, 20, 6, 40), rect('B1-9', 40, 80, 20, 10)],
  } as unknown as RelocationLayout
  const tightCtx = { layouts: [tight], index: new Map([['B1', 'floor1'], ['B1-1', 'floor1'], ['B1-2', 'floor1'], ['B1-3', 'floor1'], ['B1-9', 'floor1']] as const), zoneFac: new Map<string, string>() }
  const olds = [row('X-1', 'B1-1'), row('X-2', 'B1-2'), row('X-3', 'B1-3')]
  const renderTight = () =>
    render(<RelocationFloorMap lang="vi" layout={tight} layouts={[tight]} role="after" rows={olds} target={{ layoutId: 'floor1', zone: 'B1-9' }} onPickZone={() => {}} ctx={tightCtx} />)

  it('one arrow per old zone, all ending at the destination', () => {
    const { container } = renderTight()
    const groups = [...container.querySelectorAll('.reloc-arrow-group')]
    expect(groups.map((g) => g.getAttribute('data-from')).sort()).toEqual(['B1-1', 'B1-2', 'B1-3'])
    const ends = groups.map((g) => g.querySelector('.reloc-arrow-head')!.getAttribute('points')!.split(' ')[0].split(',').map(Number))
    // The arrowhead tips stop just before the centre of B1-9 (50%, 85%).
    for (const [x, y] of ends) expect(Math.hypot(((x - 50) * 400) / 100, ((y - 85) * 300) / 100)).toBeLessThan(12)
  })

  it('"(cũ)" captions never overlap each other', () => {
    const { container } = renderTight()
    const boxes = [...container.querySelectorAll<HTMLElement>('.reloc-pin.pin-old')].map((pin) => {
      const label = pin.querySelector<HTMLElement>('.reloc-pin-label')!
      const [, dx, dy] = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(label.style.transform)!.map(Number)
      const x = (parseFloat(pin.style.left) / 100) * 400 + dx
      const y = (parseFloat(pin.style.top) / 100) * 300 + dy
      return { x, y, w: Math.ceil(label.textContent!.length * 7 + 14), h: 18 }
    })
    expect(boxes).toHaveLength(3)
    // Where they were asked (same y, 28px apart) they overlap; after layout no pair does.
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]]
        expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false)
      }
  })
})

describe('RelocationFloorMap - tray chips', () => {
  it('tray: title, dashed chips in the major-area colour with a 0.1 fill, never faded', () => {
    const { container } = render(
      <RelocationFloorMap lang="vi" layout={layout('floor1')} role="after" rows={rows} target={{ layoutId: 'floor1', zone: 'A3-1' }} onPickZone={() => {}} extraTray={[{ code: 'A2-9', count: 4 }]} />,
    )
    expect(container.textContent).toContain('Zone có trong dữ liệu nhưng không có trên bản vẽ')
    const chip = container.querySelector<HTMLElement>('.reloc-tray-zone[data-zone="A2-9"]')!
    expect(chip.getAttribute('data-border')).toBe(zone(container, 'A2').getAttribute('stroke'))
    const style = getComputedStyle(chip)
    expect(style.borderStyle).toBe('dashed')
    expect(style.borderWidth).toBe('1px')
    expect(['', '1']).toContain(style.opacity)
    expect(chip.textContent).toBe('A2-94')
    // Old tray zone (A5-3): amber, "(cũ)" instead of the count.
    const old = container.querySelector<HTMLElement>('.reloc-tray-zone[data-zone="A5-3"]')!
    expect(old.getAttribute('data-border')).toBe(tokens.light.relocFrom)
    expect(old.textContent).toBe('A5-3(cũ)')
  })
})
