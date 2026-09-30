import { useCallback, useEffect, useState } from 'react'
import { localRelocationRepository, type NewRelocationRequest, type RelocationRequestRepository } from '../api/relocationRequests'
import type { RelocationRequest } from '../types/relocation'

/** UI-facing API; pass another repository (e.g. HTTP) to switch the backend. */
export function useRelocationRequests(repo: RelocationRequestRepository = localRelocationRepository) {
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
        setRequests((prev) => [...prev, created])
        return created
      } finally {
        syncPersistent()
      }
    },
    [repo, syncPersistent],
  )

  useEffect(() => {
    void list()
  }, [list])

  return { requests, loading, error, persistent, list, create }
}
