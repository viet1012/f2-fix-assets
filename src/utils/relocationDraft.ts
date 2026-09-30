import type { LayoutId } from '../data/mapData'
import type { RelocationTarget } from '../types/relocation'

export interface RelocationDraftState {
  /** Selected asset codes, in pick order, unique. */
  selected: string[]
  target: RelocationTarget | null
  /** Layout shown on the Before map when the selected machines span several layouts. */
  activeBeforeLayout: LayoutId | null
}

export type RelocationDraftAction =
  | { type: 'add'; codes: readonly string[] }
  | { type: 'remove'; code: string }
  | { type: 'clear' }
  | { type: 'setTarget'; target: RelocationTarget | null }
  | { type: 'setBeforeLayout'; layoutId: LayoutId | null }
  | { type: 'reset' }

export const INITIAL_DRAFT: RelocationDraftState = { selected: [], target: null, activeBeforeLayout: null }

export function relocationDraftReducer(state: RelocationDraftState, action: RelocationDraftAction): RelocationDraftState {
  switch (action.type) {
    case 'add': {
      const next = [...state.selected]
      for (const code of action.codes) if (!next.includes(code)) next.push(code)
      return next.length === state.selected.length ? state : { ...state, selected: next }
    }
    case 'remove': {
      const selected = state.selected.filter((c) => c !== action.code)
      // Removing the last machine resets the whole draft (target included).
      return selected.length ? { ...state, selected } : INITIAL_DRAFT
    }
    case 'clear':
    case 'reset':
      return INITIAL_DRAFT
    case 'setTarget':
      return { ...state, target: action.target }
    case 'setBeforeLayout':
      return { ...state, activeBeforeLayout: action.layoutId }
  }
}

/** Distinct layouts of the selected rows (in first-seen order), skipping rows whose zone is not drawn. */
export function beforeLayoutsOf<Id>(layoutIds: readonly (Id | null)[]): Id[] {
  return [...new Set(layoutIds.filter((id): id is Id => id !== null))]
}

/** The stored layout when it still holds a selected machine, else the first one. */
export function resolveBeforeLayout<Id>(active: Id | null, layouts: readonly Id[]): Id | null {
  return active !== null && layouts.includes(active) ? active : (layouts[0] ?? null)
}
