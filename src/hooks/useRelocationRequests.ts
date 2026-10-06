import { useCallback, useEffect, useState } from 'react'
import { apiRelocationRepository, type NewRelocationRequest, type RelocationRequestRepository } from '../api/relocationRequests'
import type { RelocationRequest } from '../types/relocation'

/** UI-facing API; defaults to /api/relocation-requests, pass another repository to switch the backend. */
export function useRelocationRequests(repo: RelocationRequestRepository = apiRelocationRepository) {
  const [requests, setRequests] = useState<RelocationRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [persistent, setPersistent] = useState(true)
  const syncPersistent = useCallback(() => setPersistent(repo.isPersistent?.() ?? true), [repo])

  const list = useCallback(async () => {
    setLoading(true)
    try {
      const next = await repo.list()
      setRequests(next)
      setError(null)
      return next
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return []
    } finally {
      syncPersistent()
      setLoading(false)
    }
  }, [repo, syncPersistent])

  const create = useCallback(
    async (input: NewRelocationRequest) => {
      try {
        const created = await repo.create(input)
        // Reload so the table shows what the server stored (dates, statuses).
        await list()
        return created
      } finally {
        syncPersistent()
      }
    },
    [repo, list, syncPersistent],
  )

  /** Uploads the drawing, then reloads so the table shows its drawingUrl. */
  const uploadDrawing = useCallback(
    async (requestNo: string, png: Blob) => {
      if (!repo.uploadDrawing) throw new Error('Drawing upload is not supported by this backend.')
      const saved = await repo.uploadDrawing(requestNo, png)
      await list()
      return saved
    },
    [repo, list],
  )

  /** Rebuilds the Excel file of a request on the server. */
  const regenerateExcel = useCallback(
    async (requestNo: string) => {
      if (!repo.regenerateExcel) throw new Error('Excel regeneration is not supported by this backend.')
      return repo.regenerateExcel(requestNo)
    },
    [repo],
  )

  /** Stored snapshot of one request (GET detail); falls back to the listed copy when the backend has no detail. */
  const get = useCallback(
    async (requestNo: string) => {
      if (repo.get) return repo.get(requestNo)
      const found = requests.find((r) => r.id === requestNo)
      if (!found) throw new Error(`Unknown request ${requestNo}`)
      return found
    },
    [repo, requests],
  )

  useEffect(() => {
    void list()
  }, [list])

  return { requests, loading, error, persistent, list, create, get, uploadDrawing, regenerateExcel }
}
