import { describe, expect, it } from 'vitest'
import { beforeLayoutsOf, INITIAL_DRAFT, relocationDraftReducer as reduce, resolveBeforeLayout } from './relocationDraft'

const target = { layoutId: 'floor1' as const, zone: 'A3-1' }

describe('relocationDraftReducer', () => {
  it('adds codes once, in order', () => {
    const s = reduce(reduce(INITIAL_DRAFT, { type: 'add', codes: ['A', 'B'] }), { type: 'add', codes: ['B', 'C'] })
    expect(s.selected).toEqual(['A', 'B', 'C'])
    expect(reduce(s, { type: 'add', codes: ['A'] })).toBe(s)
  })

  it('removing one machine keeps the target; removing the last resets it', () => {
    let s = reduce(INITIAL_DRAFT, { type: 'add', codes: ['A', 'B'] })
    s = reduce(s, { type: 'setTarget', target })
    s = reduce(s, { type: 'setBeforeLayout', layoutId: 'floor2' })
    s = reduce(s, { type: 'remove', code: 'A' })
    expect(s).toEqual({ selected: ['B'], target, activeBeforeLayout: 'floor2' })
    expect(reduce(s, { type: 'remove', code: 'B' })).toEqual(INITIAL_DRAFT)
  })

  it('clear resets everything', () => {
    const s = reduce(reduce(INITIAL_DRAFT, { type: 'add', codes: ['A'] }), { type: 'setTarget', target })
    expect(reduce(s, { type: 'clear' })).toEqual(INITIAL_DRAFT)
  })
})

describe('before layout', () => {
  it('lists distinct drawn layouts and falls back to the first when the stored one is gone', () => {
    const layouts = beforeLayoutsOf(['floor1', null, 'floor2', 'floor1'])
    expect(layouts).toEqual(['floor1', 'floor2'])
    expect(resolveBeforeLayout('floor2', layouts)).toBe('floor2')
    expect(resolveBeforeLayout('floor5', layouts)).toBe('floor1')
    expect(resolveBeforeLayout(null, [])).toBeNull()
  })
})
