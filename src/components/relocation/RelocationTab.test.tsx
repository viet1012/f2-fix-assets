// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearLocationCache } from '../../hooks/useLocations'
import { SAMPLE_ASSETS, SAMPLE_LOCATIONS } from '../../test/locationSample'
import { resetTextMeasure } from './RelocationFloorMap'
import RelocationTab from './RelocationTab'

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

function mockFetch(failAssets = false) {
  const fn = vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/assets/with-location')) return failAssets ? json({ error: 'DB offline' }, 500) : json(SAMPLE_ASSETS)
    if (url.includes('/api/locations')) return json(SAMPLE_LOCATIONS)
    return json({ error: 'unexpected' }, 404)
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => {
  clearLocationCache()
  window.localStorage.clear()
  resetTextMeasure()
  // jsdom has no canvas: text is measured as 7px per character.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => ({ font: '', measureText: (t: string) => ({ width: t.length * 7 }) }) as unknown as CanvasRenderingContext2D,
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const pasteCodes = (text: string) => {
  const input = screen.getByLabelText('Chọn máy')
  fireEvent.paste(input, { clipboardData: { getData: () => text } })
}

describe('RelocationTab with the location API', () => {
  it('fetches the Factory 2 scope; NONE assets go to the tray, floorMismatch shows a warning icon', async () => {
    const fetchMock = mockFetch()
    const { container } = render(<RelocationTab lang="vi" />)
    await screen.findByLabelText('Chọn máy')
    const urls = fetchMock.mock.calls.map(([u]) => String(u))
    expect(urls).toContain('/api/assets/with-location?factory=Factory+2')
    expect(urls).toContain('/api/locations?assetFactory=Factory+2')

    pasteCodes('A-006-1 A-006-2 A-007-1')
    expect(screen.getByTestId('floor-mismatch-A-006-2')).toBeTruthy()
    expect(screen.queryByTestId('floor-mismatch-A-006-1')).toBeNull()

    // Before map (floor1): A-007-1 (NONE) is listed in the tray, not on the drawn A3-1 zone.
    expect(container.querySelector('.reloc-tray-zone[data-zone="A3-1"]')?.classList).toContain('zone-from')
    expect(container.querySelector('.reloc-zone[data-zone="A3-1"]')?.classList).toContain('zone-dim')
    expect(container.querySelector('.reloc-zone[data-zone="A2-3"]')?.classList).toContain('zone-from')
    expect(screen.queryByTestId('unplaced-zones')).toBeNull()
  })

  it('rejects a machine at an Outside location with its own message', async () => {
    mockFetch()
    const { container } = render(<RelocationTab lang="vi" />)
    await screen.findByLabelText('Chọn máy')
    pasteCodes('A-006-1 A-900-1')
    expect(container.querySelector('[data-report="outside"]')?.textContent).toContain('A-900-1')
    expect(screen.getByText('Đã chọn', { exact: false }).textContent).toContain('1')
  })

  it('fetches once per session across remounts', async () => {
    const fetchMock = mockFetch()
    const first = render(<RelocationTab lang="vi" />)
    await screen.findByLabelText('Chọn máy')
    first.unmount()
    render(<RelocationTab lang="vi" />)
    await screen.findByLabelText('Chọn máy')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('shows an error with a retry button instead of static data, and recovers on retry', async () => {
    const fetchMock = mockFetch(true)
    render(<RelocationTab lang="vi" />)
    expect(await screen.findByText('Không tải được dữ liệu vị trí')).toBeTruthy()
    expect(screen.getByText('DB offline')).toBeTruthy()
    expect(screen.queryByLabelText('Chọn máy')).toBeNull()

    mockFetch()
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    await screen.findByLabelText('Chọn máy')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('error state is localized (en)', async () => {
    mockFetch(true)
    render(<RelocationTab lang="en" />)
    expect(await screen.findByText('Could not load location data')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })
})

describe('RelocationTab - browse by zone', () => {
  const list = () => within(screen.getByTestId('zone-machine-list'))
  const item = (code: string) => screen.getByTestId('zone-machine-list').querySelector<HTMLElement>(`[data-code="${code}"]`)!
  const box = (code: string) => item(code).querySelector<HTMLInputElement>('input[type="checkbox"]')!
  const selectedCount = () => screen.getByTestId('selected-count').textContent

  async function openA23(container: HTMLElement) {
    await screen.findByLabelText('Chọn máy')
    pasteCodes('A-006-1 A-007-1')
    const zoneEl = container.querySelector<SVGElement>('.reloc-zone[data-zone="A2-3"]')!
    fireEvent.keyDown(zoneEl, { key: 'Enter' })
    return zoneEl
  }

  it('opens the zone list from the Before map; "Select all" adds only selectable machines', async () => {
    mockFetch()
    const { container } = render(<RelocationTab lang="vi" />)
    const zoneEl = await openA23(container)
    expect(zoneEl.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(/Đã chọn/).textContent).toContain('2 máy từ 2 zone')
    expect(box('A-006-1').checked).toBe(true)
    expect(box('A-006-2').checked).toBe(false)
    expect(item('A-008-1').getAttribute('data-reason')).toBe('wrongKind')
    expect(item('A-008-1').textContent).toContain('Sai loại tài sản')

    fireEvent.click(list().getByRole('button', { name: 'Chọn tất cả' }))
    expect(box('A-006-2').checked).toBe(true)
    expect(box('A-008-1').checked).toBe(false)
    expect(selectedCount()).toBe('3')
  })

  it('checkboxes stay in sync with the selected list both ways', async () => {
    mockFetch()
    const { container } = render(<RelocationTab lang="vi" />)
    await openA23(container)
    fireEvent.click(screen.getByRole('button', { name: 'Xoá A-006-1' }))
    expect(box('A-006-1').checked).toBe(false)
    fireEvent.click(item('A-006-1').querySelector('[role="button"]')!)
    expect(screen.getByRole('button', { name: 'Xoá A-006-1' })).toBeTruthy()
    fireEvent.click(list().getByRole('button', { name: 'Bỏ chọn' }))
    expect(screen.queryByRole('button', { name: 'Xoá A-006-1' })).toBeNull()
    expect(selectedCount()).toBe('1')
  })

  it('PENDING and wrong-kind machines are disabled and cannot be selected', async () => {
    window.localStorage.setItem(
      'f2.relocation.requests',
      JSON.stringify([{ id: 'DRAFT-0001', items: [{ code: 'A-006-2', name: '', fromZone: 'A2-3', fromFloor: '1F', moveType: 'same' }], to: { layoutId: 'floor1', zone: 'A1-1' }, requestedBy: 'E1', dStart: '2026-10-01', dEnd: '2026-10-02', reason: 'x', status: 'PENDING' }]),
    )
    mockFetch()
    const { container } = render(<RelocationTab lang="vi" />)
    await openA23(container)
    await waitFor(() => expect(item('A-006-2').getAttribute('data-reason')).toBe('pending'))
    expect(box('A-006-2').disabled).toBe(true)
    fireEvent.click(item('A-006-2').querySelector('[role="button"]')!)
    fireEvent.click(item('A-008-1').querySelector('[role="button"]')!)
    expect(list().getByRole('button', { name: 'Chọn tất cả' }).hasAttribute('disabled')).toBe(true)
    expect(selectedCount()).toBe('2')
  })
})

describe('RelocationTab - highlight from the selected table', () => {
  it('hovering a selected row flashes its zone on the map', async () => {
    mockFetch()
    const { container } = render(<RelocationTab lang="vi" />)
    await screen.findByLabelText('Chọn máy')
    pasteCodes('A-006-1 A-007-1')
    const row = container.querySelector<HTMLElement>('tr[data-code="A-006-1"]')!
    fireEvent.mouseEnter(row)
    expect(container.querySelector('.reloc-zone[data-zone="A2-3"]')?.classList).toContain('is-highlight')
    fireEvent.mouseLeave(row)
    expect(container.querySelector('.reloc-zone.is-highlight')).toBeNull()
  })
})

describe('RelocationTab - map cards', () => {
  const afterCard = () => screen.getByTestId('reloc-after-card')
  const pickTarget = (building: string, floor: string, zone: string) => {
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Toà nhà' }))
    fireEvent.click(screen.getByRole('option', { name: building }))
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Tầng / Khu' }))
    fireEvent.click(screen.getByRole('option', { name: floor }))
    fireEvent.click(afterCard().querySelector('.reloc-zone[data-zone="' + zone + '"]')!)
  }
  const cardOf = (el: HTMLElement) => el.closest<HTMLElement>('.MuiCard-root')!

  it('headers: colour square, bold title, "Toà / floor" subtitle; Before card has an orange top border', async () => {
    mockFetch()
    render(<RelocationTab lang="vi" />)
    await screen.findByLabelText('Chọn máy')
    pasteCodes('A-006-1 A-007-1')
    const before = cardOf(screen.getByTestId('reloc-before-card'))
    expect(within(before).getByText('Bố trí hiện tại (Trước)')).toBeTruthy()
    expect(within(before).getByText('Toà A / 1F')).toBeTruthy()
    expect(getComputedStyle(before).borderTopColor).toBe('rgb(194, 65, 12)')
    expect(within(cardOf(afterCard())).getByText('Bố trí sau di dời (Sau)')).toBeTruthy()
    expect(afterCard().getAttribute('data-move')).toBe('none')
  })

  it('layout pills when the selection spans several layouts; the active one is solid orange', async () => {
    mockFetch()
    render(<RelocationTab lang="vi" />)
    await screen.findByLabelText('Chọn máy')
    pasteCodes('A-006-1 A-015-1')
    expect(screen.getByText('Máy đã chọn nằm ở nhiều tầng:')).toBeTruthy()
    const pills = [...document.querySelectorAll<HTMLElement>('.reloc-layout-pill')]
    expect(pills.map((p) => p.textContent)).toEqual(['Toà A / 1F (1)', 'Toà B / 1F (1)'])
    expect(pills[0].getAttribute('aria-pressed')).toBe('true')
    expect(getComputedStyle(pills[0]).backgroundColor).toBe('rgb(194, 65, 12)')
    fireEvent.click(pills[1])
    expect(document.querySelector('.reloc-layout-pill.is-active')?.textContent).toBe('Toà B / 1F (1)')
    expect(within(cardOf(screen.getByTestId('reloc-before-card'))).getByText('Toà B / 1F')).toBeTruthy()
  })

  it('same floor: green After border, route line with a light "Cùng tầng" badge, no banner', async () => {
    mockFetch()
    render(<RelocationTab lang="vi" />)
    await screen.findByLabelText('Chọn máy')
    pasteCodes('A-006-1 A-006-2')
    pickTarget('Toà A', '1F · Press', 'A1-1')
    expect(afterCard().getAttribute('data-move')).toBe('same')
    expect(getComputedStyle(cardOf(afterCard())).borderTopColor).toBe('rgb(4, 120, 87)')
    expect(screen.queryByTestId('reloc-cross-banner')).toBeNull()
    expect(screen.getByTestId('reloc-route').textContent).toContain('2 máy→Toà A / 1F / A1-1')
    expect(screen.getByTestId('reloc-badge-same').textContent).toBe('Cùng tầng')
    expect(screen.queryByTestId('reloc-badge-building')).toBeNull()
  })

  it('building change: purple banner and border, solid "Đổi toà" badge', async () => {
    mockFetch()
    render(<RelocationTab lang="vi" />)
    await screen.findByLabelText('Chọn máy')
    pasteCodes('A-006-1 A-006-2')
    pickTarget('Toà B', '1F · Guide', 'A15-3')
    expect(afterCard().getAttribute('data-move')).toBe('cross')
    expect(screen.getByTestId('reloc-cross-banner').textContent).toBe('Đổi toà: Toà A / 1F → Toà B / 1F')
    expect(getComputedStyle(cardOf(afterCard())).borderTopColor).toBe('rgb(109, 40, 217)')
    const badge = screen.getByTestId('reloc-badge-building')
    expect(badge.textContent).toBe('Đổi toà')
    expect(getComputedStyle(badge).backgroundColor).toBe('rgb(109, 40, 217)')
  })

  it('summary: one "Từ → Đến" column and a purple (not red) "Đổi toà" badge', async () => {
    mockFetch()
    render(<RelocationTab lang="vi" />)
    await screen.findByLabelText('Chọn máy')
    pasteCodes('A-006-1 A-006-2')
    pickTarget('Toà B', '1F · Guide', 'A15-3')
    const summary = screen.getByRole('table', { name: 'Tóm tắt di dời' })
    expect(within(summary).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Mã', 'Tên', 'Từ → Đến', 'Loại'])
    expect(screen.getByTestId('summary-route-A-006-1').textContent).toMatch(/^Toà A \/ 1F \/ \S+ → Toà B \/ 1F \/ A15-3$/)
    const badge = screen.getByTestId('summary-badge-A-006-1')
    expect(badge.textContent).toBe('Đổi toà')
    expect(getComputedStyle(badge).backgroundColor).toBe('rgb(109, 40, 217)')
  })

  it('legend: current, old, new, other building', async () => {
    mockFetch()
    render(<RelocationTab lang="en" />)
    await screen.findByLabelText('Pick machines')
    expect(screen.getByTestId('reloc-legend').textContent).toBe('Current locationOld locationNew locationFrom/To another building')
  })
})

describe('RelocationTab - pick + destination row', () => {
  it('"✓ added" note next to the hint, hidden again after 3s; errors stay as alerts', async () => {
    mockFetch()
    render(<RelocationTab lang="vi" />)
    await screen.findByLabelText('Chọn máy')
    vi.useFakeTimers()
    try {
      pasteCodes('A-006-1 A-008-1')
      const note = screen.getByTestId('added-note')
      expect(note.textContent).toBe('✓ Đã thêm 1 máy')
      expect(note.getAttribute('aria-live')).toBe('polite')
      expect(document.querySelector('[data-report="wrongKind"]')).not.toBeNull()
      act(() => vi.advanceTimersByTime(2999))
      expect(note.textContent).toBe('✓ Đã thêm 1 máy')
      act(() => vi.advanceTimersByTime(1))
      expect(note.textContent).toBe('')
      expect(document.querySelector('[data-report="wrongKind"]')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('selection summary and "Remove all" live in the card header; the table has no asset-type column', async () => {
    mockFetch()
    render(<RelocationTab lang="vi" />)
    await screen.findByLabelText('Chọn máy')
    pasteCodes('A-006-1 A-007-1')
    const header = screen.getByTestId('selected-count').closest('.MuiCard-root')!.firstElementChild!
    expect(header.textContent).toContain('Đã chọn 2 máy từ 2 zone')
    expect(within(header as HTMLElement).getByRole('button', { name: 'Xoá tất cả' })).toBeTruthy()
    const table = screen.getByRole('table', { name: 'Máy đã chọn' })
    expect([...table.querySelectorAll('th')].map((th) => th.textContent)).toEqual(['Mã', 'Tên', 'Vị trí', ''])
  })

  it('floor options read "1F · Press", zone options "A1-1 · 26 máy"', async () => {
    mockFetch()
    render(<RelocationTab lang="vi" />)
    await screen.findByLabelText('Chọn máy')
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Toà nhà' }))
    fireEvent.click(screen.getByRole('option', { name: 'Toà A' }))
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Tầng / Khu' }))
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['1F · Press', '2F · All'])
    fireEvent.click(screen.getByRole('option', { name: '1F · Press' }))
    const zoneInput = screen.getByRole('combobox', { name: 'Zone' })
    fireEvent.mouseDown(zoneInput)
    fireEvent.keyDown(zoneInput, { key: 'ArrowDown' })
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toContain('A1-1 · 26 máy')
  })

  it('the destination card shows the route "N máy → Toà / floor / zone" with move badges', async () => {
    mockFetch()
    render(<RelocationTab lang="vi" />)
    await screen.findByLabelText('Chọn máy')
    pasteCodes('A-006-1 A-006-2')
    expect(screen.queryByTestId('target-route')).toBeNull()
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Toà nhà' }))
    fireEvent.click(screen.getByRole('option', { name: 'Toà B' }))
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Tầng / Khu' }))
    fireEvent.click(screen.getByRole('option', { name: '1F · Guide' }))
    fireEvent.click(screen.getByTestId('reloc-after-card').querySelector('.reloc-zone[data-zone="A15-3"]')!)
    expect(screen.getByTestId('target-route').textContent).toBe('2 máy→Toà B / 1F / A15-3Đổi toà')
    expect(screen.getByTestId('target-badge-building').textContent).toBe('Đổi toà')
    // Same component as the After card's route line.
    expect(screen.getByTestId('reloc-route').textContent).toBe(screen.getByTestId('target-route').textContent)
  })
})

