import { describe, expect, it } from 'vitest'
import { layoutDbFloor, rowsForLayout } from '../utils/zone'
import { FLOORS, ZONE_INDEX } from './mapData'

describe('FLOORS', () => {
  it('dbFloor matches the floor parsed from the title', () => {
    for (const f of FLOORS) expect(f.dbFloor).toBe(layoutDbFloor(f.title))
  })

  it('layouts carry no building (it comes from the API fac)', () => {
    for (const f of FLOORS) expect('building' in f).toBe(false)
  })
})

describe('ZONE_INDEX', () => {
  it('resolves majors, markers and sub-areas to their layout', () => {
    expect(ZONE_INDEX.get('A1')).toBe('floor1')
    expect(ZONE_INDEX.get('A1-1')).toBe('floor1')
    expect(ZONE_INDEX.get('A17-3')).toBe('floor2')
    expect(ZONE_INDEX.get('A24')).toBe('floor3')
    expect(ZONE_INDEX.get('A31-2')).toBe('floor4')
    expect(ZONE_INDEX.get('A42-3')).toBe('floor5')
    expect(ZONE_INDEX.get('A5-3')).toBeUndefined()
  })

  it('no zone code is drawn on more than one layout', () => {
    const seen = new Map<string, string>()
    for (const f of FLOORS) {
      const codes = new Set([...f.zones, ...f.areas, ...f.subAreas].map((z) => z.code))
      for (const code of codes) {
        expect(seen.get(code), `${code} in ${seen.get(code)} and ${f.id}`).toBeUndefined()
        seen.set(code, f.id)
      }
    }
    expect(ZONE_INDEX.size).toBe(seen.size)
  })
})

describe('rowsForLayout with real layouts (audit 4.2)', () => {
  it('places floor-mismatched and malformed rows by zone', () => {
    const rows = [
      { position: 'A42 A42-3', floor: '1F' },
      { position: 'A2 A2-3', floor: '2F' },
      { position: 'A-15 A-15-3', floor: '1F' },
    ]
    const shown = (id: string) => rowsForLayout(rows, FLOORS.find((f) => f.id === id)!, ZONE_INDEX)
    expect(shown('floor5')).toEqual({ rows: [rows[0]], mismatched: [rows[0]] })
    expect(shown('floor1')).toEqual({ rows: [rows[1]], mismatched: [rows[1]] })
    expect(shown('floor2').rows).toEqual([rows[2]])
  })
})
