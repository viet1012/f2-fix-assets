import type { RelocationStatus } from '../types/relocation'

// docs/decisions.md. The kind values must match F2_FIXED_ASSET.kind exactly (compared case/whitespace-insensitively).
export const ALLOWED_KINDS: readonly string[] = ['Machinery', 'Tools', 'Furniture and Fixtures']

/** Relocation scope: Factory 2, every div. */
export const RELOCATION_FACTORY = 'Factory 2'

/** Building label per F2_FIXED_ASSET_MAP.fac (docs/decisions.md). Unknown values are shown as-is. */
export const FAC_LABELS: Readonly<Record<string, { vi: string; en: string }>> = {
  Fac_A: { vi: 'Toà A', en: 'Building A' },
  Fac_B: { vi: 'Toà B', en: 'Building B' },
  Fac_C: { vi: 'Toà C', en: 'Building C' },
  WH_RM: { vi: 'Kho', en: 'Warehouse' },
}

/** Statuses that block another request for the same machine (BE OPEN_STATUSES / UX_F2FAH_OpenRequest). */
export const OPEN_RELOCATION_STATUSES: readonly RelocationStatus[] = ['REQ_PENDING_PE', 'REQ_PENDING_BOD', 'REQ_APPROVED']

export const RELOCATION_STATUS_LABELS: Readonly<Record<RelocationStatus, { vi: string; en: string }>> = {
  REQ_PENDING_PE: { vi: 'Chờ PE duyệt', en: 'Pending PE approval' },
  REQ_PENDING_BOD: { vi: 'Chờ BoD duyệt', en: 'Pending BoD approval' },
  REQ_APPROVED: { vi: 'Đã duyệt', en: 'Approved' },
  REQ_REJECTED: { vi: 'Từ chối', en: 'Rejected' },
  REQ_DONE: { vi: 'Hoàn tất', en: 'Done' },
}

/** Zones of this fac are never destinations, and assets there cannot be picked. */
export const OUTSIDE_FAC = 'Outside'

export function facLabel(fac: string, vi: boolean): string {
  const label = FAC_LABELS[fac]
  return label ? (vi ? label.vi : label.en) : fac
}
