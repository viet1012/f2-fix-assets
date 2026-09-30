// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalRelocationRepository } from './relocationRequests'

const input = { items: [], to: { layoutId: 'floor1' as const, zone: 'A3-1' }, requestedBy: 'E001', dStart: '2026-10-01', dEnd: '2026-10-02', reason: '' }

beforeEach(() => window.localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('local relocation repository', () => {
  it('creates PENDING requests with sequential DRAFT ids and persists them', async () => {
    const repo = createLocalRelocationRepository('test-key')
    expect((await repo.create(input)).id).toBe('DRAFT-0001')
    const second = await repo.create(input)
    expect(second).toMatchObject({ id: 'DRAFT-0002', status: 'PENDING' })
    expect((await createLocalRelocationRepository('test-key').list()).map((r) => r.id)).toEqual(['DRAFT-0001', 'DRAFT-0002'])
  })

  it('ignores corrupted storage', async () => {
    window.localStorage.setItem('bad', '{not json')
    const repo = createLocalRelocationRepository('bad')
    expect(await repo.list()).toEqual([])
    expect(repo.isPersistent?.()).toBe(true)
  })

  it('falls back to memory and reports it when storage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError') })
    const repo = createLocalRelocationRepository('blocked')
    expect((await repo.create(input)).id).toBe('DRAFT-0001')
    expect((await repo.create(input)).id).toBe('DRAFT-0002')
    expect(repo.isPersistent?.()).toBe(false)
  })
})
