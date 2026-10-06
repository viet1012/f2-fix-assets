// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearLocationCache } from '../../hooks/useLocations'
import { SAMPLE_ASSETS, SAMPLE_LOCATIONS } from '../../test/locationSample'
import { resetTextMeasure } from './RelocationFloorMap'
import RelocationTab from './RelocationTab'
import { todayIso } from '../../utils/relocationForm'
import { downloadBlob, exportRelocationPng } from '../../utils/exportRelocationPng'

// jsdom has no canvas / image decoding: the PNG export is tested on its own (exportRelocationPng.test.ts).
vi.mock('../../utils/exportRelocationPng', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/exportRelocationPng')>()),
  exportRelocationPng: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
  downloadBlob: vi.fn(),
}))

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

function mockFetch(failAssets = false, requests: unknown[] = []) {
  const fn = vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/relocation-requests')) return json({ items: requests, page: 0, size: 100, total: requests.length })
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

/**
 * Tests that paste machines and then drive both full floor maps (Before + After re-render on every selection change):
 * fast alone, but slower than the 5s default when the whole suite runs in parallel on a loaded machine.
 */
const HEAVY_TEST_MS = 20000

const pasteCodes = (text: string) => {
  const input = screen.getByLabelText('Chọn máy')
  fireEvent.paste(input, { clipboardData: { getData: () => text } })
}

describe('RelocationTab with the location API', () => {
  it('fetches the Factory 2 scope; NONE assets go to the tray, floorMismatch shows a warning icon', async () => {
    const fetchMock = mockFetch()
    const { container } = render(<RelocationTab lang="vi" account="E001" />)
    await screen.findByLabelText('Chọn máy')
    const urls = fetchMock.mock.calls.map(([u]) => String(u))
    expect(urls.some((u) => u.endsWith('/api/assets/with-location?factory=Factory+2'))).toBe(true)
    expect(urls.some((u) => u.endsWith('/api/locations?assetFactory=Factory+2'))).toBe(true)

    pasteCodes('A-006-1 A-006-2 A-007-1')
    expect(screen.getByTestId('floor-mismatch-A-006-2')).toBeTruthy()
    expect(screen.queryByTestId('floor-mismatch-A-006-1')).toBeNull()

    // Before map (floor1): A-007-1 (NONE) is listed in the tray, not on the drawn A3-1 zone.
    expect(container.querySelector('.reloc-tray-zone[data-zone="A3-1"]')?.classList).toContain('zone-from')
    expect(container.querySelector('.reloc-zone[data-zone="A3-1"]')?.classList).toContain('zone-dim')
    expect(container.querySelector('.reloc-zone[data-zone="A2-3"]')?.classList).toContain('zone-from')
    expect(screen.queryByTestId('unplaced-zones')).toBeNull()
  }, HEAVY_TEST_MS)

  it('rejects a machine at an Outside location with its own message', async () => {
    mockFetch()
    const { container } = render(<RelocationTab lang="vi" account="E001" />)
    await screen.findByLabelText('Chọn máy')
    pasteCodes('A-006-1 A-900-1')
    expect(container.querySelector('[data-report="outside"]')?.textContent).toContain('A-900-1')
    expect(screen.getByTestId('selected-count').textContent).toBe('1')
  })

  it('fetches once per session across remounts', async () => {
    const fetchMock = mockFetch()
    const first = render(<RelocationTab lang="vi" account="E001" />)
    await screen.findByLabelText('Chọn máy')
    first.unmount()
    render(<RelocationTab lang="vi" account="E001" />)
    await screen.findByLabelText('Chọn máy')
    // Location data is cached; the request list is reloaded on each mount.
    expect(fetchMock.mock.calls.filter(([u]) => !String(u).includes('/api/relocation-requests'))).toHaveLength(2)
  })

  it('shows an error with a retry button instead of static data, and recovers on retry', async () => {
    const fetchMock = mockFetch(true)
    render(<RelocationTab lang="vi" account="E001" />)
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
    render(<RelocationTab lang="en" account="E001" />)
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
    const { container } = render(<RelocationTab lang="vi" account="E001" />)
    const zoneEl = await openA23(container)
    expect(zoneEl.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(/máy từ/).textContent).toContain('2 máy từ 2 zone')
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
    const { container } = render(<RelocationTab lang="vi" account="E001" />)
    await openA23(container)
    fireEvent.click(screen.getByRole('button', { name: 'Xoá A-006-1' }))
    expect(box('A-006-1').checked).toBe(false)
    fireEvent.click(item('A-006-1').querySelector('[role="button"]')!)
    expect(screen.getByRole('button', { name: 'Xoá A-006-1' })).toBeTruthy()
    fireEvent.click(list().getByRole('button', { name: 'Bỏ chọn' }))
    expect(screen.queryByRole('button', { name: 'Xoá A-006-1' })).toBeNull()
    expect(selectedCount()).toBe('1')
  }, HEAVY_TEST_MS)

  it('machines in an open request and wrong-kind machines are disabled and cannot be selected', async () => {
    mockFetch(false, [
      {
        requestNo: 'R0001', status: 'REQ_PENDING', requestedBy: 'E1', reason: 'x', plannedMoveDate: '2026-10-01', plannedDoneDate: '2026-10-02',
        to: { positionA: 'A1', positionAA: 'A1-1', positionAAA: null },
        items: [{ machineCode: 'A-006-2', from: { positionA: 'A2', positionAA: 'A2-3', positionAAA: null }, status: 'REQ_PENDING' }],
      },
    ])
    const { container } = render(<RelocationTab lang="vi" account="E001" />)
    await openA23(container)
    await waitFor(() => expect(item('A-006-2').getAttribute('data-reason')).toBe('pending'))
    // Submitted requests table: RequestNo and translated status.
    expect(screen.getByText('R0001')).toBeTruthy()
    expect(screen.getByText('Chờ duyệt')).toBeTruthy()
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
    const { container } = render(<RelocationTab lang="vi" account="E001" />)
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
  const pickTarget = (building: string, floor: string | null, zone: string) => {
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Toà nhà' }))
    fireEvent.click(screen.getByRole('option', { name: building }))
    // The floor list opens by itself (a single-floor building is picked for the user: floor = null).
    if (floor) fireEvent.click(screen.getByRole('option', { name: floor }))
    fireEvent.click(afterCard().querySelector('.reloc-zone[data-zone="' + zone + '"]')!)
  }
  const cardOf = (el: HTMLElement) => el.closest<HTMLElement>('.MuiCard-root')!

  it('headers: colour square, bold title, "Toà / floor" subtitle; Before card has an amber top border', async () => {
    mockFetch()
    render(<RelocationTab lang="vi" account="E001" />)
    await screen.findByLabelText('Chọn máy')
    pasteCodes('A-006-1 A-007-1')
    const before = cardOf(screen.getByTestId('reloc-before-card'))
    expect(within(before).getByText('Bố trí hiện tại (Trước)')).toBeTruthy()
    expect(within(before).getByText('Toà A / 1F')).toBeTruthy()
    expect(getComputedStyle(before).borderTopColor).toBe('rgb(183, 121, 31)')
    expect(within(cardOf(afterCard())).getByText('Bố trí sau di dời (Sau)')).toBeTruthy()
    expect(afterCard().getAttribute('data-move')).toBe('none')
  })

  it('Before card header: no source chips; the browse-by-zone selects sit in the header row', async () => {
    mockFetch()
    render(<RelocationTab lang="vi" account="E001" />)
    await screen.findByLabelText('Chọn máy')
    pasteCodes('A-006-1 A-006-2 A-015-1')
    const before = cardOf(screen.getByTestId('reloc-before-card'))
    expect(before.querySelector('.reloc-source-chip')).toBeNull()
    const header = before.firstElementChild as HTMLElement
    expect(within(header).getByRole('combobox', { name: 'Toà nhà (vị trí hiện tại)' })).toBeTruthy()
    expect(within(header).getByRole('combobox', { name: 'Duyệt theo zone' })).toBeTruthy()
    // Several layouts: the layout pills are still there.
    expect(document.querySelectorAll('.reloc-layout-pill')).toHaveLength(2)
  })

  it('layout pills when the selection spans several layouts; the active one is solid amber', async () => {
    mockFetch()
    render(<RelocationTab lang="vi" account="E001" />)
    await screen.findByLabelText('Chọn máy')
    pasteCodes('A-006-1 A-015-1')
    expect(screen.getByText('Máy đã chọn nằm ở nhiều tầng:')).toBeTruthy()
    const pills = [...document.querySelectorAll<HTMLElement>('.reloc-layout-pill')]
    expect(pills.map((p) => p.textContent)).toEqual(['Toà A / 1F (1)', 'Toà B / 1F (1)'])
    expect(pills[0].getAttribute('aria-pressed')).toBe('true')
    expect(getComputedStyle(pills[0]).backgroundColor).toBe('rgb(183, 121, 31)')
    fireEvent.click(pills[1])
    expect(document.querySelector('.reloc-layout-pill.is-active')?.textContent).toBe('Toà B / 1F (1)')
    expect(within(cardOf(screen.getByTestId('reloc-before-card'))).getByText('Toà B / 1F')).toBeTruthy()
  })

  it('empty: compact Before/After empty states (no tall frame) and rows aligned to start; stretch once both sides have content', async () => {
    mockFetch()
    render(<RelocationTab lang="vi" account="E001" />)
    await screen.findByLabelText('Chọn máy')
    for (const id of ['reloc-before-empty', 'reloc-after-empty']) {
      const el = screen.getByTestId(id)
      expect(getComputedStyle(el).maxHeight).toBe('96px')
      expect(getComputedStyle(el).minHeight === '' || getComputedStyle(el).minHeight === '0px' || getComputedStyle(el).minHeight === 'auto').toBe(true)
    }
    // Nothing (no reserved info row) between the card header and the map frame.
    expect(screen.getByTestId('reloc-before-empty').previousElementSibling).toBeNull()
    expect(screen.getByTestId('reloc-row-pick').getAttribute('data-align')).toBe('start')
    expect(screen.getByTestId('reloc-row-summary').getAttribute('data-align')).toBe('start')
    expect(getComputedStyle(screen.getByTestId('reloc-row-pick')).alignItems).toBe('start')
    expect(screen.getByText('Chọn máy và vị trí đích để xem tóm tắt.')).toBeTruthy()

    pasteCodes('A-006-1 A-006-2')
    expect(screen.getByTestId('reloc-row-pick').getAttribute('data-align')).toBe('start')
    pickTarget('Toà A', '1F · Press', 'A1-1')
    expect(screen.getByTestId('target-route')).toBeTruthy()
    expect(screen.getByTestId('reloc-row-pick').getAttribute('data-align')).toBe('stretch')
    expect(screen.getByTestId('reloc-row-summary').getAttribute('data-align')).toBe('stretch')
    expect(screen.queryByTestId('reloc-after-empty')).toBeNull()
  }, HEAVY_TEST_MS)

  it('same floor: green After border, route line with a light "Cùng tầng" badge, no banner', async () => {
    mockFetch()
    render(<RelocationTab lang="vi" account="E001" />)
    await screen.findByLabelText('Chọn máy')
    pasteCodes('A-006-1 A-006-2')
    pickTarget('Toà A', '1F · Press', 'A1-1')
    expect(afterCard().getAttribute('data-move')).toBe('same')
    expect(getComputedStyle(cardOf(afterCard())).borderTopColor).toBe('rgb(4, 120, 87)')
    expect(screen.queryByTestId('reloc-cross-banner')).toBeNull()
    expect(screen.getByTestId('target-route').textContent).toContain('2 máy→Toà A / 1F / A1-1')
    expect(screen.getByTestId('target-badge-same').textContent).toBe('Cùng tầng')
    expect(screen.queryByTestId('target-badge-building')).toBeNull()
  })

  it('building change: purple banner and border, solid "Đổi toà" badge', async () => {
    mockFetch()
    render(<RelocationTab lang="vi" account="E001" />)
    await screen.findByLabelText('Chọn máy')
    pasteCodes('A-006-1 A-006-2')
    pickTarget('Toà B', null, 'A15-3')
    expect(afterCard().getAttribute('data-move')).toBe('cross')
    expect(screen.getByTestId('reloc-cross-banner').textContent).toBe('Đổi toà: Toà A / 1F → Toà B / 1F')
    expect(getComputedStyle(cardOf(afterCard())).borderTopColor).toBe('rgb(109, 40, 217)')
    const badge = screen.getByTestId('target-badge-building')
    expect(badge.textContent).toBe('Đổi toà')
    expect(getComputedStyle(badge).backgroundColor).toBe('rgb(109, 40, 217)')
  })

  it('summary: one "Từ → Đến" column and a purple (not red) "Đổi toà" badge', async () => {
    mockFetch()
    render(<RelocationTab lang="vi" account="E001" />)
    await screen.findByLabelText('Chọn máy')
    pasteCodes('A-006-1 A-006-2')
    pickTarget('Toà B', null, 'A15-3')
    const summary = screen.getByRole('table', { name: 'Tóm tắt di dời' })
    expect(within(summary).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Mã', 'Tên', 'Từ → Đến', 'Loại'])
    expect(screen.getByTestId('summary-route-A-006-1').textContent).toMatch(/^Toà A \/ 1F \/ \S+ → Toà B \/ 1F \/ A15-3$/)
    const badge = screen.getByTestId('summary-badge-A-006-1')
    expect(badge.textContent).toBe('Đổi toà')
    expect(getComputedStyle(badge).backgroundColor).toBe('rgb(109, 40, 217)')
  })

  it('legend: current, old, new, other building', async () => {
    mockFetch()
    render(<RelocationTab lang="en" account="E001" />)
    await screen.findByLabelText('Pick machines')
    expect(screen.getByTestId('reloc-legend').textContent).toBe('Current locationOld locationNew locationFrom/To another building')
  })
})

describe('RelocationTab - pick + destination row', () => {
  it('"✓ added" note next to the hint, hidden again after 3s; errors stay as alerts', async () => {
    mockFetch()
    render(<RelocationTab lang="vi" account="E001" />)
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
    render(<RelocationTab lang="vi" account="E001" />)
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
    render(<RelocationTab lang="vi" account="E001" />)
    await screen.findByLabelText('Chọn máy')
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Toà nhà' }))
    fireEvent.click(screen.getByRole('option', { name: 'Toà A' }))
    // The cascade opens each next field.
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['1F · Press', '2F · All'])
    fireEvent.click(screen.getByRole('option', { name: '1F · Press' }))
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toContain('A1-1 · 26 máy')
  })

  it('the destination card shows the route "N máy → Toà / floor / zone" with move badges', async () => {
    mockFetch()
    render(<RelocationTab lang="vi" account="E001" />)
    await screen.findByLabelText('Chọn máy')
    pasteCodes('A-006-1 A-006-2')
    expect(screen.queryByTestId('target-route')).toBeNull()
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Toà nhà' }))
    fireEvent.click(screen.getByRole('option', { name: 'Toà B' }))
    fireEvent.click(screen.getByTestId('reloc-after-card').querySelector('.reloc-zone[data-zone="A15-3"]')!)
    expect(screen.getByTestId('target-route').textContent).toBe('2 máy→Toà B / 1F / A15-3Đổi toà')
    expect(screen.getByTestId('target-badge-building').textContent).toBe('Đổi toà')
    // The route line is shown once: in the destination card only (not in the After map header).
    expect(screen.getAllByTestId(/-route$/)).toHaveLength(1)
    expect(within(screen.getByTestId('reloc-after-card')).queryByTestId(/-route$/)).toBeNull()
  })
})

describe('RelocationTab - guided flow', () => {
  const machineInput = () => screen.getByRole('combobox', { name: 'Chọn máy' }) as HTMLInputElement
  const active = () => document.activeElement as HTMLElement
  const stepState = (n: number) => screen.getByTestId('reloc-stepper').querySelector(`[data-step="${n}"]`)!.getAttribute('data-state')
  /** The open Select menu that holds the focus (its listbox). */
  const focusedListbox = () => active().closest('[role="listbox"]') ?? active().querySelector('[role="listbox"]')

  it('picking the first machine keeps the focus in the picker; destination card flashes and the next step is announced', async () => {
    mockFetch()
    render(<RelocationTab lang="vi" account="E001" />)
    await screen.findByLabelText('Chọn máy')
    expect(stepState(1)).toBe('active')
    machineInput().focus()
    fireEvent.mouseDown(machineInput())
    fireEvent.change(machineInput(), { target: { value: 'A-006-1' } })
    fireEvent.click(screen.getByRole('option', { name: /A-006-1/ }))
    expect(screen.getByTestId('selected-count').textContent).toBe('1')
    expect(active()).toBe(machineInput())
    expect(screen.getByTestId('reloc-next-hint').textContent).toBe('Đã chọn 1 máy. Tiếp theo: chọn vị trí đích.')
    expect(stepState(1)).toBe('active')
    expect(screen.getByTestId('reloc-step-summary-1').textContent).toBe('· 1 máy')
  })

  it('"Tiếp" focuses and opens "Toà nhà"; Esc returns the focus to it', async () => {
    mockFetch()
    render(<RelocationTab lang="vi" account="E001" />)
    await screen.findByLabelText('Chọn máy')
    expect(screen.queryByRole('button', { name: 'Tiếp: Chọn vị trí đích →' })).toBeNull()
    pasteCodes('A-006-1 A-006-2')
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp: Chọn vị trí đích →' }))
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toContain('Toà A')
    expect(focusedListbox()).not.toBeNull()
    expect(stepState(2)).toBe('active')
    fireEvent.keyDown(focusedListbox()!, { key: 'Escape' })
    await waitFor(() => expect(active()).toBe(screen.getByRole('combobox', { name: 'Toà nhà' })))
  })

  it('Enter in the empty picker input moves on to "Toà nhà"', async () => {
    mockFetch()
    render(<RelocationTab lang="vi" account="E001" />)
    await screen.findByLabelText('Chọn máy')
    pasteCodes('A-006-1 A-006-2')
    machineInput().focus()
    fireEvent.keyDown(machineInput(), { key: 'Enter' })
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toContain('Toà B')
    expect(focusedListbox()).not.toBeNull()
  })

  it('cascade: Toà → Tầng → Zone → "Ngày dự kiến"', async () => {
    mockFetch()
    render(<RelocationTab lang="vi" account="E001" />)
    await screen.findByLabelText('Chọn máy')
    pasteCodes('A-006-1 A-006-2')
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Toà nhà' }))
    fireEvent.click(screen.getByRole('option', { name: 'Toà A' }))
    // Floor list open, focus inside it.
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['1F · Press', '2F · All'])
    expect(focusedListbox()).not.toBeNull()
    fireEvent.click(screen.getByRole('option', { name: '1F · Press' }))
    const zone = screen.getByRole('combobox', { name: 'Zone' })
    expect(active()).toBe(zone)
    expect(zone.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(screen.getByRole('option', { name: /^A1-1 ·/ }))
    expect(active()).toBe(screen.getByLabelText(/Ngày dự kiến/))
    expect(stepState(3)).toBe('active')
    expect(stepState(2)).toBe('done')
    expect(screen.getByTestId('reloc-step-summary-2').textContent).toBe('· A1-1')
  }, HEAVY_TEST_MS)

  it('a single-floor building picks its floor and jumps to Zone; changing the building clears floor and zone', async () => {
    mockFetch()
    render(<RelocationTab lang="vi" account="E001" />)
    await screen.findByLabelText('Chọn máy')
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Toà nhà' }))
    fireEvent.click(screen.getByRole('option', { name: 'Toà B' }))
    expect(screen.getByRole('combobox', { name: 'Tầng / Khu' }).textContent).toBe('1F · Guide')
    expect(active()).toBe(screen.getByRole('combobox', { name: 'Zone' }))
    // Map click on the After map: also moves on to the details.
    fireEvent.click(screen.getByTestId('reloc-after-card').querySelector('.reloc-zone[data-zone="A15-3"]')!)
    expect(active()).toBe(screen.getByLabelText(/Ngày dự kiến/))
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Toà nhà' }))
    fireEvent.click(screen.getByRole('option', { name: 'Toà A' }))
    expect((screen.getByRole('combobox', { name: 'Zone', hidden: true }) as HTMLInputElement).value).toBe('')
    expect(screen.getByRole('combobox', { name: 'Tầng / Khu', hidden: true }).textContent).not.toContain('Guide')
  }, HEAVY_TEST_MS)

  const cardOf = (testId: string) => screen.getByTestId(testId).closest<HTMLElement>('.MuiCard-root')!
  /** matchMedia (reduced motion) and CSS.registerProperty (@property support) for the running ring. */
  const motion = (reduced: boolean) => {
    vi.stubGlobal('CSS', { registerProperty: vi.fn(), supports: () => true, escape: (v: string) => v })
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (q: string) => ({ matches: reduced && q.includes('reduce'), media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }),
    })
  }
  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia
  })

  it('chevron stepper: aria-current on the active step only; a click scrolls to its card', async () => {
    mockFetch()
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    try {
      render(<RelocationTab lang="vi" account="E001" />)
      await screen.findByLabelText('Chọn máy')
      const buttons = () => within(screen.getByTestId('reloc-stepper')).getAllByRole('button')
      expect(buttons().map((b) => b.getAttribute('aria-current'))).toEqual(['step', null, null])
      pasteCodes('A-006-1 A-006-2')
      fireEvent.click(screen.getByRole('button', { name: 'Tiếp: Chọn vị trí đích →' }))
      fireEvent.keyDown(screen.getAllByRole('option')[0], { key: 'Escape' })
      expect(buttons().map((b) => b.getAttribute('aria-current'))).toEqual([null, 'step', null])
      expect(buttons()[0].getAttribute('data-state')).toBe('done')
      scroll.mockClear()
      fireEvent.click(buttons()[2])
      expect(scroll).toHaveBeenCalledTimes(1)
      expect(scroll.mock.contexts[0]).toBe(screen.getByLabelText('Thông tin yêu cầu').closest('.MuiCard-root'))
      expect(buttons()[2].getAttribute('aria-current')).toBe('step')
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
    }
  })

  it('the card of a step that just became active gets the running ring, then keeps the static one', async () => {
    mockFetch()
    motion(false)
    render(<RelocationTab lang="vi" account="E001" />)
    await screen.findByLabelText('Chọn máy')
    const pick = screen.getByLabelText('Chọn máy').closest<HTMLElement>('.MuiCard-root')!
    // Initial step: static ring, no run on mount.
    expect(pick.classList).toContain('reloc-step-active')
    expect(pick.classList).not.toContain('is-running')
    pasteCodes('A-006-1 A-006-2')
    vi.useFakeTimers()
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Tiếp: Chọn vị trí đích →' }))
      const dest = cardOf('reloc-dest')
      expect(dest.classList).toContain('reloc-step-active')
      expect(dest.classList).toContain('is-running')
      expect(pick.classList).not.toContain('reloc-step-active')
      // Drawn inside the card: it keeps overflow hidden.
      expect(getComputedStyle(dest).overflow).toBe('hidden')
      // Keeps running (the step change's own focus does not count) until the user focuses the card.
      act(() => vi.advanceTimersByTime(5000))
      expect(dest.classList).toContain('is-running')
      fireEvent.focusIn(screen.getByRole('combobox', { name: 'Toà nhà', hidden: true }))
      expect(dest.classList).not.toContain('is-running')
      expect(dest.classList).toContain('reloc-step-active')
      // Without interaction it stops after 20s.
      fireEvent.click(within(screen.getByTestId('reloc-stepper')).getAllByRole('button', { hidden: true })[2])
      const form = screen.getByLabelText('Thông tin yêu cầu', { selector: 'form' }).closest<HTMLElement>('.MuiCard-root')!
      expect(form.classList).toContain('is-running')
      act(() => vi.advanceTimersByTime(19999))
      expect(form.classList).toContain('is-running')
      act(() => vi.advanceTimersByTime(1))
      expect(form.classList).not.toContain('is-running')
    } finally {
      vi.useRealTimers()
    }
  })

  it('reduced motion: static ring only, no running animation', async () => {
    mockFetch()
    motion(true)
    render(<RelocationTab lang="vi" account="E001" />)
    await screen.findByLabelText('Chọn máy')
    pasteCodes('A-006-1 A-006-2')
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp: Chọn vị trí đích →' }))
    const dest = cardOf('reloc-dest')
    expect(dest.classList).toContain('reloc-step-active')
    expect(document.querySelector('.is-running')).toBeNull()
    // Static ring + glow instead.
    expect(dest.classList).toContain('is-glow')
  })

  it('compact stepper: fits its content (no flex: 1 / width: 100%), 28px chevrons with a title', async () => {
    mockFetch()
    render(<RelocationTab lang="vi" account="E001" />)
    await screen.findByLabelText('Chọn máy')
    const stepper = screen.getByTestId('reloc-stepper')
    expect(getComputedStyle(stepper.querySelector('ol')!).display).toBe('inline-flex')
    for (const li of stepper.querySelectorAll('li')) expect(getComputedStyle(li).flexGrow).not.toBe('1')
    for (const b of within(stepper).getAllByRole('button')) {
      expect(getComputedStyle(b).width).not.toBe('100%')
      expect(getComputedStyle(b).height).toBe('28px')
    }
    expect(within(stepper).getAllByRole('button').map((b) => b.getAttribute('title'))).toEqual(['Chọn máy', 'Vị trí đích', 'Thông tin & gửi'])
  })

  it('stepper is localized (en) and a click activates the step', async () => {
    mockFetch()
    render(<RelocationTab lang="en" account="E001" />)
    await screen.findByLabelText('Pick machines')
    const stepper = screen.getByTestId('reloc-stepper')
    expect(within(stepper).getAllByRole('button').map((b) => b.textContent)).toEqual(['1Pick machines', '2Destination', '3Details & submit'])
    fireEvent.click(within(stepper).getByRole('button', { name: /Details & submit/ }))
    expect(stepState(3)).toBe('active')
    expect(within(stepper).getByRole('button', { name: /Details & submit/ }).getAttribute('aria-current')).toBe('step')
  })
})

describe('RelocationTab - submit', { timeout: 20000 }, () => {
  const today = todayIso()
  const DRAWING_URL = 'https://files.example/drawings/R0001.png'
  const apiReq = (drawingUrl: string | null) => ({
    requestNo: 'R0001',
    status: 'REQ_PENDING',
    requestedBy: 'E001',
    reason: 'Re-layout',
    plannedMoveDate: today,
    plannedDoneDate: today,
    createdAt: `${today}T09:00:00`,
    drawingUrl,
    to: { positionA: 'A1', positionAA: 'A1-1', positionAAA: null },
    items: [{ machineCode: 'A-006-1', from: { positionA: 'A2', positionAA: 'A2-3', positionAAA: null }, status: 'REQ_PENDING' }],
  })
  const created201 = () =>
    json(
      {
        requestNo: 'R0001',
        status: 'REQ_PENDING',
        skipped: ['A-006-2'],
        items: [{ machineCode: 'A-006-1', from: { positionA: 'A2', positionAA: 'A2-3', positionAAA: null }, to: { positionA: 'A1', positionAA: 'A1-1', positionAAA: null }, moveType: 'same' }],
      },
      201,
    )
  const drawingOk = () => json({ fileName: 'R0001.png', webUrl: DRAWING_URL })
  /** POST create / POST drawing answers; GET returns what was stored. */
  const excelOk = () => json({ fileName: 'R0001.xlsx', webUrl: null })
  function mockSubmit(post: () => Promise<Response>, drawing: () => Promise<Response> = drawingOk, initial: unknown[] = [], detail?: unknown, excel: () => Promise<Response> = excelOk) {
    let stored: ReturnType<typeof apiReq>[] = initial as ReturnType<typeof apiReq>[]
    const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/excel') && init?.method === 'POST') return excel()
      if (url.includes('/drawing') && init?.method === 'POST') {
        return drawing().then((r) => {
          if (r.ok) stored = [apiReq(DRAWING_URL)]
          return r
        })
      }
      if (url.includes('/api/relocation-requests') && init?.method === 'POST') {
        return post().then((r) => {
          if (r.ok) stored = [apiReq(null)]
          return r
        })
      }
      // GET detail: the stored snapshot (from = *_BF, to = *_AT per machine).
      if (/\/api\/relocation-requests\/[^/?]+$/.test(url)) return json(detail ?? stored[0])
      if (url.includes('/api/relocation-requests')) return json({ items: stored, page: 0, size: 100, total: stored.length })
      if (url.includes('/api/assets/with-location')) return json(SAMPLE_ASSETS)
      if (url.includes('/api/locations')) return json(SAMPLE_LOCATIONS)
      return json({ error: 'unexpected' }, 404)
    })
    vi.stubGlobal('fetch', fn)
    return fn
  }
  const drawingPosts = (fn: ReturnType<typeof mockSubmit>) => fn.mock.calls.filter(([u, init]) => String(u).endsWith('/api/relocation-requests/R0001/drawing') && init?.method === 'POST')
  const fillAndSubmit = async () => {
    await screen.findByLabelText('Chọn máy')
    pasteCodes('A-006-1 A-006-2')
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Toà nhà' }))
    fireEvent.click(screen.getByRole('option', { name: 'Toà A' }))
    fireEvent.click(screen.getByRole('option', { name: '1F · Press' }))
    fireEvent.click(screen.getByTestId('reloc-after-card').querySelector('.reloc-zone[data-zone="A1-1"]')!)
    fireEvent.change(screen.getByLabelText(/Ngày dự kiến/), { target: { value: today } })
    fireEvent.change(screen.getByLabelText(/Ngày hoàn thành/), { target: { value: today } })
    fireEvent.change(screen.getByLabelText(/Lý do/), { target: { value: 'Re-layout' } })
    fireEvent.click(screen.getByRole('button', { name: /Gửi yêu cầu/ }))
  }
  const banner = () => screen.getByTestId('reloc-created')

  beforeEach(() => {
    vi.mocked(exportRelocationPng).mockClear()
    vi.mocked(downloadBlob).mockClear()
  })

  it('success: posts the date strings, resets form and selection, exports + uploads the PNG, links the file, reloads the table', async () => {
    const fetchMock = mockSubmit(created201)
    render(<RelocationTab lang="vi" account="E001" />)
    await fillAndSubmit()
    await waitFor(() => expect(banner().getAttribute('data-drawing')).toBe('saved'))
    // The request number is shown verbatim from the API.
    expect(banner().textContent).toContain('Đã tạo R0001 · Đã lưu bản vẽ · Đã lưu Excel')
    expect(banner().getAttribute('data-excel')).toBe('saved')
    expect(within(banner()).queryByRole('button', { name: 'Tạo lại Excel' })).toBeNull()
    expect(banner().textContent).toContain('A-006-2')
    expect(screen.getByTestId('reloc-drawing-link').getAttribute('href')).toBe(DRAWING_URL)
    const post = fetchMock.mock.calls.find(([u, init]) => String(u).endsWith('/api/relocation-requests') && init?.method === 'POST')!
    const body = JSON.parse(String(post[1]!.body))
    expect(body).toMatchObject({ plannedMoveDate: today, plannedDoneDate: today })
    // The requester is the session account: never sent.
    expect(body).not.toHaveProperty('requestedBy')
    expect(post[1]!.credentials).toBe('include')
    expect(screen.getByTestId('reloc-requester').textContent).toContain('E001')
    // The PNG is built from the snapshot taken before the reset: the machine written by the API, its target.
    expect(exportRelocationPng).toHaveBeenCalledTimes(1)
    const input = vi.mocked(exportRelocationPng).mock.calls[0][0]
    expect(input.request.id).toBe('R0001')
    // PNG "Requested by" = the session account.
    expect(input.request.requestedBy).toBe('E001')
    expect(input.rows.map((r) => r.code)).toEqual(['A-006-1'])
    expect(input.target).toEqual({ layoutId: 'floor1', zone: 'A1-1' })
    expect(input.beforeLayout?.id).toBe('floor1')
    const upload = drawingPosts(fetchMock)
    expect(upload).toHaveLength(1)
    const file = (upload[0][1]!.body as FormData).get('file') as File
    expect(file.type).toBe('image/png')
    expect(file.name).toBe('R0001.png')
    expect(screen.getByTestId('selected-count').textContent).toBe('0')
    expect((screen.getByLabelText(/Ngày dự kiến/) as HTMLInputElement).value).toBe('')
    const table = screen.getByRole('table', { name: 'Yêu cầu đã gửi' })
    expect(within(table).getAllByText(`${today.slice(8, 10)}/${today.slice(5, 7)}/${today.slice(0, 4)}`)).toHaveLength(2)
    await waitFor(() => expect(within(table).getByTestId('drawing-link-R0001').getAttribute('href')).toBe(DRAWING_URL))
    // Initial load, reload after the POST, reload after the upload.
    expect(fetchMock.mock.calls.filter(([u, init]) => String(u).includes('/api/relocation-requests') && init?.method !== 'POST')).toHaveLength(3)
  })

  it('upload failure: the request stays, "chưa lưu được bản vẽ" + retry, which uploads the same PNG again', async () => {
    let fail = true
    const fetchMock = mockSubmit(created201, () => (fail ? json({ error: 'Storage offline' }, 503) : drawingOk()))
    render(<RelocationTab lang="vi" account="E001" />)
    await fillAndSubmit()
    await waitFor(() => expect(banner().getAttribute('data-drawing')).toBe('failed'))
    expect(banner().textContent).toContain('Đã tạo R0001 nhưng chưa lưu được bản vẽ')
    const table = screen.getByRole('table', { name: 'Yêu cầu đã gửi' })
    expect(within(table).getByText('R0001')).toBeTruthy()
    expect(within(table).getByRole('button', { name: 'Tải lên lại' })).toBeTruthy()

    fail = false
    fireEvent.click(within(banner()).getByRole('button', { name: 'Thử lại' }))
    await waitFor(() => expect(banner().getAttribute('data-drawing')).toBe('saved'))
    expect(drawingPosts(fetchMock)).toHaveLength(2)
    expect(exportRelocationPng).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(within(table).getByTestId('drawing-link-R0001')).toBeTruthy())
  })

  it('excelError in the create response: "Chưa lưu được Excel" + "Tạo lại Excel", which POSTs /{no}/excel', async () => {
    const withExcelError = () =>
      created201().then(async (r) => json({ ...(await r.json()), excelError: 'SharePoint offline' }, 201))
    const fetchMock = mockSubmit(withExcelError)
    render(<RelocationTab lang="vi" account="E001" />)
    await fillAndSubmit()
    await waitFor(() => expect(banner().getAttribute('data-drawing')).toBe('saved'))
    expect(banner().textContent).toContain('Đã tạo R0001 · Đã lưu bản vẽ · Chưa lưu được Excel')
    expect(banner().getAttribute('data-excel')).toBe('failed')
    fireEvent.click(within(banner()).getByRole('button', { name: 'Tạo lại Excel' }))
    await waitFor(() => expect(banner().getAttribute('data-excel')).toBe('saved'))
    expect(banner().textContent).toContain('Đã lưu Excel')
    const posts = fetchMock.mock.calls.filter(([u, init]) => String(u).endsWith('/api/relocation-requests/R0001/excel') && init?.method === 'POST')
    expect(posts).toHaveLength(1)
  })

  it('excelError in the drawing response: the banner offers "Tạo lại Excel" too', async () => {
    mockSubmit(created201, () => json({ fileName: 'R0001.png', webUrl: DRAWING_URL, excelError: 'Template missing' }))
    render(<RelocationTab lang="vi" account="E001" />)
    await fillAndSubmit()
    await waitFor(() => expect(banner().getAttribute('data-excel')).toBe('failed'))
    expect(banner().textContent).toContain('Chưa lưu được Excel')
    expect(within(banner()).getByRole('button', { name: 'Tạo lại Excel' })).toBeTruthy()
  })

  it('table action menu "Tạo lại Excel": only on my requests, POSTs /{no}/excel', async () => {
    const fetchMock = mockSubmit(created201, drawingOk, [apiReq(null), { ...apiReq(null), requestNo: 'R0002', requestedBy: 'E999' }])
    render(<RelocationTab lang="vi" account="E001" />)
    const table = await screen.findByRole('table', { name: 'Yêu cầu đã gửi' })
    expect(within(table).queryByRole('button', { name: 'Hành động R0002' })).toBeNull()
    fireEvent.click(within(table).getByRole('button', { name: 'Hành động R0001' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Tạo lại Excel' }))
    expect(await screen.findByText('Đã tạo lại Excel cho R0001')).toBeTruthy()
    expect(fetchMock.mock.calls.filter(([u, init]) => String(u).endsWith('/api/relocation-requests/R0001/excel') && init?.method === 'POST')).toHaveLength(1)
  })

  it('"Tải PNG về máy" downloads the PNG of the request', async () => {
    mockSubmit(created201, () => json({ error: 'Storage offline' }, 503))
    render(<RelocationTab lang="vi" account="E001" />)
    await fillAndSubmit()
    await waitFor(() => expect(banner().getAttribute('data-drawing')).toBe('failed'))
    fireEvent.click(within(banner()).getByRole('button', { name: 'Tải PNG về máy' }))
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1))
    const [blob, name] = vi.mocked(downloadBlob).mock.calls[0]
    expect(blob.type).toBe('image/png')
    expect(name).toBe('R0001.png')
  })

  it('table "Tải lên lại": rebuilds the PNG from the GET detail snapshot, not from where the machine is now', async () => {
    // A-006-1 is now in A2-3 (asset API); the request snapshot says it left A1-1 for A3-1, created by E777.
    const detail = {
      ...apiReq(null),
      requestedBy: 'E777',
      plannedMoveDate: '2026-11-02',
      plannedDoneDate: '2026-11-09',
      createdAt: '2026-10-20T08:00:00',
      to: { positionA: 'A3', positionAA: 'A3-1', positionAAA: null },
      items: [{ machineCode: 'A-006-1', from: { positionA: 'A1', positionAA: 'A1-1', positionAAA: null }, to: { positionA: 'A3', positionAA: 'A3-1', positionAAA: null }, status: 'REQ_PENDING' }],
    }
    const fetchMock = mockSubmit(created201, drawingOk, [apiReq(null)], detail)
    render(<RelocationTab lang="vi" account="E001" />)
    const table = await screen.findByRole('table', { name: 'Yêu cầu đã gửi' })
    fireEvent.click(within(table).getByRole('button', { name: 'Tải lên lại' }))
    await waitFor(() => expect(within(table).getByTestId('drawing-link-R0001')).toBeTruthy())
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/api/relocation-requests/R0001'))).toBe(true)
    expect(drawingPosts(fetchMock)).toHaveLength(1)
    expect(exportRelocationPng).toHaveBeenCalledTimes(1)
    const input = vi.mocked(exportRelocationPng).mock.calls[0][0]
    expect(input.rows).toHaveLength(1)
    expect(input.rows[0]).toMatchObject({ code: 'A-006-1', name: 'Machine A-006-1', currentZone: 'A1-1', positionA: 'A1' })
    expect(input.target).toEqual({ layoutId: 'floor1', zone: 'A3-1' })
    expect(input.request).toMatchObject({ requestedBy: 'E777', plannedMoveDate: '2026-11-02', plannedDoneDate: '2026-11-09', createdAt: '2026-10-20T08:00:00' })
    expect(input.beforeLayout?.id).toBe('floor1')
  })

  it('table "Tải lên lại": spinner + "Đang tạo bản vẽ…" while building, repeated clicks ignored', async () => {
    let release: () => void = () => {}
    const fetchMock = mockSubmit(created201, () => new Promise<Response>((resolve) => { release = () => resolve(new Response(JSON.stringify({ fileName: 'R0001.png', webUrl: DRAWING_URL }), { status: 200, headers: { 'Content-Type': 'application/json' } })) }), [apiReq(null)])
    render(<RelocationTab lang="vi" account="E001" />)
    const table = await screen.findByRole('table', { name: 'Yêu cầu đã gửi' })
    const button = within(table).getByRole('button', { name: 'Tải lên lại' })
    fireEvent.click(button)
    fireEvent.click(button)
    const busy = await within(table).findByRole('button', { name: 'Đang tạo bản vẽ…' })
    expect((busy as HTMLButtonElement).disabled).toBe(true)
    expect(within(table).getByTestId('drawing-spinner-R0001')).toBeTruthy()
    await waitFor(() => expect(drawingPosts(fetchMock)).toHaveLength(1))
    act(() => release())
    await waitFor(() => expect(within(table).getByTestId('drawing-link-R0001')).toBeTruthy())
    expect(drawingPosts(fetchMock)).toHaveLength(1)
    expect(exportRelocationPng).toHaveBeenCalledTimes(1)
  })

  it('"Chỉ yêu cầu của tôi" keeps only the requests of the logged-in account', async () => {
    mockSubmit(created201, drawingOk, [apiReq(null), { ...apiReq(null), requestNo: 'R0002', requestedBy: 'E999' }])
    render(<RelocationTab lang="vi" account="e001" />)
    const table = await screen.findByRole('table', { name: 'Yêu cầu đã gửi' })
    expect(within(table).getByText('R0002')).toBeTruthy()
    fireEvent.click(screen.getByRole('switch', { name: 'Chỉ yêu cầu của tôi' }))
    expect(within(table).getByText('R0001')).toBeTruthy()
    expect(within(table).queryByText('R0002')).toBeNull()
  })

  it('re-upload answered 403: "Chỉ người tạo mới được tải lên lại"', async () => {
    mockSubmit(created201, () => json({ error: 'Forbidden' }, 403), [{ ...apiReq(null), requestedBy: 'E999' }])
    render(<RelocationTab lang="vi" account="E001" />)
    const table = await screen.findByRole('table', { name: 'Yêu cầu đã gửi' })
    fireEvent.click(within(table).getByRole('button', { name: 'Tải lên lại' }))
    expect(await screen.findByText('Chỉ người tạo mới được tải lên lại')).toBeTruthy()
  })

  it('409: the machines in codes are marked red in the selected table; the selection is kept', async () => {
    mockSubmit(() => json({ error: 'conflict', codes: ['A-006-2'] }, 409))
    render(<RelocationTab lang="vi" account="E001" />)
    await fillAndSubmit()
    await screen.findByText('Máy đang có yêu cầu di dời chưa xử lý: A-006-2')
    const table = screen.getByRole('table', { name: 'Máy đã chọn' })
    expect(table.querySelector('tr[data-code="A-006-2"]')?.getAttribute('data-conflict')).toBe('true')
    expect(table.querySelector('tr[data-code="A-006-2"]')?.getAttribute('aria-invalid')).toBe('true')
    expect(table.querySelector('tr[data-code="A-006-1"]')?.hasAttribute('data-conflict')).toBe(false)
    expect(screen.queryByTestId('reloc-created')).toBeNull()
    expect(exportRelocationPng).not.toHaveBeenCalled()
  })
})
