import { useCallback, useEffect, useRef, useState } from 'react'
import { getAssets, uploadExcel, uploadFromUrl } from '../api/fixedAssetApi'
import type { AssetsResponse } from '../types/fixedAsset'

const emptyData: AssetsResponse = {
  tableData: [],
  filters: { groups: [], checked: [], approved: [], div: [], factory: [], floor: [], kind: [], status: [] },
  lastImport: null,
}

export type DataOperation = 'load' | 'upload' | 'url'

/** Structured status so the UI can render it in the active language. */
export type DataStatus =
  | { type: 'loading' }
  | { type: 'processing'; operation: 'upload' | 'url'; target: string }
  | { type: 'ready' }
  | { type: 'error'; operation: DataOperation; message: string }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Loads assets and handles imports. Same sequence as the legacy App:
 * upload/url import -> quiet refresh (GET /api/assets) -> status update.
 */
export function useFixedAssets() {
  const [data, setData] = useState<AssetsResponse>(emptyData)
  const [status, setStatus] = useState<DataStatus>({ type: 'loading' })
  const [busy, setBusy] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const initialLoad = useRef(false)

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setStatus({ type: 'loading' })
    const next = await getAssets()
    if (import.meta.env.DEV) {
      // Diagnostic for "Bộ phận = 0": field names of a row + `group` of 3 sample rows (no personal fields logged).
      console.debug('[assets] row keys:', Object.keys(next.tableData[0] ?? {}), 'group samples:', next.tableData.slice(0, 3).map((r) => r.group), 'filters.groups:', next.filters?.groups?.length)
    }
    setData(next)
    setHasLoaded(true)
    setStatus({ type: 'ready' })
  }, [])

  const reload = useCallback(() => {
    refresh().catch((error: unknown) => {
      setStatus({ type: 'error', operation: 'load', message: errorMessage(error) })
    })
  }, [refresh])

  useEffect(() => {
    // Guard against React StrictMode double-invoking the initial load in development.
    if (initialLoad.current) return
    initialLoad.current = true
    reload()
  }, [reload])

  const upload = async (file: File) => {
    setBusy(true)
    setStatus({ type: 'processing', operation: 'upload', target: file.name })
    try {
      await uploadExcel(file)
      await refresh(true)
    } catch (error) {
      setStatus({ type: 'error', operation: 'upload', message: errorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  const importFromUrl = async (url: string) => {
    setBusy(true)
    setStatus({ type: 'processing', operation: 'url', target: url })
    try {
      await uploadFromUrl(url)
      await refresh(true)
    } catch (error) {
      setStatus({ type: 'error', operation: 'url', message: errorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  return { data, status, busy, hasLoaded, reload, upload, importFromUrl }
}
