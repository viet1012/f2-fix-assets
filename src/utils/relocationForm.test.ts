import { describe, expect, it } from 'vitest'
import { todayIso, validateRelocationForm } from './relocationForm'

const today = '2026-09-30'
const v = (plannedMoveDate: string, plannedDoneDate: string, reason = 'Layout change') => ({ plannedMoveDate, plannedDoneDate, reason })

describe('validateRelocationForm', () => {
  it('accepts today and plannedDoneDate equal to plannedMoveDate', () => {
    expect(validateRelocationForm(v(today, today), today)).toEqual({})
  })

  it('rejects a past start date and an end before the start', () => {
    expect(validateRelocationForm(v('2026-09-29', '2026-10-01'), today)).toEqual({ plannedMoveDate: 'past' })
    expect(validateRelocationForm(v('2026-10-05', '2026-10-04'), today)).toEqual({ plannedDoneDate: 'beforeStart' })
  })

  it('requires both dates and a reason (the requester is the session account)', () => {
    expect(validateRelocationForm(v('', '', ' '), today)).toEqual({ plannedMoveDate: 'required', plannedDoneDate: 'required', reason: 'required' })
  })

  it('todayIso uses the local date', () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})
