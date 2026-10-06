import { ZONE_INDEX } from '../data/mapData'
import type { RelocationItem, RelocationRequest, RelocationStatus, RelocationTarget } from '../types/relocation'
import { isMajorZone } from '../utils/relocationInput'
import { majorZone } from '../utils/zone'
import { API_BASE_URL, apiFetch, notifyUnauthorized } from './fixedAssetApi'

/** requestedBy is never sent: the server takes the logged-in account (session); it only fills the local copy. */
export type NewRelocationRequest = Omit<RelocationRequest, 'id' | 'status' | 'to' | 'createdAt' | 'drawingUrl' | 'requestedBy'> & {
  to: RelocationTarget
  requestedBy?: string
}
/**
 * The server also writes the request's Excel file when it creates a request / stores its drawing; `excelError` is set
 * when that failed (the request and drawing are kept; POST /{requestNo}/excel builds it again).
 */
export interface ExcelOutcome {
  excelError?: string | null
}
/** webUrl is null when the server has no web address for its drawings. */
export interface UploadedDrawing extends ExcelOutcome {
  fileName: string
  webUrl: string | null
}
/** skipped: machines already at the destination (no row written by the API). */
export type CreatedRelocationRequest = RelocationRequest & ExcelOutcome & { skipped: readonly string[] }
/** Excel file stored by POST /{requestNo}/excel. */
export interface SavedExcel {
  fileName: string | null
  webUrl: string | null
}

/** Storage-agnostic contract: the UI only talks to this. */
export interface RelocationRequestRepository {
  list(): Promise<RelocationRequest[]>
  create(input: NewRelocationRequest): Promise<CreatedRelocationRequest>
  /** GET detail: the stored snapshot (from = *_BF, to = *_AT per machine, dates, creator). */
  get?(requestNo: string): Promise<RelocationRequest>
  /** Stores (or replaces) the PNG drawing of a request. */
  uploadDrawing?(requestNo: string, png: Blob): Promise<UploadedDrawing>
  /** Builds (or rebuilds) the Excel file of a request. */
  regenerateExcel?(requestNo: string): Promise<SavedExcel>
  /** False when requests are only kept in memory (lost on reload). Omit for server-backed implementations. */
  isPersistent?(): boolean
}

interface ApiPosition {
  positionA: string | null
  positionAA: string | null
  positionAAA: string | null
}

interface ApiCreateResponse {
  requestNo: string
  status: RelocationStatus
  items: { machineCode: string; from: ApiPosition; to: ApiPosition; moveType: string }[]
  skipped: string[]
  excelError?: string | null
}

interface ApiRequest {
  requestNo: string
  status: RelocationStatus | null
  requestedBy: string | null
  requesterName?: string | null
  reason: string | null
  plannedMoveDate: string | null
  plannedDoneDate: string | null
  createdAt?: string | null
  drawingUrl?: string | null
  to: ApiPosition
  /** to: per-machine *_AT snapshot (GET detail; may be absent on older servers). */
  items: { machineCode: string; from: ApiPosition; to?: ApiPosition | null; status: RelocationStatus }[]
}

/** Non-2xx answer of the relocation API; codes are the conflicting machines of a 409. */
export class RelocationApiError extends Error {
  constructor(readonly status: number, message: string, readonly codes: readonly string[] = []) {
    super(message)
    this.name = 'RelocationApiError'
  }
}

async function readApi<T>(response: Response): Promise<T> {
  if (response.status === 401) notifyUnauthorized()
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = typeof data?.error === 'string' ? data.error : `HTTP ${response.status}`
    const codes = Array.isArray(data?.codes) ? data.codes.filter((c: unknown): c is string => typeof c === 'string') : []
    throw new RelocationApiError(response.status, message, codes)
  }
  return data as T
}

/** Localized message for a failed submit (400/409 explained; the server detail is kept as-is). */
export function relocationErrorMessage(e: unknown, vi: boolean): string {
  const detail = e instanceof Error ? e.message : String(e)
  if (e instanceof RelocationApiError && e.status === 409) {
    if (!e.codes.length) return vi ? 'Có máy đang có yêu cầu di dời chưa xử lý.' : 'Some machines already have an open relocation request.'
    return vi
      ? `Máy đang có yêu cầu di dời chưa xử lý: ${e.codes.join(', ')}`
      : `These machines already have an open relocation request: ${e.codes.join(', ')}`
  }
  if (e instanceof RelocationApiError && e.status === 400) return vi ? `Yêu cầu không hợp lệ: ${detail}` : `Invalid request: ${detail}`
  return vi ? `Không gửi được yêu cầu: ${detail}` : `Could not submit the request: ${detail}`
}

/** Zone code -> API position: "A15-3" -> A15 / A15-3, "A7" -> A7 / null. */
export function zoneToPosition(zone: string): { positionA: string; positionAA: string | null } {
  return { positionA: majorZone(zone), positionAA: isMajorZone(zone) ? null : zone }
}

const zoneOf = (p: Pick<ApiPosition, 'positionA' | 'positionAA'>) => p.positionAA ?? p.positionA

function fromApi(r: ApiRequest): RelocationRequest {
  const zone = zoneOf(r.to) ?? ''
  return {
    id: r.requestNo,
    items: r.items.map((i) => ({
      code: i.machineCode,
      name: '',
      fromZone: zoneOf(i.from),
      fromFloor: null,
      moveType: null,
      status: i.status,
      fromPositionA: i.from.positionA,
      toZone: i.to ? zoneOf(i.to) : zone || null,
    })),
    to: { layoutId: ZONE_INDEX.get(zone) ?? null, zone },
    requestedBy: r.requestedBy ?? '',
    requesterName: r.requesterName ?? null,
    plannedMoveDate: r.plannedMoveDate ?? '',
    plannedDoneDate: r.plannedDoneDate ?? '',
    reason: r.reason ?? '',
    status: r.status,
    createdAt: r.createdAt ?? null,
    drawingUrl: r.drawingUrl ?? null,
  }
}

/** Backed by /api/relocation-requests (F2_FIXED_ASSET_HISTORY). list() returns the newest `pageSize` requests, oldest first. */
export class ApiRelocationRequestRepository implements RelocationRequestRepository {
  constructor(private readonly baseUrl = API_BASE_URL, private readonly pageSize = 100) {}

  async list(): Promise<RelocationRequest[]> {
    const response = await apiFetch(`${this.baseUrl}/api/relocation-requests?size=${this.pageSize}`)
    const page = await readApi<{ items: ApiRequest[] }>(response)
    return page.items.map(fromApi).reverse()
  }

  async get(requestNo: string): Promise<RelocationRequest> {
    const response = await apiFetch(`${this.baseUrl}/api/relocation-requests/${encodeURIComponent(requestNo)}`)
    return fromApi(await readApi<ApiRequest>(response))
  }

  async create(input: NewRelocationRequest): Promise<CreatedRelocationRequest> {
    const response = await apiFetch(`${this.baseUrl}/api/relocation-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        machineCodes: input.items.map((i) => i.code),
        to: zoneToPosition(input.to.zone),
        plannedMoveDate: input.plannedMoveDate,
        plannedDoneDate: input.plannedDoneDate,
        reason: input.reason,
      }),
    })
    const created = await readApi<ApiCreateResponse>(response)
    const sent = new Map(input.items.map((i) => [i.code, i]))
    const items: RelocationItem[] = created.items.map((i) => {
      const s = sent.get(i.machineCode)
      return {
        code: i.machineCode,
        name: s?.name ?? '',
        fromZone: zoneOf(i.from) ?? s?.fromZone ?? null,
        fromFloor: s?.fromFloor ?? null,
        moveType: s?.moveType ?? null,
        status: created.status,
      }
    })
    return { ...input, requestedBy: input.requestedBy ?? '', id: created.requestNo, items, status: created.status, skipped: created.skipped ?? [], excelError: created.excelError ?? null }
  }

  /** POST /api/relocation-requests/{requestNo}/drawing (multipart "file", PNG). */
  async uploadDrawing(requestNo: string, png: Blob): Promise<UploadedDrawing> {
    const body = new FormData()
    body.append('file', png, `${requestNo}.png`)
    const response = await apiFetch(`${this.baseUrl}/api/relocation-requests/${encodeURIComponent(requestNo)}/drawing`, { method: 'POST', body })
    const saved = await readApi<{ fileName?: string; webUrl?: string | null; excelError?: string | null }>(response)
    return { fileName: saved.fileName ?? `${requestNo}.png`, webUrl: saved.webUrl ?? null, excelError: saved.excelError ?? null }
  }

  /** POST /api/relocation-requests/{requestNo}/excel; a 2xx answer that still carries excelError is a failure. */
  async regenerateExcel(requestNo: string): Promise<SavedExcel> {
    const response = await apiFetch(`${this.baseUrl}/api/relocation-requests/${encodeURIComponent(requestNo)}/excel`, { method: 'POST' })
    const saved = await readApi<{ fileName?: string | null; webUrl?: string | null; excelError?: string | null }>(response)
    if (saved.excelError) throw new RelocationApiError(response.status, saved.excelError)
    return { fileName: saved.fileName ?? null, webUrl: saved.webUrl ?? null }
  }
}

export const apiRelocationRepository = new ApiRelocationRequestRepository()
