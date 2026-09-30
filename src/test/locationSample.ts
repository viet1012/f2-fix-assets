import type { AssetLocation, LocationZone } from '../types/location'

/**
 * Real GET /api/locations rows (values unchanged): duplicate A15-3 (906/907), other-floor rows with assetCount 0
 * (A5-1 2F on the 1F layout, A40-1 1F on the 2F layout), WH_RM and Outside. A3-1 is drawn but absent here.
 */
export const SAMPLE_LOCATIONS: LocationZone[] = [
  { id: 874, fac: 'Fac_A', div: 'KVH', floor: '1F', positionA: 'A1', positionAA: 'A1-1', aPos: '123,333,60,30', aaPos: null, assetCount: 26 },
  { id: 886, fac: 'Fac_A', div: 'KVH', floor: '2F', positionA: 'A5', positionAA: 'A5-1', aPos: null, aaPos: null, assetCount: 0 },
  { id: 906, fac: 'Fac_B', div: 'KVH', floor: '1F', positionA: 'A15', positionAA: 'A15-3', aPos: null, aaPos: null, assetCount: 26 },
  { id: 907, fac: 'Fac_B', div: 'KVH', floor: '1F', positionA: 'A15', positionAA: 'A15-3', aPos: null, aaPos: null, assetCount: 0 },
  { id: 920, fac: 'WH_RM', div: 'KVH', floor: '1F', positionA: 'A23', positionAA: null, aPos: null, aaPos: null, assetCount: 115 },
  { id: 931, fac: 'Fac_C', div: 'KVH', floor: '1F', positionA: 'A33', positionAA: null, aPos: null, aaPos: null, assetCount: 15 },
  { id: 941, fac: 'Fac_A', div: 'KVH', floor: '1F', positionA: 'A40', positionAA: 'A40-1', aPos: null, aaPos: null, assetCount: 0 },
  { id: 952, fac: 'Outside', div: 'KVH', floor: 'Outside', positionA: 'OUTSIDE', positionAA: null, aPos: null, aaPos: null, assetCount: 65 },
]

const asset = (over: Partial<AssetLocation> & Pick<AssetLocation, 'code'>): AssetLocation => ({
  name: `Machine ${over.code}`,
  kind: 'Machinery',
  faType: null,
  status: 'Using',
  div: 'KVH',
  factory: 'Factory 2',
  floor: '1F',
  positionA: 'A2',
  positionAA: 'A2-3',
  currentZone: 'A2-3',
  mapId: null,
  mapFac: 'Fac_A',
  mapFloor: '1F',
  aPos: null,
  aaPos: null,
  matchLevel: 'SUB',
  floorMismatch: false,
  ...over,
})

/** GET /api/assets/with-location?factory=Factory%202 sample (shape of AssetLocationResponse). */
export const SAMPLE_ASSETS: AssetLocation[] = [
  asset({ code: 'A-006-1' }),
  asset({ code: 'A-006-2', floor: '2F', floorMismatch: true }),
  // A3-1 is drawn on floor1 but has no MAP row -> NONE -> tray.
  asset({ code: 'A-007-1', positionA: 'A3', positionAA: 'A3-1', currentZone: 'A3-1', mapId: null, mapFac: null, mapFloor: null, aPos: null, aaPos: null, matchLevel: 'NONE' }),
  // At an Outside location: cannot be picked.
  asset({ code: 'A-900-1', positionA: 'OUTSIDE', positionAA: null, currentZone: 'OUTSIDE', mapId: 952, mapFac: 'Outside', mapFloor: 'Outside', matchLevel: 'MAJOR' }),
  // Same zone as A-006-*, but an asset type that cannot be relocated.
  asset({ code: 'A-008-1', name: 'License', kind: 'Software' }),
  // Building B (Guide layout, floor2), for moves across buildings / several source layouts.
  asset({ code: 'A-015-1', positionA: 'A15', positionAA: 'A15-3', currentZone: 'A15-3', mapId: 906, mapFac: 'Fac_B' }),
]
