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

/** Zones of this fac are never destinations, and assets there cannot be picked. */
export const OUTSIDE_FAC = 'Outside'

export function facLabel(fac: string, vi: boolean): string {
  const label = FAC_LABELS[fac]
  return label ? (vi ? label.vi : label.en) : fac
}
