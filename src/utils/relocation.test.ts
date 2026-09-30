import { describe, expect, it } from 'vitest'
import { FLOORS } from '../data/mapData'
import { buildIndexes, buildTray, DEFAULT_CONTEXT, eligibleForRelocation, groupByLayoutZone, moveTypeOf, movers } from './relocation'

type Level = 'SUB' | 'MAJOR' | 'NONE'
/** API row fixture: positionA = major part of the zone. */
const r = (zone: string | null, floor: string | null = '1F', code = zone ?? '', matchLevel: Level = 'SUB') => ({
  code,
  currentZone: zone,
  positionA: zone ? zone.split('-')[0] : null,
  floor,
  matchLevel,
})
const layout = (id: string) => FLOORS.find((f) => f.id === id)!
const wh = layout('floor3').zones[0].code
const mold = layout('floor4').zones[0].code
/** Buildings come from the API fac of each zone (LocationCatalog.fac). */
const ctx = { ...DEFAULT_CONTEXT, zoneFac: new Map([['A2-3', 'Fac_A'], ['A3-1', 'Fac_A'], ['A42-3', 'Fac_A'], ['A17-3', 'Fac_B'], [mold, 'Fac_C'], [wh, 'WH_RM']]) }

describe('moveTypeOf', () => {
  it('covers all 4 move types', () => {
    expect(moveTypeOf(r('A2-3'), { layoutId: 'floor1', zone: 'A2-3' })).toBe('none')
    expect(moveTypeOf(r('A2-3'), { layoutId: 'floor1', zone: 'A3-1' })).toBe('same')
    expect(moveTypeOf(r('A2-3'), { layoutId: 'floor5', zone: 'A42-3' })).toBe('floor')
    expect(moveTypeOf(r('A2-3'), { layoutId: 'floor2', zone: 'A17-3' }, ctx)).toBe('building')
  })

  it('compares by current zone: a parent-only asset (A9 A9) moving to a sub-zone is a move', () => {
    expect(moveTypeOf(r('A9'), { layoutId: 'floor1', zone: 'A9' })).toBe('none')
    expect(moveTypeOf(r('A2'), { layoutId: 'floor1', zone: 'A2-3' })).toBe('same')
  })

  it('building comes from the API fac: no building change when a fac is unknown', () => {
    expect(moveTypeOf(r('A2-3'), { layoutId: 'floor2', zone: 'A17-3' })).toBe('same')
    expect(moveTypeOf(r('A2-3'), { layoutId: 'floor2', zone: 'A17-9' }, ctx)).toBe('same')
  })

  it('Mold (Fac_C) and the warehouse (WH_RM) are buildings of their own', () => {
    expect(moveTypeOf(r(mold), { layoutId: 'floor2', zone: 'A17-3' }, ctx)).toBe('building')
    expect(moveTypeOf(r('A2-3'), { layoutId: 'floor4', zone: mold }, ctx)).toBe('building')
    expect(moveTypeOf(r('A2-3'), { layoutId: 'floor3', zone: wh }, ctx)).toBe('building')
  })

  it('the matched MAP fac of the asset wins over the zone fac', () => {
    expect(moveTypeOf({ ...r('A2-3'), mapFac: 'Fac_B' }, { layoutId: 'floor2', zone: 'A17-3' }, ctx)).toBe('same')
  })

  it('uses the zone layout floor over a mismatched `floor`, and falls back to `floor` when the zone is unknown', () => {
    expect(moveTypeOf(r('A42-3', '1F'), { layoutId: 'floor5', zone: 'A42-1' })).toBe('same')
    expect(moveTypeOf(r('Z9', '2F'), { layoutId: 'floor1', zone: 'A2' })).toBe('floor')
  })
})

describe('movers / groupByLayoutZone', () => {
  const rows = [r('A2-3', '1F', 'M1'), r('A2-1', '1F', 'M2'), r('A2-3', '1F', 'M3'), r(null, '1F', 'M4')]

  it('movers drops rows already at the target', () => {
    expect(movers(rows, { layoutId: 'floor1', zone: 'A2-3' }).map((x) => x.code)).toEqual(['M2', 'M4'])
  })

  it('groups by layout then current zone', () => {
    const g = groupByLayoutZone(rows)
    expect(g.get('floor1')?.get('A2-3')?.map((x) => x.code)).toEqual(['M1', 'M3'])
    expect(g.get('floor1')?.get('A2-1')?.map((x) => x.code)).toEqual(['M2'])
    expect(g.get(null)?.get('')?.map((x) => x.code)).toEqual(['M4'])
  })
})

describe('buildTray', () => {
  it('lists zones in data that are not on the drawing, only for their own layout', () => {
    const rows = [r('A5-3'), r('A5-3'), r('A2-3'), r('A30-4', '2F'), r('Z9')]
    expect(buildTray(layout('floor1'), rows)).toEqual([{ code: 'A5-3', count: 2 }])
    expect(buildTray(layout('floor4'), rows).map((t) => t.code)).toEqual(['A30-4'])
    expect(buildTray(layout('floor2'), rows)).toEqual([])
  })

  it('puts assets with matchLevel NONE in the tray even when their zone is drawn', () => {
    const rows = [r('A2-3', '1F', 'M1', 'NONE'), r('A2-3', '1F', 'M2'), r('A1-1', '1F', 'M3', 'NONE')]
    expect(buildTray(layout('floor1'), rows)).toEqual([{ code: 'A1-1', count: 1 }, { code: 'A2-3', count: 1 }])
  })
})

describe('eligibleForRelocation', () => {
  it('matches the allowed kinds case-insensitively and rejects empty kind', () => {
    const allowed = ['Machine']
    expect(eligibleForRelocation({ kind: ' machine ' }, allowed)).toBe(true)
    expect(eligibleForRelocation({ kind: 'Tool' }, allowed)).toBe(false)
    expect(eligibleForRelocation({ kind: null }, allowed)).toBe(false)
  })
})

describe('buildIndexes', () => {
  it('indexes by code and counts current zone + major once each', () => {
    const { byCode, zoneCount } = buildIndexes([r('A9', '1F', 'M1'), r('A2-3', '1F', 'M2'), r('A15-3', '1F', 'M3'), r(null, '1F', 'M4')])
    expect(byCode.get('M2')?.currentZone).toBe('A2-3')
    expect(byCode.size).toBe(4)
    expect(Object.fromEntries(zoneCount)).toEqual({ A9: 1, A2: 1, 'A2-3': 1, A15: 1, 'A15-3': 1 })
  })
})
