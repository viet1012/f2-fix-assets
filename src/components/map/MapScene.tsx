import { alpha, Box, IconButton, Stack, Tooltip, Typography, type SxProps, type Theme } from '@mui/material'
import AddRounded from '@mui/icons-material/AddRounded'
import FitScreenOutlined from '@mui/icons-material/FitScreenOutlined'
import RemoveRounded from '@mui/icons-material/RemoveRounded'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type SVGProps } from 'react'
import type { Lang } from '../../types/fixedAsset'
import { glassFloating, glassLens, glassRadius, px } from '../../theme/liquidGlass'

export const ZOOM_STEPS = [1, 1.25, 1.5, 2, 2.5, 3]

/** Zoom step and scroll position (0-1 of the scrollable range on each axis); shareable between scenes. */
export interface MapView {
  zoomIndex: number
  scrollX: number
  scrollY: number
}

export const DEFAULT_MAP_VIEW: MapView = { zoomIndex: 0, scrollX: 0, scrollY: 0 }

const scrollFraction = (pos: number, range: number) => (range > 0 ? pos / range : 0)
/** No scroll event for this long = the scroll has stopped (is-scrolling removed, onViewChange reported). */
export const SCROLL_IDLE_MS = 150
/** Base display height of the layout at 100% zoom. */
const BASE_HEIGHT = 600

/** Normalized rotation (0-359) of a scene. */
export function sceneRotation(rotationDeg = 0) {
  return ((rotationDeg % 360) + 360) % 360
}

/** Transform suffix that keeps text upright inside a rotated scene (positions still rotate with it). */
export function uprightTransform(rotationDeg = 0) {
  const rotation = sceneRotation(rotationDeg)
  return rotation ? ` rotate(${-rotation}deg)` : ''
}

const fractionOf = (el: HTMLElement) => ({
  x: scrollFraction(el.scrollLeft, el.scrollWidth - el.clientWidth),
  y: scrollFraction(el.scrollTop, el.scrollHeight - el.clientHeight),
})

/** Scrolls `el` to a fraction of its range; true when it actually moved (by 1px or more). */
export function applyScrollFraction(el: HTMLElement, f: { x: number; y: number }): boolean {
  const left = Math.round(f.x * (el.scrollWidth - el.clientWidth))
  const top = Math.round(f.y * (el.scrollHeight - el.clientHeight))
  let moved = false
  if (Math.abs(el.scrollLeft - left) >= 1) {
    el.scrollLeft = left
    moved = true
  }
  if (Math.abs(el.scrollTop - top) >= 1) {
    el.scrollTop = top
    moved = true
  }
  return moved
}

/**
 * Scroll sync between scenes without React state: each scene registers its viewport; a user scroll on one is copied
 * (as a fraction of the scrollable range, in the next animation frame) to the others. Positions set by the group are
 * flagged, so the scroll events they cause are not echoed back (no A <-> B loop).
 */
export interface ScrollSyncGroup {
  register: (el: HTMLElement) => () => void
  /** A user scroll on `el`: copy its position to the other members (next frame). */
  scrolled: (el: HTMLElement) => void
  /** Marks `el`'s next scroll event as set by the program (to be ignored). */
  markProgrammatic: (el: HTMLElement) => void
  /** True (once) when `el`'s scroll event comes from a position set by the program. */
  consumeProgrammatic: (el: HTMLElement) => boolean
}

export function createScrollSync(): ScrollSyncGroup {
  const members = new Set<HTMLElement>()
  const programmatic = new WeakSet<HTMLElement>()
  let frame = 0
  let source: HTMLElement | null = null
  const flush = () => {
    frame = 0
    const from = source
    source = null
    if (!from || !members.has(from)) return
    const f = fractionOf(from)
    for (const el of members) if (el !== from && applyScrollFraction(el, f)) programmatic.add(el)
  }
  return {
    register(el) {
      members.add(el)
      return () => {
        members.delete(el)
      }
    },
    scrolled(el) {
      source = el
      if (!frame) frame = requestAnimationFrame(flush)
    },
    markProgrammatic(el) {
      programmatic.add(el)
    },
    consumeProgrammatic(el) {
      if (!programmatic.has(el)) return false
      programmatic.delete(el)
      return true
    },
  }
}

interface Props {
  lang: Lang
  title: string
  imageData: string
  imgW: number
  imgH: number
  /** Optional whole-scene rotation (image + SVG + overlays together), e.g. 90 for a floor drawn sideways. */
  rotationDeg?: number
  /** Extra styles on the scene box (the unit that rotates); target children with class selectors. */
  sceneSx?: SxProps<Theme>
  /** Content of the SVG layer: viewBox 0-100 stretched over the image = the overlays' % coordinate space. */
  svg?: ReactNode
  svgProps?: SVGProps<SVGSVGElement>
  /** HTML overlays positioned in % of the scene box, drawn above the SVG layer. */
  children?: ReactNode
  /** Content pinned to the (unrotated) viewport, next to the zoom controls. */
  overlay?: ReactNode
  /**
   * "width" (default): fill the width up to a 600px-high image. "contain": fit the whole image inside the viewport,
   * so scenes in frames of the same size are displayed the same way whatever the image ratio.
   */
  fit?: 'width' | 'contain'
  /**
   * Controlled zoom + initial scroll (e.g. shared by two scenes); uncontrolled when omitted. Only the zoom is React
   * state: `scrollX/Y` is applied on mount, then the live scroll position stays in the DOM.
   */
  view?: MapView
  /** Called when the zoom changes and once a scroll has stopped (SCROLL_IDLE_MS); never per scroll event. */
  onViewChange?: (view: MapView) => void
  /** Live scroll sync with other scenes (createScrollSync). */
  scrollSync?: ScrollSyncGroup
  /** Rendered width in px of the (unrotated) scene box, reported on resize (changes of 1px or more only). */
  onSceneWidth?: (width: number) => void
}

/**
 * Layout frame for a quarter-turn (90/270deg) scene: reserves the rotated footprint (imgH x imgW) so the
 * scroll viewport, centring and zoom see the visual size. For 0/180deg the scene is laid out directly.
 */
function RotationFrame({ quarterTurn, width, imgW, imgH, children }: { quarterTurn: boolean; width: string; imgW: number; imgH: number; children: ReactNode }) {
  if (!quarterTurn) return <>{children}</>
  return <Box sx={{ position: 'relative', m: 'auto', flexShrink: 0, width, aspectRatio: `${imgH} / ${imgW}` }}>{children}</Box>
}

/** Zoomable, optionally rotated layout image with an SVG layer (viewBox 0-100) and HTML overlays on top. */
export function MapScene({ lang, title, imageData, imgW, imgH, rotationDeg = 0, sceneSx, svg, svgProps, children, overlay, fit = 'width', view: viewProp, onViewChange, scrollSync, onSceneWidth }: Props) {
  const vi = lang === 'vi'
  const [localZoom, setLocalZoom] = useState(viewProp?.zoomIndex ?? DEFAULT_MAP_VIEW.zoomIndex)
  const zoomIndex = viewProp ? viewProp.zoomIndex : localZoom
  const zoom = ZOOM_STEPS[zoomIndex]
  const rootRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<HTMLDivElement>(null)
  /** Live scroll fraction (0-1 per axis), kept across zoom changes; seeded from the controlled view on mount. */
  const fraction = useRef({ x: viewProp?.scrollX ?? 0, y: viewProp?.scrollY ?? 0 })
  /** Latest zoom / callback for the (stable) scroll listener. */
  const latest = useRef({ zoomIndex, onViewChange })
  latest.current = { zoomIndex, onViewChange }

  const setZoomIndex = (update: (i: number) => number) => {
    const next = update(zoomIndex)
    if (next === zoomIndex) return
    if (!viewProp) setLocalZoom(next)
    onViewChange?.({ zoomIndex: next, scrollX: fraction.current.x, scrollY: fraction.current.y })
  }

  // Mount and zoom change: back to the remembered fraction before paint (no jump, not echoed to the sync group).
  useLayoutEffect(() => {
    const el = viewportRef.current
    if (el && applyScrollFraction(el, fraction.current)) scrollSync?.markProgrammatic(el)
  }, [zoomIndex, scrollSync])

  // Scroll: a passive native listener, no React state. Sync partner, "is-scrolling" class, report once stopped.
  useEffect(() => {
    const el = viewportRef.current
    const root = rootRef.current
    if (!el || !root) return
    const unregister = scrollSync?.register(el)
    let idle = 0
    const onScroll = () => {
      fraction.current = fractionOf(el)
      root.classList.add('is-scrolling')
      window.clearTimeout(idle)
      idle = window.setTimeout(() => {
        root.classList.remove('is-scrolling')
        const { zoomIndex: z, onViewChange: report } = latest.current
        report?.({ zoomIndex: z, scrollX: fraction.current.x, scrollY: fraction.current.y })
      }, SCROLL_IDLE_MS)
      if (scrollSync && !scrollSync.consumeProgrammatic(el)) scrollSync.scrolled(el)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      window.clearTimeout(idle)
      root.classList.remove('is-scrolling')
      unregister?.()
    }
  }, [scrollSync])

  const sceneWidthCb = useRef(onSceneWidth)
  sceneWidthCb.current = onSceneWidth
  const reportsWidth = onSceneWidth !== undefined
  useEffect(() => {
    const el = sceneRef.current
    if (!el || !reportsWidth) return
    let last = Number.NaN
    const report = (w: number) => {
      if (Math.abs(w - last) < 1) return
      last = w
      sceneWidthCb.current?.(w)
    }
    report(el.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => report(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [reportsWidth])
  const ratio = imgW / imgH
  const rotation = sceneRotation(rotationDeg)
  const quarterTurn = rotation === 90 || rotation === 270
  /** Width/height of what the user sees (a quarter turn swaps the image's sides). */
  const visualRatio = quarterTurn ? imgH / imgW : ratio
  // contain: container query units of the viewport (its content box), so the whole image fits at 100%.
  const sceneWidth = fit === 'contain' ? `calc(min(100cqw, 100cqh * ${visualRatio}) * ${zoom})` : `calc(min(100%, ${BASE_HEIGHT * visualRatio}px) * ${zoom})`
  const extraSx = sceneSx === undefined ? [] : Array.isArray(sceneSx) ? sceneSx : [sceneSx]

  return (
    <Box
      ref={rootRef}
      className="map-scene-root"
      sx={(theme) => ({
        position: 'relative',
        height: '100%',
        minHeight: fit === 'contain' ? 0 : 420,
        display: 'flex',
        flexDirection: 'column',
        // While scrolling: decorative animations pause and the floating zoom bar drops its backdrop blur (solid).
        '&.is-scrolling *': { animationPlayState: 'paused !important' },
        '&.is-scrolling .map-zoom-bar': { backdropFilter: 'none', WebkitBackdropFilter: 'none', bgcolor: theme.palette.background.paper },
      })}
    >
      {overlay}
      {/* Zoom controls */}
      <Stack
        direction="row"
        className="map-zoom-bar"
        sx={(theme) => ({
          ...glassFloating(theme, glassRadius.capsule),
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 3,
          p: '2px',
          alignItems: 'center',
          '& .MuiIconButton-root': { borderRadius: px(glassRadius.capsule), '&:hover': glassLens(theme) },
        })}
      >
        <Tooltip title={vi ? 'Thu nhỏ' : 'Zoom out'}>
          <span>
            <IconButton size="small" aria-label={vi ? 'Thu nhỏ' : 'Zoom out'} disabled={zoomIndex === 0} onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}>
              <RemoveRounded fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Typography variant="caption" sx={{ alignSelf: 'center', minWidth: 40, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }} aria-live="polite">
          {Math.round(zoom * 100)}%
        </Typography>
        <Tooltip title={vi ? 'Phóng to' : 'Zoom in'}>
          <span>
            <IconButton size="small" aria-label={vi ? 'Phóng to' : 'Zoom in'} disabled={zoomIndex === ZOOM_STEPS.length - 1} onClick={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}>
              <AddRounded fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={vi ? 'Vừa khung' : 'Fit to view'}>
          <span>
            <IconButton size="small" aria-label={vi ? 'Vừa khung' : 'Fit to view'} disabled={zoomIndex === 0} onClick={() => setZoomIndex(() => 0)}>
              <FitScreenOutlined fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      {/* Scroll viewport */}
      <Box
        ref={viewportRef}
        data-testid="map-viewport"
        sx={(theme) => ({
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          // Repaints while scrolling stay inside the viewport (it already clips its content).
          contain: 'paint',
          ...(fit === 'contain' ? { containerType: 'size' } : {}),
          p: 2,
          display: 'flex',
          bgcolor: theme.palette.mode === 'dark' ? alpha('#ffffff', 0.03) : '#f8fafc',
          backgroundImage: `radial-gradient(${theme.palette.divider} 1px, transparent 1px)`,
          backgroundSize: '16px 16px',
        })}
      >
        {/* Image box = the scene: image, SVG layer and overlays share its % coordinate space (always the image
            aspect ratio). When the floor has rotationDeg, this whole box is rotated as one unit. */}
        <RotationFrame quarterTurn={quarterTurn} width={sceneWidth} imgW={imgW} imgH={imgH}>
          <Box
            ref={sceneRef}
            className="map-scene"
            sx={[
              {
                ...(quarterTurn
                  ? {
                      // Unrotated size = frame height x frame width; centred in the frame, then turned.
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      width: `${(100 * imgW) / imgH}%`,
                      transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                    }
                  : {
                      position: 'relative',
                      m: 'auto',
                      flexShrink: 0,
                      width: sceneWidth,
                      ...(rotation ? { transform: `rotate(${rotation}deg)` } : {}),
                    }),
                transformOrigin: 'center center',
                // Own compositing layer: scrolling moves it instead of repainting the drawing + SVG.
                willChange: 'transform',
                aspectRatio: `${imgW} / ${imgH}`,
                bgcolor: '#ffffff',
                borderRadius: 1,
                boxShadow: 1,
                '& .map-scene-svg': { position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' },
              },
              ...extraSx,
            ]}
          >
            <Box
              component="img"
              src={imageData}
              alt={title}
              draggable={false}
              sx={{ display: 'block', width: '100%', height: '100%', borderRadius: 1, userSelect: 'none' }}
            />
            {svg !== undefined && (
              <svg {...svgProps} className={['map-scene-svg', svgProps?.className].filter(Boolean).join(' ')} viewBox="0 0 100 100" preserveAspectRatio="none">
                {svg}
              </svg>
            )}
            {children}
          </Box>
        </RotationFrame>
      </Box>
    </Box>
  )
}
