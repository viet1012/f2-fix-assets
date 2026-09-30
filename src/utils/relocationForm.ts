export interface RelocationFormValues {
  requestedBy: string
  dStart: string
  dEnd: string
  reason: string
}

export type RelocationFormErrorCode = 'required' | 'past' | 'beforeStart'
export type RelocationFormErrors = Partial<Record<keyof RelocationFormValues, RelocationFormErrorCode>>

export const EMPTY_FORM: RelocationFormValues = { requestedBy: '', dStart: '', dEnd: '', reason: '' }

/** Local date as YYYY-MM-DD (the <input type="date"> format). */
export function todayIso(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

/** ISO dates compare correctly as strings. */
export function validateRelocationForm(v: RelocationFormValues, today: string = todayIso()): RelocationFormErrors {
  const errors: RelocationFormErrors = {}
  if (!v.requestedBy.trim()) errors.requestedBy = 'required'
  if (!v.dStart) errors.dStart = 'required'
  else if (v.dStart < today) errors.dStart = 'past'
  if (!v.dEnd) errors.dEnd = 'required'
  else if (v.dStart && v.dEnd < v.dStart) errors.dEnd = 'beforeStart'
  if (!v.reason.trim()) errors.reason = 'required'
  return errors
}
