// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiRelocationRequestRepository, RelocationApiError, relocationErrorMessage, zoneToPosition } from './relocationRequests'

const input = {
  items: [{ code: 'M1', name: 'Press', fromZone: 'A2-3', fromFloor: '1F', moveType: 'building' as const }],
  to: { layoutId: 'floor1' as const, zone: 'A15-3' },
  requestedBy: 'E001',
  plannedMoveDate: '2026-10-05',
  plannedDoneDate: '2026-10-06',
  reason: 'Layout change',
}

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('API relocation repository', () => {
  it('POSTs the request body and maps the 201 answer', async () => {
    const fetchMock = vi.fn(() =>
      json({ requestNo: 'RL-2026-0001', status: 'REQ_PENDING_PE', skipped: [], items: [{ machineCode: 'M1', from: { positionA: 'A2', positionAA: 'A2-3', positionAAA: null }, to: { positionA: 'A15', positionAA: 'A15-3', positionAAA: null }, moveType: 'building' }] }, 201),
    )
    vi.stubGlobal('fetch', fetchMock)
    const created = await new ApiRelocationRequestRepository('').create(input)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/relocation-requests')
    expect(JSON.parse(String(init.body))).toEqual({
      machineCodes: ['M1'],
      to: { positionA: 'A15', positionAA: 'A15-3' },
      plannedMoveDate: '2026-10-05',
      plannedDoneDate: '2026-10-06',
      reason: 'Layout change',
      requestedBy: 'E001',
    })
    expect(created).toMatchObject({ id: 'RL-2026-0001', status: 'REQ_PENDING_PE', items: [{ code: 'M1', name: 'Press', moveType: 'building' }], skipped: [] })
  })

  it('sends the input date strings untouched (no Date / toISOString shift) and returns skipped', async () => {
    const fetchMock = vi.fn(() => json({ requestNo: 'RL-2026-0002', status: 'REQ_PENDING_PE', skipped: ['M9'], items: [] }, 201))
    vi.stubGlobal('fetch', fetchMock)
    const created = await new ApiRelocationRequestRepository('').create({ ...input, plannedMoveDate: '2026-12-31', plannedDoneDate: '2027-01-01' })
    const body = String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)
    expect(body).toContain('"plannedMoveDate":"2026-12-31"')
    expect(body).toContain('"plannedDoneDate":"2027-01-01"')
    expect(body).not.toMatch(/T\d{2}:/)
    expect(created.skipped).toEqual(['M9'])
  })

  it('lists newest requests oldest first', async () => {
    const req = (no: string) => ({ requestNo: no, status: 'REQ_PENDING_PE', requestedBy: 'E1', reason: 'r', plannedMoveDate: '2026-10-05', plannedDoneDate: '2026-10-06', to: { positionA: 'A1', positionAA: 'A1-1', positionAAA: null }, items: [{ machineCode: 'M1', from: { positionA: 'A2', positionAA: null, positionAAA: null }, status: 'REQ_PENDING_PE' }] })
    vi.stubGlobal('fetch', vi.fn(() => json({ items: [req('RL-2026-0002'), req('RL-2026-0001')], page: 0, size: 100, total: 2 })))
    const list = await new ApiRelocationRequestRepository('').list()
    expect(list.map((r) => r.id)).toEqual(['RL-2026-0001', 'RL-2026-0002'])
    expect(list[0]).toMatchObject({ plannedMoveDate: '2026-10-05', plannedDoneDate: '2026-10-06', to: { layoutId: 'floor1', zone: 'A1-1' }, items: [{ code: 'M1', fromZone: 'A2', status: 'REQ_PENDING_PE' }] })
  })

  it('throws RelocationApiError with the 409 codes', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json({ error: 'Máy đang có yêu cầu di dời chưa xử lý: M1', codes: ['M1'] }, 409)))
    const err = await new ApiRelocationRequestRepository('').create(input).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RelocationApiError)
    expect(err).toMatchObject({ status: 409, codes: ['M1'] })
  })
})

describe('get (detail snapshot)', () => {
  it('GETs /{requestNo} and maps from / to per machine', async () => {
    const detail = { requestNo: 'RL-2026-0001', status: 'REQ_PENDING_PE', requestedBy: 'E1', reason: 'r', plannedMoveDate: '2026-10-05', plannedDoneDate: '2026-10-06', createdAt: '2026-10-01T09:00:00', drawingUrl: null, to: { positionA: 'A15', positionAA: 'A15-3', positionAAA: null }, items: [{ machineCode: 'M1', from: { positionA: 'A2', positionAA: 'A2-3', positionAAA: null }, to: { positionA: 'A15', positionAA: 'A15-3', positionAAA: null }, status: 'REQ_PENDING_PE' }] }
    const fetchMock = vi.fn(() => json(detail))
    vi.stubGlobal('fetch', fetchMock)
    const r = await new ApiRelocationRequestRepository('').get('RL-2026-0001')
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('/api/relocation-requests/RL-2026-0001')
    expect(r.items[0]).toMatchObject({ code: 'M1', fromZone: 'A2-3', fromPositionA: 'A2', toZone: 'A15-3' })
    expect(r).toMatchObject({ requestedBy: 'E1', plannedMoveDate: '2026-10-05', createdAt: '2026-10-01T09:00:00' })
  })
})

describe('uploadDrawing', () => {
  it('POSTs the PNG as multipart "file" to /{requestNo}/drawing and returns the stored file', async () => {
    const fetchMock = vi.fn(() => json({ fileName: 'RL-2026-0001.png', webUrl: 'https://files.example/RL-2026-0001.png' }))
    vi.stubGlobal('fetch', fetchMock)
    const saved = await new ApiRelocationRequestRepository('').uploadDrawing('RL-2026-0001', new Blob(['png'], { type: 'image/png' }))
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/relocation-requests/RL-2026-0001/drawing')
    expect(init.method).toBe('POST')
    const file = (init.body as FormData).get('file') as File
    expect(file.name).toBe('RL-2026-0001.png')
    expect(file.type).toBe('image/png')
    expect(saved).toEqual({ fileName: 'RL-2026-0001.png', webUrl: 'https://files.example/RL-2026-0001.png' })
  })

  it('throws RelocationApiError on failure; list maps drawingUrl and createdAt', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json({ error: 'Storage offline' }, 503)))
    await expect(new ApiRelocationRequestRepository('').uploadDrawing('RL-2026-0001', new Blob(['png']))).rejects.toMatchObject({ status: 503, message: 'Storage offline' })
    const item = { requestNo: 'RL-2026-0001', status: 'REQ_PENDING_PE', requestedBy: 'E1', reason: 'r', plannedMoveDate: '2026-10-05', plannedDoneDate: '2026-10-06', createdAt: '2026-10-01T09:00:00', drawingUrl: 'https://x/a.png', to: { positionA: 'A1', positionAA: null, positionAAA: null }, items: [] }
    vi.stubGlobal('fetch', vi.fn(() => json({ items: [item] })))
    const [r] = await new ApiRelocationRequestRepository('').list()
    expect(r).toMatchObject({ drawingUrl: 'https://x/a.png', createdAt: '2026-10-01T09:00:00' })
  })
})

describe('relocationErrorMessage', () => {
  it('localizes 400 and 409', () => {
    expect(relocationErrorMessage(new RelocationApiError(409, 'x', ['M1', 'M2']), true)).toBe('Máy đang có yêu cầu di dời chưa xử lý: M1, M2')
    expect(relocationErrorMessage(new RelocationApiError(409, 'x', ['M1']), false)).toBe('These machines already have an open relocation request: M1')
    expect(relocationErrorMessage(new RelocationApiError(400, 'reason là bắt buộc.'), true)).toBe('Yêu cầu không hợp lệ: reason là bắt buộc.')
    expect(relocationErrorMessage(new RelocationApiError(400, 'bad'), false)).toBe('Invalid request: bad')
    expect(relocationErrorMessage(new TypeError('Failed to fetch'), false)).toBe('Could not submit the request: Failed to fetch')
  })
})

describe('zoneToPosition', () => {
  it('splits sub-zones and keeps majors', () => {
    expect(zoneToPosition('A15-3')).toEqual({ positionA: 'A15', positionAA: 'A15-3' })
    expect(zoneToPosition('A7')).toEqual({ positionA: 'A7', positionAA: null })
  })
})
