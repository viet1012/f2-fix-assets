// Floor layout images live in src/assets/maps (extracted byte-for-byte from the former inline base64).
import floor1Press from '../assets/maps/floor1-press.png'
import floor1Guide from '../assets/maps/floor1-guide.png'
import floor1Warehouse from '../assets/maps/floor1-warehouse.png'
import floor1Mold from '../assets/maps/floor1-mold.png'
import floor2All from '../assets/maps/floor2-all.png'
// "3D look" variants (scripts/make3dMaps.py): same size as the originals, so all geometry is shared.
import floor1Press3d from '../assets/maps/floor1-press-3d.png'
import floor1Guide3d from '../assets/maps/floor1-guide-3d.png'
import floor1Warehouse3d from '../assets/maps/floor1-warehouse-3d.png'
import floor1Mold3d from '../assets/maps/floor1-mold-3d.png'
import floor2All3d from '../assets/maps/floor2-all-3d.png'

import {
  FLOOR1_GUIDE_AREAS,
  FLOOR1_MOLD_AREAS,
  FLOOR1_PRESS_AREAS,
  FLOOR1_WAREHOUSE_AREAS,
  FLOOR2_ALL_AREAS,
} from './mapAreas'
import { SUB_AREAS } from './subAreas'
import { buildZoneIndex } from '../utils/zone'

export type { MapArea } from './mapAreas'

// The layout images only cover Factory 2 / KVH division.
export const MAP_FACTORY = 'Factory 2'
export const MAP_DIV = 'KVH'

export type LayoutId = 'floor1' | 'floor2' | 'floor3' | 'floor4' | 'floor5'
// Building is not a layout property: it comes from each zone's `fac` in GET /api/locations (utils/locationCatalog).

export const FLOORS = [
  {
    id: "floor1",
    title: "Floor 1 - Press",
    zones: [
      { code: "A1", x: 36.67, y: 46.47 },
      { code: "A1-1", x: 31.01, y: 33.87 },
      { code: "A1-2", x: 40.25, y: 59.63 },
      { code: "A2", x: 56.71, y: 46.61 },
      { code: "A2-1", x: 67.55, y: 44.0 },
      { code: "A2-2", x: 52.3, y: 55.1 },
      { code: "A2-3", x: 65.05, y: 55.1 },
      { code: "A3", x: 80.13, y: 45.98 },
      { code: "A3-1", x: 80.89, y: 38.15 },
      { code: "A3-2", x: 75.14, y: 47.8 },
      { code: "A3-3", x: 82.67, y: 58.34 },
      { code: "A4", x: 37.02, y: 76.35 },
      { code: "A4-1", x: 33.8, y: 88.42 },
      { code: "A4-2", x: 44.03, y: 88.0 },
      { code: "A5-2", x: 50.31, y: 86.39 },
      { code: "A5-1", x: 66.53, y: 71.11 },
      { code: "A5", x: 59.4, y: 77.25 },
      { code: "A6", x: 84.36, y: 77.47 },
      { code: "A6-1", x: 73.46, y: 66.33 },
      { code: "A6-2", x: 91.17, y: 75.18 },
      { code: "A6-3", x: 74.18, y: 81.91 },
      { code: "A6-4", x: 91.17, y: 87.09 },
      { code: "A8", x: 61.22, y: 93.74 },
      { code: "A7", x: 22.72, y: 72.73 },
      { code: "A9", x: 12.36, y: 52.94 },
      { code: "A10", x: 67.65, y: 21.71 },
      { code: "A11", x: 96.69, y: 61.02 },
    ],
    imgW: 1226,
    imgH: 718,
    imageData: floor1Press,
    imageData3d: floor1Press3d,
    areas: FLOOR1_PRESS_AREAS,
    subAreas: SUB_AREAS.floor1,
    dbFloor: "1F",
  },
  {
    id: "floor2",
    title: "Floor 1 - Guide",
    zones: [
      { code: "A12-1", x: 25.37, y: 15.27 },
      { code: "A12-2", x: 43.02, y: 19.55 },
      { code: "A12", x: 33.44, y: 30.29 },
      { code: "A13", x: 64.76, y: 30.02 },
      { code: "A13-1", x: 57.12, y: 22.77 },
      { code: "A13-2", x: 68.12, y: 22.97 },
      { code: "A19", x: 91.64, y: 15.53 },
      { code: "A16", x: 88.98, y: 32.85 },
      { code: "A16-1", x: 88.07, y: 23.13 },
      { code: "A16-2", x: 85.84, y: 38.45 },
      { code: "A14", x: 33.16, y: 67.06 },
      { code: "A14-1", x: 26.34, y: 76.96 },
      { code: "A14-2", x: 44.24, y: 53.19 },
      { code: "A14-3", x: 43.26, y: 87.1 },
      { code: "A15", x: 65.96, y: 67.06 },
      { code: "A15-1", x: 55.76, y: 63.47 },
      { code: "A15-2", x: 78.9, y: 58.35 },
      { code: "A15-3", x: 56.76, y: 76.96 },
      { code: "A15-4", x: 70.81, y: 86.66 },
      { code: "A18", x: 46.18, y: 4.44 },
      { code: "A20", x: 97.56, y: 42.65 },
      { code: "A21", x: 63.74, y: 96.02 },
      { code: "A17-1", x: 11.89, y: 17.14 },
      { code: "A17-2", x: 11.75, y: 29.38 },
      { code: "A17-4", x: 5.26, y: 83.06 },
      { code: "A17-5", x: 13.09, y: 94.99 },
      { code: "A17", x: 11.92, y: 55.1 },
      { code: "A17-3", x: 10.59, y: 63.65 },
      { code: "A17-6", x: 20.38, y: 55.9 },
    ],
    imgW: 1178,
    imgH: 509,
    imageData: floor1Guide,
    imageData3d: floor1Guide3d,
    areas: FLOOR1_GUIDE_AREAS,
    subAreas: SUB_AREAS.floor2,
    dbFloor: "1F",
  },
  {
    id: "floor3",
    title: "Floor 1 - Warehouse (WH)",
    zones: [
      { code: "A22", x: 20.49, y: 30.83 },
      { code: "A23", x: 62.26, y: 7.05 },
      { code: "A25", x: 61.77, y: 18.03 },
      { code: "A24", x: 40.65, y: 22.69 },
      { code: "A26", x: 72.8, y: 42.8 },
      { code: "A27", x: 81.35, y: 42.8 },
      { code: "A28", x: 87.94, y: 42.8 },
      { code: "A29", x: 54.69, y: 61.24 },
    ],
    imgW: 890,
    imgH: 754,
    imageData: floor1Warehouse,
    imageData3d: floor1Warehouse3d,
    areas: FLOOR1_WAREHOUSE_AREAS,
    subAreas: SUB_AREAS.floor3,
    dbFloor: "1F",
  },
  {
    id: "floor4",
    title: "Floor 1 - Mold",
    zones: [
      { code: "A30", x: 48.46, y: 65.5 },
      { code: "A31", x: 30.92, y: 49.58 },
      { code: "A32", x: 30.92, y: 28.21 },
      { code: "A33", x: 40.63, y: 14.95 },
      { code: "A34", x: 67.07, y: 49.5 },
      { code: "A35", x: 67.13, y: 28.21 },
      { code: "A31-1", x: 21.41, y: 55.58 },
      { code: "A31-2", x: 21.41, y: 43.58 },
      { code: "A31-3", x: 40.42, y: 55.58 },
      { code: "A31-4", x: 40.42, y: 43.58 },
      { code: "A32-1", x: 40.42, y: 28.21 },
      { code: "A32-2", x: 21.41, y: 28.21 },
      { code: "A34-1", x: 58.64, y: 55.5 },
      { code: "A34-2", x: 58.64, y: 43.5 },
      { code: "A35-1", x: 75.54, y: 32.63 },
      { code: "A35-2", x: 58.73, y: 23.79 },
      { code: "A34-3", x: 77.87, y: 49.5 },
      { code: "A36", x: 82.0, y: 81.5 },
      { code: "A37", x: 7.96, y: 36.75 },
      { code: "A38", x: 47.86, y: 5.96 },
      { code: "A39", x: 91.83, y: 35.17 },
    ],
    imgW: 467,
    imgH: 737,
    imageData: floor1Mold,
    imageData3d: floor1Mold3d,
    areas: FLOOR1_MOLD_AREAS,
    subAreas: SUB_AREAS.floor4,
    dbFloor: "1F",
    // Source drawing orientation = this image turned 90deg clockwise (see FLOOR1_MOLD_AREAS note).
    rotationDeg: 90,
  },
  {
    id: "floor5",
    title: "Floor 2 - All",
    zones: [
      { code: "A41", x: 32.75, y: 40.44 },
      { code: "A43", x: 61.45, y: 84.49 },
      { code: "A40", x: 16.68, y: 35.41 },
      { code: "A40-1", x: 15.89, y: 21.29 },
      { code: "A40-2", x: 21.07, y: 47.61 },
      { code: "A40-3", x: 7.23, y: 64.92 },
      { code: "A42", x: 77.68, y: 34.53 },
      { code: "A42-1", x: 67.73, y: 21.52 },
      { code: "A42-2", x: 74.45, y: 28.43 },
      { code: "A42-3", x: 81.42, y: 26.06 },
      { code: "A42-4", x: 62.5, y: 37.04 },
      { code: "A42-5", x: 81.14, y: 46.36 },
      { code: "A42-6", x: 91.73, y: 40.56 },
      { code: "A40-4", x: 26.53, y: 62.89 },
    ],
    imgW: 1228,
    imgH: 717,
    imageData: floor2All,
    imageData3d: floor2All3d,
    areas: FLOOR2_ALL_AREAS,
    subAreas: SUB_AREAS.floor5,
    dbFloor: "2F",
  },
] as const

/** Zone code (major, sub-zone or marker) -> id of the layout that draws it. */
export const ZONE_INDEX: ReadonlyMap<string, LayoutId> = buildZoneIndex(FLOORS)
