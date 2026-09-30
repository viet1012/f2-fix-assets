import type { RelocationRequest } from '../types/relocation'

export type NewRelocationRequest = Omit<RelocationRequest, 'id' | 'status'>

/** Storage-agnostic contract: an HTTP implementation can replace the localStorage one without touching the UI. */
export interface RelocationRequestRepository {
  list(): Promise<RelocationRequest[]>
  create(input: NewRelocationRequest): Promise<RelocationRequest>
  /** False when requests are only kept in memory (lost on reload). Omit for server-backed implementations. */
  isPersistent?(): boolean
}

const STORAGE_KEY = 'f2.relocation.requests'

export function draftId(n: number) {
  return `DRAFT-${String(n).padStart(4, '0')}`
}

function nextId(requests: readonly RelocationRequest[]) {
  const max = requests.reduce((m, r) => Math.max(m, Number(/^DRAFT-(\d+)$/.exec(r.id)?.[1] ?? 0)), 0)
  return draftId(max + 1)
}

/** localStorage-backed; keeps an in-memory copy so it still works when storage is blocked (private window). */
export function createLocalRelocationRepository(key = STORAGE_KEY): RelocationRequestRepository {
  let memory: RelocationRequest[] = []
  let persistent = true
  const read = (): RelocationRequest[] => {
    try {
      const raw = window.localStorage.getItem(key)
      const parsed: unknown = raw ? JSON.parse(raw) : []
      if (Array.isArray(parsed)) memory = parsed as RelocationRequest[]
    } catch (e) {
      // Corrupted JSON: storage still works. Anything else (SecurityError, no storage): memory only.
      if (!(e instanceof SyntaxError)) persistent = false
    }
    return memory
  }
  const write = (requests: RelocationRequest[]) => {
    memory = requests
    try {
      window.localStorage.setItem(key, JSON.stringify(requests))
      persistent = true
    } catch {
      persistent = false
    }
  }
  return {
    async list() {
      return read()
    },
    async create(input) {
      const all = read()
      const request: RelocationRequest = { ...input, id: nextId(all), status: 'PENDING' }
      write([...all, request])
      return request
    },
    isPersistent: () => persistent,
  }
}

export const localRelocationRepository = createLocalRelocationRepository()
