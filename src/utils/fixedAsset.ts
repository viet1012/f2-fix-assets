import type { DashboardFilters, FixedAsset } from '../types/fixedAsset'

export const emptyFilters: DashboardFilters = {
  text: '', factory: '', div: '', kind: '', group: '', checked: '', approved: '', floor: '', status: '',
}

// Created once: toLocaleString(locale, options) builds a new formatter on every call.
const moneyFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export function formatMoney(value: number): string {
  return `$${moneyFormatter.format(Number(value || 0))}`
}

export function filterAssets(rows: FixedAsset[], filters: DashboardFilters): FixedAsset[] {
  const text = filters.text.trim().toLowerCase()
  return rows.filter((r) => {
    if (text && ![r.code, r.name, r.maker, r.position].some((x) => (x ?? '').toLowerCase().includes(text))) return false
    if (filters.factory && r.factory !== filters.factory) return false
    if (filters.div && r.div !== filters.div) return false
    if (filters.kind && r.kind !== filters.kind) return false
    if (filters.group && r.group !== filters.group) return false
    if (filters.checked && r.pic !== filters.checked) return false
    if (filters.approved && r.pic_approved !== filters.approved) return false
    if (filters.floor && r.floor !== filters.floor) return false
    if (filters.status && r.status !== filters.status) return false
    return true
  })
}

export function uniq(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v && v !== 'N/A'))).sort((a, b) => a.localeCompare(b))
}

export function countBy(rows: FixedAsset[], field: keyof FixedAsset): Record<string, number> {
  const out: Record<string, number> = {}
  for (const row of rows) {
    const key = String(row[field] ?? 'N/A')
    out[key] = (out[key] ?? 0) + 1
  }
  return out
}

export function sumBy(rows: FixedAsset[], field: keyof FixedAsset): Record<string, number> {
  const out: Record<string, number> = {}
  for (const row of rows) {
    const key = String(row[field] ?? 'N/A')
    out[key] = (out[key] ?? 0) + Number(row.cost || 0)
  }
  return out
}

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const normalized = value.replace(' ', 'T')
  const d = new Date(normalized)
  return Number.isNaN(d.getTime()) ? null : d
}

export function issueKinds(row: FixedAsset): Array<'not_yet' | 'no_photo'> {
  const issues: Array<'not_yet' | 'no_photo'> = []
  if ((row.photoEval ?? '').trim().toLowerCase() === 'not yet') issues.push('not_yet')
  if (!row.hasPhoto) issues.push('no_photo')
  return issues
}
