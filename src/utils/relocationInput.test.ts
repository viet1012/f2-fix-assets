import { describe, expect, it } from 'vitest'
import { FLOORS } from '../data/mapData'
import { buildRequestItems, checkCodes, isPickableZone, moveBadgeOf, parseCodes, pendingCodesOf, zoneOptions } from './relocationInput'
import { DEFAULT_CONTEXT } from './relocation'

describe('parseCodes', () => {
  it('splits on spaces, commas, semicolons and newlines', () => {
    expect(parseCodes(' A-001-1, A-002-1;A-003-1\n\tA-004-1 ,, ; ')).toEqual(['A-001-1', 'A-002-1', 'A-003-1', 'A-004-1'])
    expect(parseCodes('   ')).toEqual([])
  })
})

describe('checkCodes', () => {
  const byCode = new Map([
    ['M1', { kind: 'Machinery' }],
    ['M2', { kind: 'machinery ' }],
    ['M3', { kind: 'Tools' }],
    ['S1', { kind: 'Software' }],
    ['P1', { kind: 'Machinery' }],
  ])
  const opts = { byCode, selected: ['M3'], allowedKinds: ['Machinery', 'Tools'], pendingCodes: new Set(['P1']) }

  it('reports not found, duplicate, wrong kind and pending separately', () => {
    expect(checkCodes(['M1', 'X9', 'M1', 'M3', 'S1', 'P1', 'M2'], opts)).toEqual({
      accepted: ['M1', 'M2'],
      notFound: ['X9'],
      duplicate: ['M1', 'M3'],
      wrongKind: ['S1'],
      outside: [],
      pending: ['P1'],
    })
  })

  it('rejects machines at an Outside location separately', () => {
    expect(checkCodes(['M1', 'M2'], { ...opts, isOutside: (row) => row === byCode.get('M2') })).toMatchObject({ accepted: ['M1'], outside: ['M2'] })
  })

  it('blocks machines that are in a PENDING request', () => {
    const pending = pendingCodesOf([
      { status: 'PENDING', items: [{ code: 'M1', name: '', fromZone: null, fromFloor: null, moveType: 'same' }] },
    ])
    expect(checkCodes(['M1', 'M2'], { ...opts, pendingCodes: pending })).toMatchObject({ accepted: ['M2'], pending: ['M1'] })
  })
})

describe('buildRequestItems', () => {
  it('drops rows already at the target ("none")', () => {
    const rows = [
      { code: 'A', name: 'a', currentZone: 'A3-1', positionA: 'A3', floor: '1F', matchLevel: 'SUB' as const },
      { code: 'B', name: 'b', currentZone: 'A2-3', positionA: 'A2', floor: '1F', matchLevel: 'SUB' as const },
    ]
    const items = buildRequestItems(rows, { layoutId: 'floor1', zone: 'A3-1' })
    expect(items).toEqual([{ code: 'B', name: 'b', fromZone: 'A2-3', fromFloor: '1F', moveType: 'same' }])
  })
})

describe('moveBadgeOf', () => {
  const a23 = { currentZone: 'A2-3', positionA: 'A2', floor: '1F', matchLevel: 'SUB' as const }
  it('flags an unknown building when either side has no fac', () => {
    const wh = FLOORS.find((f) => f.id === 'floor3')!.zones[0].code
    const ctx = { ...DEFAULT_CONTEXT, zoneFac: new Map([['A2-3', 'Fac_A'], ['A17-3', 'Fac_B']]) }
    expect(moveBadgeOf(a23, { layoutId: 'floor3', zone: wh }, ctx)).toBe('unknownBuilding')
    expect(moveBadgeOf(a23, { layoutId: 'floor2', zone: 'A17-3' })).toBe('unknownBuilding')
    expect(moveBadgeOf(a23, { layoutId: 'floor2', zone: 'A17-3' }, ctx)).toBe('building')
    expect(moveBadgeOf(a23, { layoutId: 'floor1', zone: 'A2-3' }, ctx)).toBe('none')
  })
})

describe('zoneOptions', () => {
  it('disables major areas that have sub-zones', () => {
    const layout = { zones: [{ code: 'A2' }, { code: 'A2-1' }, { code: 'A9' }] }
    expect(zoneOptions(layout)).toEqual([
      { code: 'A2', group: 'A2', disabled: true },
      { code: 'A2-1', group: 'A2', disabled: false },
      { code: 'A9', group: 'A9', disabled: false },
    ])
    expect(isPickableZone(layout, 'A2')).toBe(false)
    expect(isPickableZone(layout, 'A9')).toBe(true)
    expect(isPickableZone(layout, 'Z1')).toBe(false)
  })
})
