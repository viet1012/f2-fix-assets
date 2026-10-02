import type { LayoutId } from '../data/mapData'

/** building: other drawing building; floor: other DB floor; same: other zone, same building/floor; none: already there. */
export type MoveType = 'building' | 'floor' | 'same' | 'none'

export interface RelocationTarget {
  layoutId: LayoutId
  zone: string
}

export interface RelocationItem {
  code: string
  name: string
  /** Snapshot of the asset's location when the request was created. */
  fromZone: string | null
  fromFloor: string | null
  /** Null for requests read back from the API (not stored there). */
  moveType: MoveType | null
  /** Per-machine status from the API (rows of one request can diverge later). */
  status?: RelocationStatus
  /** Snapshot of the request row (API): major zone left (PositionA_BF) and destination zone (PositionA(A)_AT). */
  fromPositionA?: string | null
  toZone?: string | null
}

/** F2_FIXED_ASSET_HISTORY.Status of relocation rows (always REQ_*). */
/** Flow: REQ_PENDING -> REQ_APPROVED / REQ_REJECTED -> REQ_DONE. */
export type RelocationStatus = 'REQ_PENDING' | 'REQ_APPROVED' | 'REQ_REJECTED' | 'REQ_DONE'


export interface RelocationRequest {
  /** RequestNo (RL-yyyy-nnnn). */
  id: string
  items: RelocationItem[]
  /** layoutId is null when the zone is not drawn on any layout. */
  to: { layoutId: LayoutId | null; zone: string }
  requestedBy: string
  /** Requester's name (API requesterName); null/absent when unknown. */
  requesterName?: string | null
  plannedMoveDate: string
  plannedDoneDate: string
  reason: string
  /** Null when the rows of the request disagree (API). */
  status: RelocationStatus | null
  /** API CreateDate ("yyyy-MM-ddTHH:mm:ss"); absent right after creation. */
  createdAt?: string | null
  /** Stored drawing: its webUrl, or only its file name when the server has no web address; null = none uploaded. */
  drawingUrl?: string | null
}
