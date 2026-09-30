// Floor layout images live in src/assets/maps (extracted byte-for-byte from the former inline base64).
import floor1Press from '../assets/maps/floor1-press.png'
import floor1Guide from '../assets/maps/floor1-guide.png'
import floor1Warehouse from '../assets/maps/floor1-warehouse.png'
import floor1Mold from '../assets/maps/floor1-mold.png'
import floor2All from '../assets/maps/floor2-all.png'

/**
 * Visual boundary of a map area (separate from `zones`, which are the count-marker positions).
 * Points are percentages (0-100) of the layout image box: the same coordinate space as zone x/y.
 */
export interface MapArea {
  code: string
  points: Array<{ x: number; y: number }>
}

/** Axis-aligned area as a 4-point polygon (clockwise from top-left), in image percentages. */
function rectArea(code: string, left: number, top: number, right: number, bottom: number): MapArea {
  return {
    code,
    points: [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom },
    ],
  }
}

/** Floor 1 - Press major areas. Approximate starting boundaries; adjust against the image as needed. */
const FLOOR1_PRESS_AREAS: MapArea[] = [
  rectArea('A1', 27.37, 30.97, 46.30, 62.87),
  rectArea('A2', 47.80, 29.12, 70.20, 62.87),
  rectArea('A3', 70.76, 29.58, 94.10, 63.02),
  rectArea('A4', 27.09, 64.71, 46.67, 91.06),
  rectArea('A5', 47.89, 64.71, 70.29, 89.52),
  rectArea('A6', 70.76, 64.71, 93.72, 89.52),
  rectArea('A7', 19.59, 62.87, 25.77, 91.06),
  rectArea('A8', 48.08, 90.14, 63.92, 97.69),
  rectArea('A9', 2.25, 5.70, 19.31, 99.08),
  rectArea('A10', 19.21, 5.70, 99.25, 28.20),
  rectArea('A11', 93.63, 28.20, 99.25, 93.99),
]

/** Floor 1 - Guide (Factory B) major areas A12-A21, calibrated against the Factory B reference layout. */
const FLOOR1_GUIDE_AREAS: MapArea[] = [
  rectArea('A12', 23.04, 12.54, 47.57, 49.27),
  rectArea('A13', 48.22, 12.54, 81.44, 49.42),
  rectArea('A14', 23.04, 50.15, 47.57, 88.92),
  rectArea('A15', 48.22, 50.15, 81.44, 88.92),
  rectArea('A16', 82.41, 21.28, 94.09, 88.92),
  rectArea('A17', 0.39, 12.54, 22.32, 98.40),
  rectArea('A18', 0.39, 1.75, 99.48, 11.22),
  rectArea('A19', 82.41, 12.54, 94.09, 20.85),
  rectArea('A20', 94.09, 12.24, 99.55, 88.92),
  rectArea('A21', 23.04, 88.92, 99.48, 98.54),
]

/**
 * Floor 1 - Warehouse (WH) major areas A22-A29. A24 (extension warehouse) and A29 (diagonal lower strip)
 * follow the diagonal boundary, so they are explicit polygons rather than rectangles.
 */
const FLOOR1_WAREHOUSE_AREAS: MapArea[] = [
  rectArea('A22', 15.76, 5.22, 24.35, 39.20),
  rectArea('A23', 15.76, 5.22, 84.24, 10.73),
  {
    code: 'A24',
    points: [
      { x: 24.35, y: 11.18 },
      { x: 49.61, y: 11.18 },
      { x: 49.61, y: 51.27 },
      { x: 24.35, y: 34.13 },
    ],
  },
  rectArea('A25', 49.61, 11.33, 65.76, 22.35),
  rectArea('A26', 52.47, 22.50, 77.86, 64.08),
  rectArea('A27', 78.91, 22.50, 84.38, 64.08),
  rectArea('A28', 84.90, 5.22, 89.97, 85.99),
  {
    code: 'A29',
    points: [
      { x: 24.35, y: 34.13 },
      { x: 84.12, y: 76.30 },
      { x: 80.73, y: 84.35 },
      { x: 25.52, y: 38.00 },
    ],
  },
]

/**
 * Floor 1 - Mold major areas A30-A39. The red reference annotation was drawn on this image rotated 90deg
 * clockwise; these are the same boundaries mapped back onto the live (portrait) image:
 * image x = reference y, image y = 100 - reference x. A36 follows the lower-left diagonal edge.
 */
const FLOOR1_MOLD_AREAS: MapArea[] = [
  rectArea('A30', 23.69, 61.75, 73.23, 69.25),
  rectArea('A31', 11.91, 37.58, 49.93, 61.58),
  rectArea('A32', 11.91, 18.92, 49.93, 37.50),
  rectArea('A33', 11.78, 11.08, 69.48, 18.83),
  rectArea('A34', 50.20, 37.50, 83.94, 61.50),
  rectArea('A35', 50.33, 19.00, 83.94, 37.42),
  {
    code: 'A36',
    points: [
      { x: 73.23, y: 94.42 },
      { x: 23.69, y: 70.67 },
      { x: 23.69, y: 69.42 },
      { x: 99.60, y: 69.42 },
      { x: 99.60, y: 94.42 },
    ],
  },
  rectArea('A37', 4.15, 11.08, 11.78, 62.42),
  rectArea('A38', 11.91, 0.92, 83.80, 11.00),
  rectArea('A39', 84.07, 0.92, 99.60, 69.42),
]

/** Floor 2 - All major areas A40-A43 (child zones stay markers). A41 is the bridge corridor between A40 and A42. */
const FLOOR2_ALL_AREAS: MapArea[] = [
  rectArea('A40', 3.47, 7.18, 29.62, 70.10),
  rectArea('A41', 29.52, 35.34, 56.83, 43.88),
  rectArea('A42', 56.83, 15.53, 96.22, 52.82),
  rectArea('A43', 58.09, 61.75, 65.23, 93.59),
]

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
    areas: FLOOR1_PRESS_AREAS,
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
    areas: FLOOR1_GUIDE_AREAS,
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
    areas: FLOOR1_WAREHOUSE_AREAS,
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
    areas: FLOOR1_MOLD_AREAS,
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
    areas: FLOOR2_ALL_AREAS,
  },
] as const
