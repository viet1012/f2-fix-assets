import { describe, expect, it } from 'vitest'
import { FLOORS, ZONE_INDEX } from '../data/mapData'
import { SAMPLE_ASSETS, SAMPLE_LOCATIONS } from '../test/locationSample'
import {
  buildLocationCatalog,
  catalogFacs,
  catalogLayouts,
  catalogOptions,
  catalogTray,
  isCatalogTarget,
  isOutsideAsset,
  unplacedZones,
} from './locationCatalog'

const catalog = buildLocationCatalog(SAMPLE_LOCATIONS, ZONE_INDEX)

describe('buildLocationCatalog', () => {
  it('merges rows by (fac, A, AA) and sums assetCount; Outside is not a destination', () => {
    expect(Object.fromEntries(catalog.count)).toEqual({ 'A1-1': 26, 'A5-1': 0, 'A15-3': 26, A23: 115, A33: 15, 'A40-1': 0 })
    expect(catalog.zones.has('OUTSIDE')).toBe(false)
    expect(catalog.outside.has('OUTSIDE')).toBe(true)
  })

  it('takes the building from fac and the layout from the zone index, not from the row floor', () => {
    expect(Object.fromEntries(catalog.fac)).toEqual({ 'A1-1': 'Fac_A', 'A5-1': 'Fac_A', 'A15-3': 'Fac_B', A23: 'WH_RM', A33: 'Fac_C', 'A40-1': 'Fac_A' })
    // MAP row floors disagree with the drawings: A5-1 says 2F but is drawn on 1F, A40-1 says 1F but is drawn on 2F.
    expect(catalog.zones.get('A5-1')).toMatchObject({ layoutId: 'floor1', facs: ['Fac_A'] })
    expect(catalog.zones.get('A40-1')).toMatchObject({ layoutId: 'floor5', facs: ['Fac_A'] })
  })

  it('keeps a code under several facs as one zone without a single building', () => {
    const c = buildLocationCatalog([...SAMPLE_LOCATIONS, { ...SAMPLE_LOCATIONS[0], id: 9, fac: 'Fac_B', assetCount: 1 }], ZONE_INDEX)
    expect(c.zones.get('A1-1')).toMatchObject({ facs: ['Fac_A', 'Fac_B'], fac: null, count: 27 })
    expect(c.fac.has('A1-1')).toBe(false)
  })

  it('a major with sub-zones in the API is not a target; one without is', () => {
    const c = buildLocationCatalog([...SAMPLE_LOCATIONS, { ...SAMPLE_LOCATIONS[0], id: 9, positionAA: null }], ZONE_INDEX)
    expect(isCatalogTarget(c, 'floor1', 'A1')).toBe(false)
    expect(isCatalogTarget(catalog, 'floor4', 'A33')).toBe(true)
  })
})

describe('joining API zones with drawn coordinates', () => {
  it('lists buildings and their layouts from the API only', () => {
    expect(catalogFacs(catalog)).toEqual(['Fac_A', 'Fac_B', 'Fac_C', 'WH_RM'])
    expect(catalogLayouts(catalog, FLOORS, 'WH_RM').map((l) => l.id)).toEqual(['floor3'])
    expect(catalogLayouts(catalog, FLOORS, 'Fac_A').map((l) => l.id)).toEqual(['floor1', 'floor5'])
    expect(catalogOptions(catalog, 'floor2', 'Fac_B').map((o) => o.code)).toEqual(['A15-3'])
    expect(catalogOptions(catalog, 'floor2', 'Fac_A')).toEqual([])
  })

  it('drawn zone missing from the API is not a target; nothing is unplaced or in the tray here', () => {
    expect(ZONE_INDEX.get('A3-1')).toBe('floor1')
    expect(isCatalogTarget(catalog, 'floor1', 'A3-1')).toBe(false)
    expect(isCatalogTarget(catalog, 'floor1', 'A1-1')).toBe(true)
    expect(unplacedZones(catalog)).toEqual([])
    expect(catalogTray(catalog, 'floor1')).toEqual([])
  })
})

describe('isOutsideAsset', () => {
  it('uses the matched MAP fac, else the Outside zone list', () => {
    const [inside, , , outside] = SAMPLE_ASSETS
    expect(isOutsideAsset(inside, catalog)).toBe(false)
    expect(isOutsideAsset(outside, catalog)).toBe(true)
    expect(isOutsideAsset({ mapFac: null, currentZone: 'OUTSIDE' }, catalog)).toBe(true)
  })
})
