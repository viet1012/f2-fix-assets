/*
 * Manual test (relocation tab, then repeat in dark mode / EN; dev StrictMode on):
 *  1. Open "Hướng dẫn" -> popover on step 1, page dark except the hole, page scroll locked, no layout shift.
 *  2. Walk to the end -> "Hoàn tất ✓": overlay gone, scroll position and <html> overflow/padding-right restored,
 *     focus back on "Hướng dẫn"; localStorage f2.tour.relocation = {"step":0,"done":true}.
 *  3. Open again -> starts at step 1 with no "Xem tiếp" prompt; popover visible (no empty dark page).
 *  4. Go to step 4, press "Bỏ qua tour" -> closed, {"step":0,"done":true}; open again -> step 1, no prompt.
 *     (✕ / Esc at step 4 with done=false -> next open asks "Xem tiếp từ bước 4?".)
 *  5. Open again, switch to another tab while the tour is open (or press Esc) -> tour closes, page scrolls and
 *     paddings restored; padding-right never grows after repeated opens.
 *  6. Corrupt f2.tour.relocation (e.g. "x" or {"step":99}) and reload -> treated as step 0 / clamped, no error.
 */
import { alpha, Box, Button, IconButton, LinearProgress, Link, Paper, Portal, Stack, Typography, useTheme } from '@mui/material'
import CloseRounded from '@mui/icons-material/CloseRounded'
import TipsAndUpdatesOutlined from '@mui/icons-material/TipsAndUpdatesOutlined'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'
import type { Lang } from '../../types/fixedAsset'

type L10n = { vi: string; en: string }
type Side = 'top' | 'bottom' | 'left' | 'right'

export interface TourStep<C = never> {
  /** `data-tour` key of the element to frame. */
  target: string
  title: L10n
  /** Text of the step; describes the sample state when the tour runs with a context. */
  body: L10n
  /** Text used instead of `body` when there is no sample data (annotation-only tour). */
  plainBody?: L10n
  /**
   * Sample state of this step (cumulative): step n shows reset + apply of steps 1..n, so "Back" is always exact.
   * Only called when the tour has a `context`.
   */
  apply?: (ctx: C) => void
  /** Preferred side, tried before bottom → top → right → left. */
  placement?: Side
  /** Extra note shown when the target is missing or hidden (the fallback area is framed instead). */
  whenMissing?: L10n
  /** `data-tour-fallback` key framed when the target does not exist at all. */
  fallback?: string
}

export interface TourProgress {
  /** Last step viewed (0-based); 0 once the tour is finished. */
  step: number
  done: boolean
}

interface Props<C> {
  lang: Lang
  steps: readonly TourStep<C>[]
  /** Sample-data context passed to each step's `apply`; none = annotation-only tour. */
  context?: C
  /** Clears the sample state before the steps 1..n are applied again. */
  onReset?: () => void
  open: boolean
  /** `finished`: true when closed by "Hoàn tất" on the last step. */
  onClose: (step: number, finished: boolean) => void
  startAt?: number
  onStepChange?: (step: number) => void
}

type Rect = { top: number; left: number; width: number; height: number }

const PAD = 8
const RADIUS = 12
const MOVE_MS = 250
/** Room kept between the popover and the viewport edges. */
const EDGE = 12
/** Popover distance from the hole (arrow included). */
const GAP = 14
const ARROW = 12
const SCROLL_WAIT_MS = 300
const SIDES: readonly Side[] = ['bottom', 'top', 'right', 'left']
const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const isVisible = (el: Element) => el.getClientRects().length > 0 && (el as HTMLElement).offsetParent !== null

/** Target of a step, or the closest fallback area when it is missing / hidden. */
function resolve(step: TourStep): { el: HTMLElement | null; missing: boolean } {
  const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)
  if (el && isVisible(el)) return { el, missing: false }
  let fb: HTMLElement | null = el?.parentElement?.closest<HTMLElement>('[data-tour-fallback]') ?? null
  if (!fb && step.fallback) fb = document.querySelector<HTMLElement>(`[data-tour-fallback="${step.fallback}"]`)
  return { el: fb && isVisible(fb) ? fb : null, missing: true }
}

/** Hole round `el` (viewport coordinates, padding included); null = no target (popover centred). */
function measure(el: HTMLElement | null): Rect | null {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 }
}

/** Bottom of the sticky app bar (+16px): the part of the viewport it covers. */
function headerOffset() {
  const bar = document.querySelector<HTMLElement>('.MuiAppBar-root')
  if (!bar) return 16
  const pos = getComputedStyle(bar).position
  const bottom = pos === 'sticky' || pos === 'fixed' ? Math.max(0, bar.getBoundingClientRect().bottom) : 0
  return bottom + 16
}

/** Scrolls the page so `el` sits in the middle of the visible area below the header; resolves once scrolling ends. */
function scrollToCentre(el: HTMLElement | null): Promise<void> {
  if (!el) return Promise.resolve()
  const r = el.getBoundingClientRect()
  const head = headerOffset()
  const room = window.innerHeight - head
  const offset = r.height + PAD * 2 >= room ? head + PAD : head + (room - r.height) / 2
  const max = document.documentElement.scrollHeight - window.innerHeight
  const top = Math.min(Math.max(0, window.scrollY + r.top - offset), Math.max(0, max))
  if (Math.abs(top - window.scrollY) < 1) return Promise.resolve()
  const smooth = !reducedMotion()
  window.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' })
  if (!smooth) return Promise.resolve()
  return new Promise((done) => {
    const hasEnd = 'onscrollend' in window
    const finish = () => {
      clearTimeout(timer)
      window.removeEventListener('scrollend', finish)
      done()
    }
    // scrollend when supported (capped), else a fixed wait.
    const timer = setTimeout(finish, hasEnd ? 1000 : SCROLL_WAIT_MS)
    if (hasEnd) window.addEventListener('scrollend', finish)
  })
}

/** Popover position: first side (preferred, then bottom → top → right → left) where it fits without covering the hole. */
function place(hole: Rect | null, size: { w: number; h: number }, preferred?: Side) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi))
  const centred = { side: null as Side | null, top: clamp((vh - size.h) / 2, EDGE, vh - size.h - EDGE), left: clamp((vw - size.w) / 2, EDGE, vw - size.w - EDGE), arrow: 0 }
  if (!hole) return centred
  const cx = hole.left + hole.width / 2
  const cy = hole.top + hole.height / 2
  const fits: Record<Side, boolean> = {
    bottom: hole.top + hole.height + GAP + size.h <= vh - EDGE,
    top: hole.top - GAP - size.h >= EDGE,
    right: hole.left + hole.width + GAP + size.w <= vw - EDGE,
    left: hole.left - GAP - size.w >= EDGE,
  }
  const side = [...(preferred ? [preferred] : []), ...SIDES].find((s) => fits[s])
  if (!side) return { ...centred, top: vh - size.h - EDGE } // Hole taller than the room: bottom edge, no arrow.
  if (side === 'bottom' || side === 'top') {
    const left = clamp(cx - size.w / 2, EDGE, vw - size.w - EDGE)
    const top = side === 'bottom' ? hole.top + hole.height + GAP : hole.top - GAP - size.h
    return { side, top, left, arrow: clamp(cx - left, 20, size.w - 20) }
  }
  const top = clamp(cy - size.h / 2, EDGE, vh - size.h - EDGE)
  const left = side === 'right' ? hole.left + hole.width + GAP : hole.left - GAP - size.w
  return { side, top, left, arrow: clamp(cy - top, 20, size.h - 20) }
}

/** Arrow square (rotated 45°) on the popover edge facing the hole. */
function arrowStyle(side: Side, at: number): CSSProperties {
  const half = -ARROW / 2
  switch (side) {
    case 'bottom': return { top: half, left: at - ARROW / 2 }
    case 'top': return { bottom: half, left: at - ARROW / 2 }
    case 'right': return { left: half, top: at - ARROW / 2 }
    case 'left': return { right: half, top: at - ARROW / 2 }
  }
}

const ease = (t: number) => 1 - (1 - t) ** 3
const lerp = (a: Rect, b: Rect, t: number): Rect => ({
  top: a.top + (b.top - a.top) * t,
  left: a.left + (b.left - a.left) * t,
  width: a.width + (b.width - a.width) * t,
  height: a.height + (b.height - a.height) * t,
})

/**
 * Page scroll lock, reference-counted and idempotent: the original overflow / padding-right / scrollY are saved once
 * on the first lock and restored exactly (scroll position included) on the last unlock; the scrollbar compensation is
 * never added twice.
 */
let lockCount = 0
let lockSaved: { overflow: string; paddingRight: string; scrollY: number } | null = null
function lockScroll() {
  if (lockCount++ > 0) return
  const root = document.documentElement
  lockSaved = { overflow: root.style.overflow, paddingRight: root.style.paddingRight, scrollY: window.scrollY }
  const bar = window.innerWidth - root.clientWidth
  root.style.overflow = 'hidden'
  if (bar > 0) root.style.paddingRight = `${(parseFloat(getComputedStyle(root).paddingRight) || 0) + bar}px`
}
function unlockScroll() {
  if (lockCount === 0) return
  if (--lockCount > 0 || !lockSaved) return
  const root = document.documentElement
  const saved = lockSaved
  lockSaved = null
  root.style.overflow = saved.overflow
  root.style.paddingRight = saved.paddingRight
  window.scrollTo({ top: saved.scrollY, behavior: 'auto' })
}

/** Locks page scrolling while mounted; wheel / touchmove are blocked outside `allow`. */
function useScrollLock(allow: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    lockScroll()
    const block = (e: Event) => {
      if (!(e.target instanceof Node && allow.current?.contains(e.target))) e.preventDefault()
    }
    window.addEventListener('wheel', block, { passive: false, capture: true })
    window.addEventListener('touchmove', block, { passive: false, capture: true })
    return () => {
      window.removeEventListener('wheel', block, { capture: true })
      window.removeEventListener('touchmove', block, { capture: true })
      unlockScroll()
    }
  }, [allow])
}

/** If no popover has shown after this delay, the tour closes itself (never a dark page with nothing to click). */
const SAFETY_MS = 1500

const TEXT = {
  vi: { skip: 'Bỏ qua tour', back: '← Quay lại', next: 'Tiếp →', finish: 'Hoàn tất ✓', close: 'Đóng hướng dẫn', progress: 'Tiến trình hướng dẫn' },
  en: { skip: 'Skip tour', back: '← Back', next: 'Next →', finish: 'Done ✓', close: 'Close the tour', progress: 'Tour progress' },
} as const

/**
 * Interactive tour: dark overlay with a hole round the `data-tour` element of each step + a popover. Changes no data.
 * Closed: renders nothing and holds no listener; every open mounts a fresh view (no state left from the last run).
 */
export function GuidedTour<C = never>({ open, steps, startAt = 0, ...rest }: Props<C>) {
  if (!open || !steps.length) return null
  return <TourView {...rest} steps={steps} startAt={Math.min(Math.max(Math.trunc(startAt) || 0, 0), steps.length - 1)} />
}

/** Visible: rendered (not inside a display: none tab panel). */
const shownOnPage = (node: HTMLElement | null) => !!node && node.getClientRects().length > 0

function TourView<C>({ lang, steps, context, onReset, onClose, startAt, onStepChange }: Omit<Props<C>, 'open' | 'startAt'> & { startAt: number }) {
  const theme = useTheme()
  const tx = TEXT[lang]
  const dark = theme.palette.mode === 'dark'
  const maskId = useId()
  const titleId = useId()
  const bodyId = useId()
  const [index, setIndex] = useState(startAt)
  /** Hole drawn (animated between steps). */
  const [hole, setHole] = useState<Rect | null>(null)
  /** Hole the popover is placed against (final position, not animated). */
  const [goalRect, setGoalRect] = useState<Rect | null>(null)
  const [missing, setMissing] = useState(false)
  /** False while the page scrolls to the step: the popover stays hidden. */
  const [ready, setReady] = useState(false)
  const [size, setSize] = useState({ w: 360, h: 200 })
  const paper = useRef<HTMLDivElement>(null)
  const shown = useRef<Rect | null>(null)
  const goal = useRef<Rect | null>(null)
  const anim = useRef<{ frame: number; start: number; from: Rect } | null>(null)
  const el = useRef<HTMLElement | null>(null)
  /** Placeholder where the tour is mounted: hidden once its tab panel is hidden (tab change). */
  const host = useRef<HTMLSpanElement>(null)
  const safeIndex = Math.min(Math.max(index, 0), steps.length - 1)
  const step = steps[safeIndex]
  const last = safeIndex >= steps.length - 1

  useScrollLock(paper)

  const paint = useCallback((r: Rect | null) => {
    shown.current = r
    setHole(r)
  }, [])
  /** Moves the hole to `r`: slides on a step change, follows immediately otherwise. */
  const moveTo = useCallback(
    (r: Rect | null, animate: boolean) => {
      goal.current = r
      setGoalRect(r)
      if (anim.current && r && !animate) return // The running slide reads the new goal.
      if (anim.current) cancelAnimationFrame(anim.current.frame)
      anim.current = null
      if (!animate || !r || !shown.current || reducedMotion()) return paint(r)
      const tick = (now: number) => {
        const a = anim.current
        if (!a || !goal.current) return
        const t = Math.min(1, (now - a.start) / MOVE_MS)
        paint(lerp(a.from, goal.current, ease(t)))
        if (t < 1) a.frame = requestAnimationFrame(tick)
        else anim.current = null
      }
      anim.current = { from: shown.current, start: performance.now(), frame: requestAnimationFrame(tick) }
    },
    [paint],
  )

  // Latest context / reset (a new object every render must not re-run the step).
  const demo = useRef({ context, onReset })
  demo.current = { context, onReset }
  const hasContext = context !== undefined

  // Step change: find the target, scroll it to the centre below the header, then show the popover.
  useEffect(() => {
    let live = true
    let frame = 0
    onStepChange?.(safeIndex)
    setReady(false)
    // Sample state: rebuilt from scratch (reset + steps 1..n), then two frames for the page to render it.
    const ctx = demo.current.context
    if (ctx !== undefined) {
      demo.current.onReset?.()
      for (const s of steps.slice(0, safeIndex + 1)) s.apply?.(ctx)
    }
    const afterRender = new Promise<void>((done) => {
      if (ctx === undefined) return done()
      frame = requestAnimationFrame(() => (frame = requestAnimationFrame(() => done())))
    })
    void afterRender.then(() => {
      if (!live) return
      const found = resolve(step)
      el.current = found.el
      setMissing(found.missing)
      moveTo(measure(found.el), true)
      return scrollToCentre(found.el).then(() => {
        if (!live) return
        moveTo(measure(el.current), false)
        setReady(true)
      })
    })
    return () => {
      live = false
      cancelAnimationFrame(frame)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onStepChange is a notification; context / reset are read from a ref.
  }, [safeIndex, step, moveTo, hasContext])

  // Safety: no popover after SAFETY_MS -> close instead of leaving a dark page.
  const readyRef = useRef(false)
  readyRef.current = ready
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const timer = setTimeout(() => {
      if (readyRef.current) return
      console.warn(`[GuidedTour] step ${safeIndex + 1} ("${step.target}") did not show within ${SAFETY_MS}ms; closing the tour.`)
      closeRef.current(safeIndex, false)
    }, SAFETY_MS)
    return () => clearTimeout(timer)
  }, [safeIndex, step])

  // The tab holding the tour was hidden (tab change): close it, which unlocks the page.
  useEffect(() => {
    const parent = host.current?.parentElement
    if (!parent) return
    const check = () => {
      if (!shownOnPage(parent)) closeRef.current(safeIndex, false)
    }
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(check) : null
    ro?.observe(parent)
    return () => ro?.disconnect()
  }, [safeIndex])

  // Follow the target (rAF): resize, its own size changes and the step's scroll; re-resolve when it disappears.
  useEffect(() => {
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (!el.current || !el.current.isConnected || !isVisible(el.current)) {
          const found = resolve(step)
          el.current = found.el
          setMissing(found.missing)
          if (found.el) ro?.observe(found.el)
        }
        moveTo(measure(el.current), false)
      })
    }
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null
    if (el.current) ro?.observe(el.current)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      cancelAnimationFrame(frame)
      ro?.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [step, moveTo])

  // Popover size, for placement.
  useLayoutEffect(() => {
    const p = paper.current
    if (!p) return
    const read = () => setSize((s) => (s.w === p.offsetWidth && s.h === p.offsetHeight ? s : { w: p.offsetWidth, h: p.offsetHeight }))
    read()
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(read) : null
    ro?.observe(p)
    return () => ro?.disconnect()
  }, [safeIndex, ready])

  // Unmount (close, tab change, StrictMode re-run): stop a running slide.
  useEffect(
    () => () => {
      if (anim.current) cancelAnimationFrame(anim.current.frame)
      anim.current = null
    },
    [],
  )

  /** "Hoàn tất" and "Bỏ qua tour" end the tour (done); the close button / Esc / tab change keep the step for "Xem tiếp". */
  const next = useCallback(() => (last ? onClose(safeIndex, true) : setIndex(safeIndex + 1)), [last, safeIndex, onClose])
  const back = useCallback(() => setIndex(Math.max(0, safeIndex - 1)), [safeIndex])
  const skip = useCallback(() => onClose(safeIndex, true), [safeIndex, onClose])
  const dismiss = useCallback(() => onClose(safeIndex, false), [safeIndex, onClose])

  // Focus the main button once the popover shows (keeps the focus inside it).
  useEffect(() => {
    if (ready) paper.current?.querySelector<HTMLElement>('[data-tour-primary]')?.focus({ preventScroll: true })
  }, [ready, safeIndex])

  // Keys: ← / →, Enter = next (not on another button), Esc = close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const onButton = e.target instanceof HTMLElement && e.target.closest('button') && !e.target.closest('[data-tour-primary]')
      if (e.key === 'Escape') dismiss()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') back()
      else if (e.key === 'Enter' && !onButton) next()
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [next, back, dismiss])

  /** Tab / Shift+Tab cycle inside the popover. */
  const trap = (e: ReactKeyboardEvent) => {
    if (e.key !== 'Tab' || !paper.current) return
    const items = [...paper.current.querySelectorAll<HTMLElement>('button:not([disabled])')]
    if (!items.length) return
    const i = items.indexOf(document.activeElement as HTMLElement)
    const to = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : i === items.length - 1 ? 0 : i + 1
    e.preventDefault()
    items[to].focus()
  }

  const z = theme.zIndex.modal + 10
  const ring = dark ? theme.palette.primary.light : theme.palette.primary.main
  const pos = place(goalRect, size, step.placement)
  const motion = reducedMotion() ? 'none' : 'tourIn 150ms ease-out'
  const flash = ready && context !== undefined && !!step.apply && !reducedMotion()

  return (
    <>
      <Box component="span" ref={host} aria-hidden sx={{ display: 'none' }} />
      {/* Portal: `position: fixed` stays relative to the viewport even under a transformed / filtered ancestor. */}
      <Portal>
      {/* Overlay: blocks the page; a click on the dark area does nothing. */}
      <Box
        aria-hidden
        data-testid="tour-overlay"
        onMouseDown={(e) => e.preventDefault()}
        sx={{ position: 'fixed', inset: 0, zIndex: z }}
      >
        <svg width="100%" height="100%" style={{ display: 'block' }}>
          <defs>
            <mask id={maskId}>
              <rect x={0} y={0} width="100%" height="100%" fill="#fff" />
              {hole && <rect x={hole.left} y={hole.top} width={hole.width} height={hole.height} rx={RADIUS} ry={RADIUS} fill="#000" />}
            </mask>
          </defs>
          <rect x={0} y={0} width="100%" height="100%" fill={`rgba(15,23,42,${dark ? 0.7 : 0.6})`} mask={`url(#${maskId})`} />
        </svg>
      </Box>
      {hole && (
        <Box
          aria-hidden
          sx={{
            position: 'fixed',
            zIndex: z,
            pointerEvents: 'none',
            top: hole.top,
            left: hole.left,
            width: hole.width,
            height: hole.height,
            borderRadius: `${RADIUS}px`,
            border: `2px solid ${ring}`,
            boxShadow: `0 0 0 4px ${alpha(ring, 0.18)}, 0 0 24px 4px ${alpha(ring, 0.35)}`,
          }}
        >
          {/* What the step just changed: a soft 600ms flash once the popover shows. */}
          {flash && (
            <Box
              key={`${safeIndex}-${ready}`}
              sx={{
                position: 'absolute',
                inset: 0,
                borderRadius: 'inherit',
                bgcolor: alpha(ring, 0.22),
                opacity: 0,
                animation: 'tourFlash 600ms ease-out',
                '@keyframes tourFlash': { '0%': { opacity: 0 }, '35%': { opacity: 1 }, '100%': { opacity: 0 } },
              }}
            />
          )}
        </Box>
      )}
      <Paper
        key={`${safeIndex}-${ready}`}
        ref={paper}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onKeyDown={trap}
        elevation={8}
        data-testid="tour-popover"
        sx={{
          position: 'fixed',
          zIndex: z + 1,
          top: pos.top,
          left: pos.left,
          width: { xs: 'calc(100vw - 32px)', sm: 360 },
          maxWidth: 'calc(100vw - 32px)',
          borderRadius: '14px',
          p: 2,
          overflow: 'visible',
          visibility: ready ? 'visible' : 'hidden',
          transformOrigin: pos.side ? { bottom: 'top center', top: 'bottom center', right: 'left center', left: 'right center' }[pos.side] : 'center',
          animation: ready ? motion : 'none',
          '@keyframes tourIn': { from: { opacity: 0, transform: 'scale(0.98)' }, to: { opacity: 1, transform: 'scale(1)' } },
        }}
      >
        {pos.side && (
          <Box
            aria-hidden
            style={arrowStyle(pos.side, pos.arrow)}
            sx={{ position: 'absolute', width: ARROW, height: ARROW, transform: 'rotate(45deg)', bgcolor: 'inherit', backgroundImage: 'inherit', borderRadius: '2px' }}
          />
        )}
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', position: 'relative' }}>
          <Box aria-hidden sx={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', color: 'primary.main', bgcolor: alpha(theme.palette.primary.main, dark ? 0.24 : 0.12) }}>
            <TipsAndUpdatesOutlined sx={{ fontSize: 16 }} />
          </Box>
          <Typography id={titleId} component="h2" sx={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, lineHeight: 1.35 }}>
            {step.title[lang]}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
            {safeIndex + 1}/{steps.length}
          </Typography>
          <IconButton size="small" aria-label={tx.close} onClick={dismiss} sx={{ mr: -0.75 }}>
            <CloseRounded fontSize="small" />
          </IconButton>
        </Stack>
        <Typography id={bodyId} component="div" color="text.secondary" sx={{ mt: 1, fontSize: 14, lineHeight: 1.55, position: 'relative' }}>
          {(context === undefined ? (step.plainBody ?? step.body) : step.body)[lang]}
          {missing && step.whenMissing && (
            <Box component="span" sx={{ display: 'block', mt: 0.75, color: 'info.main', fontSize: 13 }}>
              {step.whenMissing[lang]}
            </Box>
          )}
        </Typography>
        <LinearProgress
          variant="determinate"
          value={((safeIndex + 1) / steps.length) * 100}
          aria-label={tx.progress}
          sx={{ mt: 1.75, height: 4, borderRadius: 2, '& .MuiLinearProgress-bar': { borderRadius: 2 } }}
        />
        <Stack direction="row" spacing={1} sx={{ mt: 1.75, alignItems: 'center', position: 'relative' }}>
          <Link component="button" type="button" underline="hover" color="text.secondary" onClick={skip} sx={{ fontSize: 13 }}>
            {tx.skip}
          </Link>
          <Box sx={{ flex: 1 }} />
          {safeIndex > 0 && <Button size="small" variant="outlined" onClick={back}>{tx.back}</Button>}
          <Button size="small" variant="contained" onClick={next} data-tour-primary>
            {last ? tx.finish : tx.next}
          </Button>
        </Stack>
      </Paper>
      </Portal>
    </>
  )
}

const storageKey = (id: string) => `f2.tour.${id}`
const REQUEST_EVENT = 'f2:tour-request'
const QUERY = 'tour'

/** Stored progress, validated: anything malformed resets to step 0; the step is clamped to [0, total - 1] and is 0 once done. */
function normalize(v: unknown, total: number): TourProgress {
  const raw = (v && typeof v === 'object' ? v : {}) as Partial<Record<keyof TourProgress, unknown>>
  const done = raw.done === true
  const n = typeof raw.step === 'number' && Number.isFinite(raw.step) ? Math.trunc(raw.step) : 0
  return { step: done ? 0 : Math.min(Math.max(n, 0), Math.max(total - 1, 0)), done }
}
function readProgress(id: string, total: number): TourProgress | null {
  try {
    const text = localStorage.getItem(storageKey(id))
    return text === null ? null : normalize(JSON.parse(text), total)
  } catch {
    return { step: 0, done: false } // Unreadable JSON.
  }
}
function writeProgress(id: string, p: TourProgress) {
  try {
    localStorage.setItem(storageKey(id), JSON.stringify(p))
  } catch {
    /* Storage unavailable: progress lives for this page only. */
  }
}

/** Asks the tour `id` to open (from another tab): `?tour=id` for a tab not mounted yet + an event for a mounted one. */
export function requestTour(id: string) {
  try {
    const url = new URL(window.location.href)
    url.searchParams.set(QUERY, id)
    window.history.replaceState(window.history.state, '', url)
  } catch {
    /* URL not writable: the event still reaches a mounted tab. */
  }
  window.dispatchEvent(new CustomEvent(REQUEST_EVENT, { detail: id }))
}
function consumeQuery(id: string) {
  try {
    const url = new URL(window.location.href)
    if (url.searchParams.get(QUERY) !== id) return false
    url.searchParams.delete(QUERY)
    window.history.replaceState(window.history.state, '', url)
    return true
  } catch {
    return false
  }
}

/**
 * Open state + progress (localStorage "f2.tour.<id>") of a tour. `returnFocus`: the button that opens the tour,
 * focused again when it closes.
 */
/** `onRequest`: replaces the direct start for requests from another tab (e.g. to confirm or snapshot first). */
export function useGuidedTour(id: string, total: number, returnFocus?: RefObject<HTMLElement | null>, onRequest?: (at: number) => void) {
  const requestRef = useRef(onRequest)
  requestRef.current = onRequest
  /** `step` > 0 only while the tour is unfinished (for "Xem tiếp từ bước n?"). */
  const [progress, setProgress] = useState<TourProgress | null>(() => readProgress(id, total))
  const [open, setOpen] = useState(false)
  const [startAt, setStartAt] = useState(0)
  const doneRef = useRef(progress?.done ?? false)

  const save = useCallback(
    (p: TourProgress) => {
      const v = normalize(p, total)
      doneRef.current = v.done
      writeProgress(id, v)
      setProgress(v)
    },
    [id, total],
  )
  /** A finished tour always restarts at step 0. */
  const start = useCallback(
    (at = 0) => {
      const n = doneRef.current || !Number.isFinite(at) ? 0 : Math.trunc(at)
      setStartAt(Math.min(Math.max(n, 0), Math.max(total - 1, 0)))
      setOpen(true)
    },
    [total],
  )
  const onStepChange = useCallback((step: number) => save({ step, done: doneRef.current }), [save])
  /** finished ("Hoàn tất" / "Bỏ qua tour"): done, step 0; otherwise (close button, Esc, tab change) the step is kept. */
  const onClose = useCallback(
    (step: number, finished: boolean) => {
      setOpen(false)
      save(finished ? { step: 0, done: true } : { step, done: doneRef.current })
      setTimeout(() => returnFocus?.current?.focus(), 0)
    },
    [save, returnFocus],
  )

  // Requests from another tab (after its navigation has rendered this one).
  useEffect(() => {
    let timer = 0
    let frame = 0
    // The query is consumed only when the tour actually starts (a StrictMode re-run cancels the first schedule).
    const later = () => {
      clearTimeout(timer)
      cancelAnimationFrame(frame)
      timer = window.setTimeout(() => {
        frame = requestAnimationFrame(() => {
          consumeQuery(id)
          ;(requestRef.current ?? start)(0)
        })
      }, 0)
    }
    if (new URLSearchParams(window.location.search).get(QUERY) === id) later()
    const onRequest = (e: Event) => {
      if ((e as CustomEvent<string>).detail === id) later()
    }
    window.addEventListener(REQUEST_EVENT, onRequest)
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(frame)
      window.removeEventListener(REQUEST_EVENT, onRequest)
    }
  }, [id, start])

  return { open, startAt, progress, start, tourProps: { open, startAt, onClose, onStepChange } }
}
