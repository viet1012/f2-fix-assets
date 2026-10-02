import { alpha, Box, lighten, useMediaQuery, useTheme } from '@mui/material'
import { useEffect, useId, useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react'
import { FLOORS, type LayoutId, type MapArea } from '../../data/mapData'
import { zonePalette } from '../../theme/palette'

/** Autoplay interval per tab (ms); the crossfade and image fade-in durations. */
const AUTOPLAY_MS = 6000
const FADE_MS = 400
const IMAGE_FADE_MS = 300
/** Soft blur on the drawing (off: the grayscale + low opacity is enough to push it back). */
const BLUR_DRAWING = false
/** Zone code chip font size in screen pixels (independent of how large the SVG is drawn). */
const CHIP_FONT_PX = 11.5
/** Inner padding of the drawing stage (px). */
const STAGE_PAD = 12
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'

/** Light mode card colours (fixed: it frames a light drawing). Dark mode uses the theme (blueprint look, see cardColors). */
const CARD = { bg: '#f8fafc', border: '#e2e8f0', text: '#0f172a', muted: '#64748b', dot: '#cbd5e1', accent: '#2563eb' } as const

type Floor = (typeof FLOORS)[number]

const TABS: ReadonlyArray<{ id: LayoutId; label: string }> = [
  { id: 'floor1', label: 'Press' },
  { id: 'floor4', label: 'Mold' },
  { id: 'floor2', label: 'Guide' },
]
const TAB_FLOORS: readonly Floor[] = TABS.map((t) => FLOORS.find((f) => f.id === t.id)!)

const majorOf = (code: string) => code.split('-')[0]

function bounds(area: MapArea) {
  const xs = area.points.map((p) => p.x)
  const ys = area.points.map((p) => p.y)
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) }
}

/**
 * One floor drawing with its zone outlines, fitted (meet) into its box. Geometry is image-% -> image px;
 * a 90deg floor is turned as one group, and the zone code chips are placed after the turn so they stay upright.
 */
/** Dark mode drawing: inverted to light lines on navy (blueprint) instead of grey. */
export const BLUEPRINT_FILTER = 'invert(1) hue-rotate(180deg) brightness(.9)'
const BLUEPRINT_BG = '#0f172a'

function LayoutSvg({ floor, showImage, chipFontUnits, dark }: { floor: Floor; showImage: boolean; chipFontUnits: number; dark: boolean }) {
  const [loaded, setLoaded] = useState(false)
  const { imgW, imgH } = floor
  const rotated = ('rotationDeg' in floor ? floor.rotationDeg : 0) === 90
  const vbW = rotated ? imgH : imgW
  const vbH = rotated ? imgW : imgH
  const px = (p: { x: number; y: number }) => ({ x: (p.x / 100) * imgW, y: (p.y / 100) * imgH })
  /** Image px -> viewBox px (after the optional 90deg clockwise turn). */
  const toView = (p: { x: number; y: number }) => (rotated ? { x: imgH - p.y, y: p.x } : p)
  const colorOf = new Map(floor.areas.map((a, i) => [a.code, zonePalette[i % zonePalette.length]]))
  const color = (code: string) => colorOf.get(code) ?? colorOf.get(majorOf(code)) ?? CARD.muted

  const chips = floor.areas.map((a) => {
    const b = bounds(a)
    const c = toView(px({ x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 }))
    const fs = chipFontUnits
    const w = a.code.length * fs * 0.64 + fs * 0.9
    const h = fs * 1.55
    return { code: a.code, x: c.x - w / 2, y: c.y - h / 2, w, h, fs, color: color(a.code) }
  })

  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} preserveAspectRatio="xMidYMid meet" width="100%" height="100%" style={{ display: 'block' }}>
      <g transform={rotated ? `translate(${imgH},0) rotate(90)` : undefined}>
        {showImage && (
          <image
            href={floor.imageData}
            x={0}
            y={0}
            width={imgW}
            height={imgH}
            preserveAspectRatio="none"
            onLoad={() => setLoaded(true)}
            style={{
              opacity: loaded ? 0.55 : 0,
              filter: `${dark ? BLUEPRINT_FILTER : 'grayscale(1)'}${BLUR_DRAWING ? ' blur(0.6px)' : ''}`,
              transition: `opacity ${IMAGE_FADE_MS}ms ease`,
            }}
          />
        )}
        {floor.subAreas.map((s) => {
          const b = bounds(s)
          const tl = px({ x: b.left, y: b.top })
          const br = px({ x: b.right, y: b.bottom })
          const c = color(s.code)
          return <rect key={s.code} x={tl.x} y={tl.y} width={br.x - tl.x} height={br.y - tl.y} fill={c} fillOpacity={0.05} stroke={dark ? lighten(c, 0.2) : c} strokeOpacity={0.45} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        })}
        {floor.areas.map((a) => {
          const c = color(a.code)
          const points = a.points.map((p) => px(p)).map((p) => `${p.x},${p.y}`).join(' ')
          return <polygon key={a.code} points={points} fill={c} fillOpacity={dark ? 0.12 : 0.08} stroke={dark ? lighten(c, 0.2) : c} strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        })}
      </g>
      {chips.map((c) => (
        <g key={c.code}>
          <rect x={c.x} y={c.y} width={c.w} height={c.h} rx={c.h * 0.3} fill={dark ? c.color : '#ffffff'} fillOpacity={0.92} stroke={dark ? lighten(c.color, 0.2) : c.color} strokeOpacity={0.55} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <text x={c.x + c.w / 2} y={c.y + c.h / 2} dy="0.35em" textAnchor="middle" fontSize={c.fs} fontWeight={700} fill={dark ? '#ffffff' : c.color} style={{ fontFamily: 'inherit', letterSpacing: '0.02em' }}>
            {c.code}
          </text>
        </g>
      ))}
    </svg>
  )
}

/**
 * Login page product preview: the Factory 2 floor drawings cycling Press -> Mold -> Guide.
 * Decorative but operable: tabs are real tabs; autoplay pauses on hover / focus / hidden document and is off under reduced motion.
 */
export function LoginLayoutPreview({ vi }: { vi: boolean }) {
  const reduced = useMediaQuery(REDUCED_QUERY, { noSsr: true })
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  /** Card colours: fixed light card in light mode; theme surfaces + dark top bar + navy stage in dark mode. */
  const card = dark
    ? { bg: theme.palette.background.paper, border: theme.palette.divider, bar: alpha('#000000', 0.28), text: theme.palette.text.primary, muted: theme.palette.text.secondary, dot: alpha('#ffffff', 0.22), accent: theme.palette.primary.main, stage: BLUEPRINT_BG }
    : { ...CARD, bar: 'transparent', stage: CARD.bg }
  const baseId = useId()
  const [active, setActive] = useState(0)
  const [prev, setPrev] = useState<number | null>(null)
  /** Bumped on a manual tab click so the timer (and progress bar) restart even for the same tab. */
  const [cycle, setCycle] = useState(0)
  const [hover, setHover] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden)
  const paused = hover || focusWithin || hidden
  const autoplay = !reduced

  const go = (next: number) => {
    if (next !== active && !reduced) setPrev(active)
    setActive(next)
  }

  useEffect(() => {
    const onVis = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // Reduced motion: static Press view.
  useEffect(() => {
    if (reduced) {
      setActive(0)
      setPrev(null)
    }
  }, [reduced])

  // Autoplay: keeps the remaining time across pauses; a new tab / manual click starts a full interval.
  const remaining = useRef({ key: '', ms: AUTOPLAY_MS })
  useEffect(() => {
    if (!autoplay || paused) return
    const key = `${active}:${cycle}`
    if (remaining.current.key !== key) remaining.current = { key, ms: AUTOPLAY_MS }
    const started = performance.now()
    const timer = window.setTimeout(() => go((active + 1) % TABS.length), remaining.current.ms)
    return () => {
      window.clearTimeout(timer)
      remaining.current.ms = Math.max(0, remaining.current.ms - (performance.now() - started))
    }
  }, [active, cycle, paused, autoplay])

  // Drop the outgoing layer once its crossfade is over.
  useEffect(() => {
    if (prev === null) return
    const timer = window.setTimeout(() => setPrev(null), FADE_MS)
    return () => window.clearTimeout(timer)
  }, [prev])

  // Chip font in viewBox units so it renders at ~CHIP_FONT_PX on screen (the SVG fits "meet" into the stage).
  const stageRef = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => setStage({ w: el.clientWidth - STAGE_PAD * 2, h: el.clientHeight - STAGE_PAD * 2 })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const chipFontFor = (f: Floor) => {
    const rotated = ('rotationDeg' in f ? f.rotationDeg : 0) === 90
    const vbW = rotated ? f.imgH : f.imgW
    const vbH = rotated ? f.imgW : f.imgH
    const scale = stage.w > 0 && stage.h > 0 ? Math.min(stage.w / vbW, stage.h / vbH) : 480 / vbW
    return CHIP_FONT_PX / scale
  }

  const select = (i: number) => {
    go(i)
    setCycle((c) => c + 1)
  }
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const moves: Record<string, number> = { ArrowRight: (i + 1) % TABS.length, ArrowLeft: (i - 1 + TABS.length) % TABS.length, Home: 0, End: TABS.length - 1 }
    const to = moves[e.key]
    if (to === undefined) return
    e.preventDefault()
    select(to)
    tabRefs.current[to]?.focus()
  }
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusWithin(false)
  }

  const next = (active + 1) % TABS.length
  const mounted = (i: number) => i === active || i === prev || (autoplay && i === next)
  const tabId = (i: number) => `${baseId}-tab-${i}`
  const panelId = `${baseId}-panel`

  return (
    <Box
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocusWithin(true)}
      onBlur={onBlur}
      sx={{
        width: '100%',
        maxWidth: 520,
        bgcolor: card.bg,
        color: card.text,
        borderRadius: '12px',
        border: `1px solid ${card.border}`,
        boxShadow: (theme) =>
          theme.palette.mode === 'dark'
            ? `0 1px 0 ${alpha('#ffffff', 0.5)} inset, 0 20px 40px -24px ${alpha('#000000', 0.8)}`
            : `0 1px 2px ${alpha('#0f172a', 0.05)}, 0 18px 36px -24px ${alpha('#0f172a', 0.3)}`,
        overflow: 'hidden',
        '@keyframes f2PreviewProgress': { from: { transform: 'scaleX(0)' }, to: { transform: 'scaleX(1)' } },
      }}
    >
      {/* Window bar: dots, title, tabs. */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1.75, height: 40, bgcolor: card.bar, borderBottom: `1px solid ${card.border}` }}>
        <Box aria-hidden sx={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          {[0, 1, 2].map((i) => (
            <Box key={i} sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: card.dot }} />
          ))}
        </Box>
        <Box component="span" sx={{ fontSize: 12, fontWeight: 600, color: card.muted, letterSpacing: '0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
          Factory 2 · 1F
        </Box>
        <Box role="tablist" aria-label={vi ? 'Bản vẽ mặt bằng' : 'Floor layouts'} sx={{ ml: 'auto', display: 'flex', alignSelf: 'stretch', flexShrink: 0 }}>
          {TABS.map((t, i) => {
            const selected = i === active
            return (
              <Box
                key={t.id}
                component="button"
                type="button"
                role="tab"
                id={tabId(i)}
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                ref={(el: HTMLButtonElement | null) => {
                  tabRefs.current[i] = el
                }}
                onClick={() => select(i)}
                onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => onTabKey(e, i)}
                sx={{
                  position: 'relative',
                  appearance: 'none',
                  border: 0,
                  bgcolor: 'transparent',
                  cursor: 'pointer',
                  px: 1.25,
                  font: 'inherit',
                  fontSize: 12,
                  fontWeight: selected ? 700 : 500,
                  color: selected ? card.text : card.muted,
                  transition: 'color 160ms ease',
                  '&:hover': { color: card.text },
                  '&:focus-visible': { outline: `2px solid ${card.accent}`, outlineOffset: -4, borderRadius: '6px' },
                }}
              >
                {t.label}
                {selected && (
                  <Box aria-hidden sx={{ position: 'absolute', left: 8, right: 8, bottom: 0, height: 2, borderRadius: '2px', bgcolor: alpha(card.accent, autoplay ? 0.18 : 1), overflow: 'hidden' }}>
                    {autoplay && (
                      <Box
                        key={`${active}:${cycle}`}
                        sx={{
                          height: '100%',
                          bgcolor: card.accent,
                          transformOrigin: 'left center',
                          animation: `f2PreviewProgress ${AUTOPLAY_MS}ms linear both`,
                          animationPlayState: paused ? 'paused' : 'running',
                        }}
                      />
                    )}
                  </Box>
                )}
              </Box>
            )
          })}
        </Box>
      </Box>

      {/* Drawing stage: fixed aspect ratio, layers crossfade. */}
      <Box
        ref={stageRef}
        role="tabpanel"
        id={panelId}
        aria-labelledby={tabId(active)}
        sx={{ position: 'relative', aspectRatio: '1.71', width: '100%', bgcolor: card.stage }}
      >
        {TAB_FLOORS.map((f, i) =>
          mounted(i) ? (
            <Box
              key={f.id}
              aria-hidden={i !== active}
              sx={{
                position: 'absolute',
                inset: 0,
                p: `${STAGE_PAD}px`,
                opacity: i === active ? 1 : 0,
                transition: reduced ? 'none' : `opacity ${FADE_MS}ms ease`,
                pointerEvents: 'none',
              }}
            >
              <LayoutSvg floor={f} showImage chipFontUnits={chipFontFor(f)} dark={dark} />
            </Box>
          ) : null,
        )}
      </Box>
    </Box>
  )
}
