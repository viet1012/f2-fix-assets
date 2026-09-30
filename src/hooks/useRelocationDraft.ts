import { useCallback, useMemo, useReducer } from 'react'
import type { LayoutId } from '../data/mapData'
import type { AssetLocation } from '../types/location'
import type { RelocationTarget } from '../types/relocation'
import { DEFAULT_CONTEXT, rowLayoutId, type RelocationContext } from '../utils/relocation'
import { beforeLayoutsOf, INITIAL_DRAFT, relocationDraftReducer, resolveBeforeLayout } from '../utils/relocationDraft'

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

  return { selected: state.selected, selectedRows, target: state.target, beforeLayouts, activeBeforeLayout, add, remove, clear, reset, setTarget, setBeforeLayout }
}
