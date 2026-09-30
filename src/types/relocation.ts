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
  moveType: MoveType
}

export interface RelocationRequest {
  id: string
  items: RelocationItem[]
  to: RelocationTarget
  requestedBy: string
  dStart: string
  dEnd: string
  reason: string
  status: 'PENDING'
}
