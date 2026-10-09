export type Pairs = Array<[string, number]>

/** No meaningful data: empty, all zero, or a single blank / N/A bucket holding 100%. */
export function isMeaningless(values: Pairs): boolean {
  const nonZero = values.filter(([, v]) => v > 0)
  if (!nonZero.length) return true
  if (nonZero.length === 1) {
    const k = nonZero[0][0].trim().toUpperCase()
    return k === '' || k === 'N/A' || k === 'NA' || k === 'NULL' || k === 'UNDEFINED'
  }
  return false
}

/** Sort descending, keeping the "Others" bucket last. */
export function sortDesc(values: Pairs, othersLabel: string): Pairs {
  const others = values.filter(([k]) => k === othersLabel)
  return values.filter(([k]) => k !== othersLabel).sort((a, b) => b[1] - a[1]).concat(others)
}

/** Slices below `min` share of the total are merged into one "Others" slice (only when ≥ 2 would be merged). */
export function mergeSmall(values: Pairs, othersLabel: string, min = 0.03): Pairs {
  const total = values.reduce((a, [, v]) => a + v, 0) || 1
  const small = values.filter(([k, v]) => k === othersLabel || v / total < min)
  if (small.length < 2) return sortDesc(values, othersLabel)
  const big = values.filter(([k, v]) => k !== othersLabel && v / total >= min)
  return sortDesc([...big, [othersLabel, small.reduce((a, [, v]) => a + v, 0)]], othersLabel)
}

export function truncate(s: string, max = 22): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}
