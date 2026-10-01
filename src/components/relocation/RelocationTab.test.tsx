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
    // Location data is cached; the request list is reloaded on each mount.
    expect(fetchMock.mock.calls.filter(([u]) => !String(u).includes('/api/relocation-requests'))).toHaveLength(2)
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

  it('machines in an open request and wrong-kind machines are disabled and cannot be selected', async () => {
    mockFetch(false, [
      {
        requestNo: 'RL-2026-0001', status: 'REQ_PENDING_PE', requestedBy: 'E1', reason: 'x', plannedMoveDate: '2026-10-01', plannedDoneDate: '2026-10-02',
        to: { positionA: 'A1', positionAA: 'A1-1', positionAAA: null },
        items: [{ machineCode: 'A-006-2', from: { positionA: 'A2', positionAA: 'A2-3', positionAAA: null }, status: 'REQ_PENDING_PE' }],
      },
    ])
    const { container } = render(<RelocationTab lang="vi" />)
    await openA23(container)
    await waitFor(() => expect(item('A-006-2').getAttribute('data-reason')).toBe('pending'))
    // Submitted requests table: RequestNo and translated status.
    expect(screen.getByText('RL-2026-0001')).toBeTruthy()
    expect(screen.getByText('Chờ PE duyệt')).toBeTruthy()
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

  it('headers: colour square, bold title, "Toà / floor" subtitle; Before card has an amber top border', async () => {
    mockFetch()
    render(<RelocationTab lang="vi" />)
    await screen.findByLabelText('Chọn máy')
    pasteCodes('A-006-1 A-007-1')
    const before = cardOf(screen.getByTestId('reloc-before-card'))
    expect(within(before).getByText('Bố trí hiện tại (Trước)')).toBeTruthy()
    expect(within(before).getByText('Toà A / 1F')).toBeTruthy()
    expect(getComputedStyle(before).borderTopColor).toBe('rgb(183, 121, 31)')
    expect(within(cardOf(afterCard())).getByText('Bố trí sau di dời (Sau)')).toBeTruthy()
    expect(afterCard().getAttribute('data-move')).toBe('none')
  })

  it('Before card header: one light amber chip per unique source location', async () => {
    mockFetch()
    render(<RelocationTab lang="vi" />)
    await screen.findByLabelText('Chọn máy')
    pasteCodes('A-006-1 A-006-2 A-015-1')
    const chips = [...cardOf(screen.getByTestId('reloc-before-card')).querySelectorAll<HTMLElement>('.reloc-source-chip')]
    expect(chips.map((c) => c.textContent)).toEqual(['Toà A / 1F / A2-3', 'Toà B / 1F / A15-3'])
    expect(getComputedStyle(chips[0]).backgroundColor).toBe('rgba(183, 121, 31, 0.14)')
    // Several layouts: the layout pills are still there.
    expect(document.querySelectorAll('.reloc-layout-pill')).toHaveLength(2)
  })

  it('layout pills when the selection spans several layouts; the active one is solid amber', async () => {
    mockFetch()
    render(<RelocationTab lang="vi" />)
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

describe('RelocationTab - submit', { timeout: 20000 }, () => {
  const today = todayIso()
  const DRAWING_URL = 'https://files.example/drawings/RL-2026-0001.png'
  const apiReq = (drawingUrl: string | null) => ({
    requestNo: 'RL-2026-0001',
    status: 'REQ_PENDING_PE',
    requestedBy: 'E001',
    reason: 'Re-layout',
    plannedMoveDate: today,
    plannedDoneDate: today,
    createdAt: `${today}T09:00:00`,
    drawingUrl,
    to: { positionA: 'A1', positionAA: 'A1-1', positionAAA: null },
    items: [{ machineCode: 'A-006-1', from: { positionA: 'A2', positionAA: 'A2-3', positionAAA: null }, status: 'REQ_PENDING_PE' }],
  })
  const created201 = () =>
    json(
      {
        requestNo: 'RL-2026-0001',
        status: 'REQ_PENDING_PE',
        skipped: ['A-006-2'],
        items: [{ machineCode: 'A-006-1', from: { positionA: 'A2', positionAA: 'A2-3', positionAAA: null }, to: { positionA: 'A1', positionAA: 'A1-1', positionAAA: null }, moveType: 'same' }],
      },
      201,
    )
  const drawingOk = () => json({ fileName: 'RL-2026-0001.png', webUrl: DRAWING_URL })
  /** POST create / POST drawing answers; GET returns what was stored. */
  function mockSubmit(post: () => Promise<Response>, drawing: () => Promise<Response> = drawingOk, initial: unknown[] = [], detail?: unknown) {
    let stored: ReturnType<typeof apiReq>[] = initial as ReturnType<typeof apiReq>[]
    const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
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
      if (/\/api\/relocation-requests\/RL-[^/?]+$/.test(url)) return json(detail ?? stored[0])
      if (url.includes('/api/relocation-requests')) return json({ items: stored, page: 0, size: 100, total: stored.length })
      if (url.includes('/api/assets/with-location')) return json(SAMPLE_ASSETS)
      if (url.includes('/api/locations')) return json(SAMPLE_LOCATIONS)
      return json({ error: 'unexpected' }, 404)
    })
    vi.stubGlobal('fetch', fn)
    return fn
  }
  const drawingPosts = (fn: ReturnType<typeof mockSubmit>) => fn.mock.calls.filter(([u, init]) => String(u).endsWith('/api/relocation-requests/RL-2026-0001/drawing') && init?.method === 'POST')
  const fillAndSubmit = async () => {
    await screen.findByLabelText('Chọn máy')
    pasteCodes('A-006-1 A-006-2')
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Toà nhà' }))
    fireEvent.click(screen.getByRole('option', { name: 'Toà A' }))
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Tầng / Khu' }))
    fireEvent.click(screen.getByRole('option', { name: '1F · Press' }))
    fireEvent.click(screen.getByTestId('reloc-after-card').querySelector('.reloc-zone[data-zone="A1-1"]')!)
    fireEvent.change(screen.getByLabelText(/Mã nhân viên/), { target: { value: 'E001' } })
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
    render(<RelocationTab lang="vi" />)
    await fillAndSubmit()
    await waitFor(() => expect(banner().getAttribute('data-drawing')).toBe('saved'))
    expect(banner().textContent).toContain('Đã tạo RL-2026-0001 (1 máy)')
    expect(banner().textContent).toContain('Đã lưu bản vẽ')
    expect(banner().textContent).toContain('A-006-2')
    expect(screen.getByTestId('reloc-drawing-link').getAttribute('href')).toBe(DRAWING_URL)
    const post = fetchMock.mock.calls.find(([u, init]) => String(u).endsWith('/api/relocation-requests') && init?.method === 'POST')!
    expect(JSON.parse(String(post[1]!.body))).toMatchObject({ plannedMoveDate: today, plannedDoneDate: today, requestedBy: 'E001' })
    // The PNG is built from the snapshot taken before the reset: the machine written by the API, its target.
    expect(exportRelocationPng).toHaveBeenCalledTimes(1)
    const input = vi.mocked(exportRelocationPng).mock.calls[0][0]
    expect(input.request.id).toBe('RL-2026-0001')
    expect(input.rows.map((r) => r.code)).toEqual(['A-006-1'])
    expect(input.target).toEqual({ layoutId: 'floor1', zone: 'A1-1' })
    expect(input.beforeLayout?.id).toBe('floor1')
    const upload = drawingPosts(fetchMock)
    expect(upload).toHaveLength(1)
    const file = (upload[0][1]!.body as FormData).get('file') as File
    expect(file.type).toBe('image/png')
    expect(file.name).toBe('RL-2026-0001.png')
    expect(screen.getByTestId('selected-count').textContent).toBe('0')
    expect((screen.getByLabelText(/Ngày dự kiến/) as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText(/Mã nhân viên/) as HTMLInputElement).value).toBe('')
    const table = screen.getByRole('table', { name: 'Yêu cầu đã gửi' })
    expect(within(table).getAllByText(`${today.slice(8, 10)}/${today.slice(5, 7)}/${today.slice(0, 4)}`)).toHaveLength(2)
    await waitFor(() => expect(within(table).getByTestId('drawing-link-RL-2026-0001').getAttribute('href')).toBe(DRAWING_URL))
    // Initial load, reload after the POST, reload after the upload.
    expect(fetchMock.mock.calls.filter(([u, init]) => String(u).includes('/api/relocation-requests') && init?.method !== 'POST')).toHaveLength(3)
  })

  it('upload failure: the request stays, "chưa lưu được bản vẽ" + retry, which uploads the same PNG again', async () => {
    let fail = true
    const fetchMock = mockSubmit(created201, () => (fail ? json({ error: 'Storage offline' }, 503) : drawingOk()))
    render(<RelocationTab lang="vi" />)
    await fillAndSubmit()
    await waitFor(() => expect(banner().getAttribute('data-drawing')).toBe('failed'))
    expect(banner().textContent).toContain('Đã tạo RL-2026-0001 nhưng chưa lưu được bản vẽ')
    const table = screen.getByRole('table', { name: 'Yêu cầu đã gửi' })
    expect(within(table).getByText('RL-2026-0001')).toBeTruthy()
    expect(within(table).getByRole('button', { name: 'Tải lên lại' })).toBeTruthy()

    fail = false
    fireEvent.click(within(banner()).getByRole('button', { name: 'Thử lại' }))
    await waitFor(() => expect(banner().getAttribute('data-drawing')).toBe('saved'))
    expect(drawingPosts(fetchMock)).toHaveLength(2)
    expect(exportRelocationPng).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(within(table).getByTestId('drawing-link-RL-2026-0001')).toBeTruthy())
  })

  it('"Tải PNG về máy" downloads the PNG of the request', async () => {
    mockSubmit(created201, () => json({ error: 'Storage offline' }, 503))
    render(<RelocationTab lang="vi" />)
    await fillAndSubmit()
    await waitFor(() => expect(banner().getAttribute('data-drawing')).toBe('failed'))
    fireEvent.click(within(banner()).getByRole('button', { name: 'Tải PNG về máy' }))
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1))
    const [blob, name] = vi.mocked(downloadBlob).mock.calls[0]
    expect(blob.type).toBe('image/png')
    expect(name).toBe('RL-2026-0001.png')
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
      items: [{ machineCode: 'A-006-1', from: { positionA: 'A1', positionAA: 'A1-1', positionAAA: null }, to: { positionA: 'A3', positionAA: 'A3-1', positionAAA: null }, status: 'REQ_PENDING_PE' }],
    }
    const fetchMock = mockSubmit(created201, drawingOk, [apiReq(null)], detail)
    render(<RelocationTab lang="vi" />)
    const table = await screen.findByRole('table', { name: 'Yêu cầu đã gửi' })
    fireEvent.click(within(table).getByRole('button', { name: 'Tải lên lại' }))
    await waitFor(() => expect(within(table).getByTestId('drawing-link-RL-2026-0001')).toBeTruthy())
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/api/relocation-requests/RL-2026-0001'))).toBe(true)
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
    const fetchMock = mockSubmit(created201, () => new Promise<Response>((resolve) => { release = () => resolve(new Response(JSON.stringify({ fileName: 'RL-2026-0001.png', webUrl: DRAWING_URL }), { status: 200, headers: { 'Content-Type': 'application/json' } })) }), [apiReq(null)])
    render(<RelocationTab lang="vi" />)
    const table = await screen.findByRole('table', { name: 'Yêu cầu đã gửi' })
    const button = within(table).getByRole('button', { name: 'Tải lên lại' })
    fireEvent.click(button)
    fireEvent.click(button)
    const busy = await within(table).findByRole('button', { name: 'Đang tạo bản vẽ…' })
    expect((busy as HTMLButtonElement).disabled).toBe(true)
    expect(within(table).getByTestId('drawing-spinner-RL-2026-0001')).toBeTruthy()
    await waitFor(() => expect(drawingPosts(fetchMock)).toHaveLength(1))
    act(() => release())
    await waitFor(() => expect(within(table).getByTestId('drawing-link-RL-2026-0001')).toBeTruthy())
    expect(drawingPosts(fetchMock)).toHaveLength(1)
    expect(exportRelocationPng).toHaveBeenCalledTimes(1)
  })

  it('409: the machines in codes are marked red in the selected table; the selection is kept', async () => {
    mockSubmit(() => json({ error: 'conflict', codes: ['A-006-2'] }, 409))
    render(<RelocationTab lang="vi" />)
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
