import { useCallback, useMemo, useState } from 'react'
import type { DashboardFilters, FixedAsset } from '../types/fixedAsset'
import { emptyFilters, filterAssets } from '../utils/fixedAsset'

/** Single source of truth for dashboard filters. Filtering rules live in utils/filterAssets. */
export function useAssetFilters(rows: FixedAsset[]) {
  const [filters, setFilters] = useState<DashboardFilters>(emptyFilters)
  const filteredRows = useMemo(() => filterAssets(rows, filters), [rows, filters])
  const resetFilters = useCallback(() => setFilters({ ...emptyFilters }), [])
  return { filters, setFilters, filteredRows, resetFilters }
}
