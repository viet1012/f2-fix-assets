import { useCallback, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import type { PaletteMode } from '@mui/material'

const STORAGE_KEY = 'f2-theme'
const REVEAL_MS = 450
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'
const STYLE_ID = 'f2-theme-reveal'

/** What the theme buttons pass: the clicked element is the reveal origin (keyboard clicks too: same target). */
export type ThemeToggleEvent = { currentTarget: EventTarget | null }

type ViewTransitionDocument = Document & { startViewTransition?: (update: () => void) => { ready: Promise<void> } }

function readStoredMode(): PaletteMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/** The reveal is a clip-path on the new snapshot only: no default cross-fade, no blending of the two. */
function ensureRevealStyle() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = '::view-transition-old(root),::view-transition-new(root){animation:none;mix-blend-mode:normal;}'
  document.head.appendChild(style)
}

/** Centre of the clicked button (viewport px); the viewport centre without one. */
function originOf(event?: ThemeToggleEvent) {
  const el = event?.currentTarget
  if (el instanceof Element) {
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 }
}

/** Light/dark mode persisted under the same key the legacy UI used; toggling reveals the new theme as a circle. */
export function useThemeMode() {
  const [mode, setMode] = useState<PaletteMode>(readStoredMode)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      // Storage unavailable (private mode / blocked); theme still works for this session.
    }
  }, [mode])

  const toggleMode = useCallback((event?: ThemeToggleEvent) => {
    const flip = () => setMode((m) => (m === 'dark' ? 'light' : 'dark'))
    const doc = document as ViewTransitionDocument
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_QUERY).matches
    // No View Transitions API, or reduced motion: switch at once.
    if (typeof doc.startViewTransition !== 'function' || reduced) {
      flip()
      return
    }
    ensureRevealStyle()
    const { x, y } = originOf(event)
    // Radius reaching the farthest viewport corner from the origin.
    const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
    const transition = doc.startViewTransition(() => flushSync(flip))
    transition.ready
      .then(() => {
        document.documentElement.animate?.(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
          { duration: REVEAL_MS, easing: 'ease-out', pseudoElement: '::view-transition-new(root)' },
        )
      })
      .catch(() => {
        // Transition skipped (e.g. another one started): the mode has already changed.
      })
  }, [])

  return { mode, toggleMode }
}
