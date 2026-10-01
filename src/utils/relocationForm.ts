export interface RelocationFormValues {
  requestedBy: string
  plannedMoveDate: string
  plannedDoneDate: string
  reason: string
}

export type RelocationFormErrorCode = 'required' | 'past' | 'beforeStart'
export type RelocationFormErrors = Partial<Record<keyof RelocationFormValues, RelocationFormErrorCode>>

export const EMPTY_FORM: RelocationFormValues = { requestedBy: '', plannedMoveDate: '', plannedDoneDate: '', reason: '' }

/** Local date as YYYY-MM-DD (the <input type="date"> format). */
export function todayIso(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

/** "yyyy-MM-dd" (or "yyyy-MM-ddTHH:mm...") -> dd/MM/yyyy (vi) or yyyy-MM-dd (en); string only, no Date, so no timezone shift. */
export function formatRequestDate(iso: string | null | undefined, vi: boolean): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  if (!m) return iso || '-'
  return vi ? `${m[3]}/${m[2]}/${m[1]}` : `${m[1]}-${m[2]}-${m[3]}`
}

/** ISO dates compare correctly as strings. */
export function validateRelocationForm(v: RelocationFormValues, today: string = todayIso()): RelocationFormErrors {
  const errors: RelocationFormErrors = {}
  if (!v.requestedBy.trim()) errors.requestedBy = 'required'
  if (!v.plannedMoveDate) errors.plannedMoveDate = 'required'
  else if (v.plannedMoveDate < today) errors.plannedMoveDate = 'past'
  if (!v.plannedDoneDate) errors.plannedDoneDate = 'required'
  else if (v.plannedMoveDate && v.plannedDoneDate < v.plannedMoveDate) errors.plannedDoneDate = 'beforeStart'
  if (!v.reason.trim()) errors.reason = 'required'
  return errors
}
