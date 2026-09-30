import { describe, expect, it } from 'vitest'
import { todayIso, validateRelocationForm } from './relocationForm'

const today = '2026-09-30'
const v = (dStart: string, dEnd: string, requestedBy = 'E001', reason = 'Layout change') => ({ requestedBy, dStart, dEnd, reason })

describe('validateRelocationForm', () => {
  it('accepts today and dEnd equal to dStart', () => {
    expect(validateRelocationForm(v(today, today), today)).toEqual({})
  })

  it('rejects a past start date and an end before the start', () => {
    expect(validateRelocationForm(v('2026-09-29', '2026-10-01'), today)).toEqual({ dStart: 'past' })
    expect(validateRelocationForm(v('2026-10-05', '2026-10-04'), today)).toEqual({ dEnd: 'beforeStart' })
  })

  it('requires employee ID, both dates and a reason', () => {
    expect(validateRelocationForm(v('', '', '  ', ' '), today)).toEqual({ requestedBy: 'required', dStart: 'required', dEnd: 'required', reason: 'required' })
  })

  it('todayIso uses the local date', () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})
