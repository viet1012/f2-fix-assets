import { useCallback, useMemo, useReducer, useRef } from 'react'
import type { LayoutId } from '../data/mapData'
import type { AssetLocation } from '../types/location'
import type { RelocationTarget } from '../types/relocation'
import { DEFAULT_CONTEXT, rowLayoutId, type RelocationContext } from '../utils/relocation'
import { beforeLayoutsOf, INITIAL_DRAFT, relocationDraftReducer, resolveBeforeLayout, type RelocationDraftState } from '../utils/relocationDraft'

export function useRelocationDraft<R extends Pick<AssetLocation, 'code' | 'currentZone' | 'positionA'>>(byCode: ReadonlyMap<string, R>, ctx: RelocationContext = DEFAULT_CONTEXT) {
  const [state, dispatch] = useReducer(relocationDraftReducer, INITIAL_DRAFT)

  const selectedRows = useMemo(() => state.selected.map((c) => byCode.get(c)).filter((r): r is R => r !== undefined), [state.selected, byCode])
  const beforeLayouts = useMemo(() => beforeLayoutsOf(selectedRows.map((r) => rowLayoutId(r, ctx.index))), [selectedRows, ctx])
  const activeBeforeLayout = resolveBeforeLayout(state.activeBeforeLayout, beforeLayouts)

  const add = useCallback((codes: readonly string[]) => dispatch({ type: 'add', codes }), [])
  const remove = useCallback((code: string) => dispatch({ type: 'remove', code }), [])
  const clear = useCallback(() => dispatch({ type: 'clear' }), [])
  const reset = useCallback(() => dispatch({ type: 'reset' }), [])
  const setTarget = useCallback((target: RelocationTarget | null) => dispatch({ type: 'setTarget', target }), [])
  const setBeforeLayout = useCallback((layoutId: LayoutId | null) => dispatch({ type: 'setBeforeLayout', layoutId }), [])
  // Snapshot / restore of the whole draft (the tour replaces it with sample data, then puts the user's back).
  const latest = useRef(state)
  latest.current = state
  const snapshot = useCallback((): RelocationDraftState => latest.current, [])
  const restore = useCallback((saved: RelocationDraftState) => dispatch({ type: 'restore', state: saved }), [])

  return { selected: state.selected, selectedRows, target: state.target, beforeLayouts, activeBeforeLayout, add, remove, clear, reset, setTarget, setBeforeLayout, snapshot, restore }
}
