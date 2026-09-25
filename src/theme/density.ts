/**
 * Shared spacing scale for the dashboard (MUI spacing units, 1 = 8px).
 * Keep sections, grids and card padding on these values so density stays consistent.
 */
export const density = {
  /** Gap between top-level sections and between cards in a grid. */
  gap: 1.5,
  /** Inner padding of standard cards / panels. */
  pad: 1.5,
  /** Space between the tab bar and tab content. */
  tabGap: 1.25,
} as const
