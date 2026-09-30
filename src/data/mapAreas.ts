// Pure geometry (no asset imports) so Node scripts can load it directly, e.g. scripts/convertDemoGeo.ts.

/**
 * Visual boundary of a map area (separate from `zones`, which are the count-marker positions).
 * Points are percentages (0-100) of the layout image box: the same coordinate space as zone x/y.
 */
export interface MapArea {
  code: string
  points: Array<{ x: number; y: number }>
}

/** Axis-aligned area as a 4-point polygon (clockwise from top-left), in image percentages. */
export function rectArea(code: string, left: number, top: number, right: number, bottom: number): MapArea {
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

const round2 = (n: number) => Math.round(n * 100) / 100

/** Pixel rect [x, y, w, h] on an imgW x imgH image -> rectArea in image percentages (2 decimals). */
export function pxRectToArea(code: string, [x, y, w, h]: readonly [number, number, number, number], imgW: number, imgH: number): MapArea {
  return rectArea(code, round2((x / imgW) * 100), round2((y / imgH) * 100), round2(((x + w) / imgW) * 100), round2(((y + h) / imgH) * 100))
}

/** Axis-aligned bounding box of an area's points. */
export function areaBounds(area: MapArea) {
  const xs = area.points.map((p) => p.x)
  const ys = area.points.map((p) => p.y)
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) }
}

/** Floor 1 - Press major areas. Approximate starting boundaries; adjust against the image as needed. */
export const FLOOR1_PRESS_AREAS: MapArea[] = [
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
export const FLOOR1_GUIDE_AREAS: MapArea[] = [
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
export const FLOOR1_WAREHOUSE_AREAS: MapArea[] = [
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
export const FLOOR1_MOLD_AREAS: MapArea[] = [
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
export const FLOOR2_ALL_AREAS: MapArea[] = [
  rectArea('A40', 3.47, 7.18, 29.62, 70.10),
  rectArea('A41', 29.52, 35.34, 56.83, 43.88),
  rectArea('A42', 56.83, 15.53, 96.22, 52.82),
  rectArea('A43', 58.09, 61.75, 65.23, 93.59),
]
