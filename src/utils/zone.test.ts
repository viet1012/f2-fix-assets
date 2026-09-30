import { describe, expect, it } from 'vitest'
import { pxRectToArea, areaBounds } from '../data/mapAreas'
import { assetLayoutId, buildZoneIndex, currentZone, majorZone, matchesZone, matchesZoneNormalized, rowsForLayout } from './zone'

const row = (position: string | null) => ({ position })

describe('currentZone', () => {
  it.each([
    ['A9 A9', 'A9'],
    ['A2 A2-3', 'A2-3'],
    ['A-15 A-15-3', 'A15-3'],
    ['A33', 'A33'],
    ['A34 A23-5', 'A23-5'],
  ])('%s -> %s', (position, expected) => {
    expect(currentZone(row(position))).toBe(expected)
  })

  it('returns null for empty / null position', () => {
    expect(currentZone(row(''))).toBeNull()
    expect(currentZone(row('   '))).toBeNull()
    expect(currentZone(row(null))).toBeNull()
  })
})

describe('majorZone', () => {
  it('strips the sub-zone suffix and normalizes', () => {
    expect(majorZone('A15-3')).toBe('A15')
    expect(majorZone('A7')).toBe('A7')
    expect(majorZone('A-15-3')).toBe('A15')
  })
})

describe('matchesZone (unchanged behaviour)', () => {
  it('matches hierarchically without prefix collisions', () => {
    expect(matchesZone(row('A1 A1-1'), 'A1')).toBe(true)
    expect(matchesZone(row('A1 A1-1'), 'A1-1')).toBe(true)
    expect(matchesZone(row('A10 A10'), 'A1')).toBe(false)
    expect(matchesZone(row('A-15 A-15-3'), 'A15')).toBe(false)
  })
})

describe('buildZoneIndex', () => {
  it('maps every code to its layout, first layout wins', () => {
    const index = buildZoneIndex([
      { id: 'x', zones: [{ code: 'A1' }], areas: [{ code: 'A1' }], subAreas: [{ code: 'A1-1' }] },
      { id: 'y', zones: [{ code: 'A12' }, { code: 'A1' }] },
    ])
    expect(Object.fromEntries(index)).toEqual({ A1: 'x', 'A1-1': 'x', A12: 'y' })
  })
})

describe('pxRectToArea', () => {
  it('converts A1-1 [334,228,227,102] on 1226x718 to image %', () => {
    const b = areaBounds(pxRectToArea('A1-1', [334, 228, 227, 102], 1226, 718))
    expect(b.left).toBeCloseTo(27.24, 2)
    expect(b.top).toBeCloseTo(31.75, 2)
    expect(b.right).toBeCloseTo(45.76, 2)
    expect(b.bottom).toBeCloseTo(45.96, 2)
  })
})

describe('matchesZoneNormalized', () => {
  it('matches malformed tokens after normalizing', () => {
    expect(matchesZoneNormalized(row('A-15 A-15-3'), 'A15')).toBe(true)
    expect(matchesZoneNormalized(row('A-15 A-15-3'), 'A15-3')).toBe(true)
    expect(matchesZoneNormalized(row('A10 A10'), 'A1')).toBe(false)
  })
})

describe('assetLayoutId / rowsForLayout', () => {
  const index = new Map<string, string>([
    ['A2', 'L1'], ['A2-3', 'L1'], ['A5', 'L1'], ['A15', 'L2'], ['A15-3', 'L2'], ['A42', 'L3'], ['A42-3', 'L3'],
  ])
  const L1 = { id: 'L1', dbFloor: '1F' }
  const L3 = { id: 'L3', dbFloor: '2F' }
  const r = (position: string | null, floor: string | null) => ({ position, floor })

  it('resolves by current zone, then major area', () => {
    expect(assetLayoutId(r('A2 A2-3', '2F'), index)).toBe('L1')
    expect(assetLayoutId(r('A5 A5-3', '1F'), index)).toBe('L1')
    expect(assetLayoutId(r('A-15 A-15-3', '1F'), index)).toBe('L2')
    expect(assetLayoutId(r('Z9', '1F'), index)).toBeNull()
    expect(assetLayoutId(r(null, '1F'), index)).toBeNull()
  })

  it('keeps floor-mismatched rows on the layout of their zone and flags them', () => {
    const wrong2F = r('A2 A2-3', '2F')
    const wrong1F = r('A42 A42-3', '1F')
    const ok = r('A5 A5-3', '1F')
    const noFloor = r('A2 A2', null)
    const unknown1F = r('Z9', '1F')
    const unknown2F = r('', '2F')
    const rows = [wrong2F, wrong1F, ok, noFloor, unknown1F, unknown2F]

    const l1 = rowsForLayout(rows, L1, index)
    expect(l1.rows).toEqual([wrong2F, ok, noFloor, unknown1F])
    expect(l1.mismatched).toEqual([wrong2F])

    const l3 = rowsForLayout(rows, L3, index)
    expect(l3.rows).toEqual([wrong1F, unknown2F])
    expect(l3.mismatched).toEqual([wrong1F])
  })

  it('falls back to all unresolved rows when the layout has no dbFloor', () => {
    const rows = [r('Z9', '1F'), r('A2', '1F')]
    expect(rowsForLayout(rows, { id: 'X', dbFloor: null }, index)).toEqual({ rows: [rows[0]], mismatched: [] })
  })
})
