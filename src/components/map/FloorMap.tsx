import { alpha, Box, ButtonBase, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import AddRounded from '@mui/icons-material/AddRounded'
import FitScreenOutlined from '@mui/icons-material/FitScreenOutlined'
import RemoveRounded from '@mui/icons-material/RemoveRounded'
import { Fragment, useState, type ReactNode } from 'react'
import type { MapArea } from '../../data/mapData'
import type { Lang } from '../../types/fixedAsset'
import { glassFloating, glassLens, glassRadius, px } from '../../theme/liquidGlass'

export interface MapZone {
  code: string
  x: number
  y: number
  count: number
}

interface Props {
  lang: Lang
  title: string
  imageData: string
  imgW: number
  imgH: number
  zones: MapZone[]
  /** Optional visual area boundaries (same % space as zones); drawn under the markers. */
  areas?: readonly MapArea[]
  /** Optional whole-scene rotation (image + areas + markers together), e.g. 90 for a floor drawn sideways. */
  rotationDeg?: number
  selectedZone: string
  onSelectZone: (code: string) => void
}

const ZOOM_STEPS = [1, 1.25, 1.5, 2, 2.5, 3]
/** Base display height of the layout at 100% zoom. */
const BASE_HEIGHT = 600
const AREA_BLUE = '#2563eb'
const NO_AREAS: readonly MapArea[] = []
/** TEMPORARY: visual debug for area boundaries (stronger outlines + A1..A11 labels). Set to false for production. */
const SHOW_AREA_DEBUG = false
const MARKER_BLUE = '#1d4ed8'
/** Selection accent (areas + markers): stronger blue, not the error red. */
const SELECT_BLUE = '#1d4ed8'
/**
 * Render-only pixel nudges for badges that visually collide at 100% zoom. Stored zone x/y are unchanged.
 * A3-2 sits just left of/below A3 and right of A2-1; left + down clears both (measured at 1920 and 1366 widths).
 * A16-2 sits just below-left of A16 (Factory B); they overlap at 1366 only, a small drop clears it.
 */
const MARKER_OFFSETS: Record<string, { x: number; y: number }> = {
  'A3-2': { x: -14, y: 6 },
  'A16-2': { x: 0, y: 6 },
}
const NO_OFFSET = { x: 0, y: 0 }

/** Mean of the polygon points (the exact centre for the current 4-point rectangles). */
function areaCenter(area: MapArea) {
  const n = area.points.length
  return {
    x: area.points.reduce((s, p) => s + p.x, 0) / n,
    y: area.points.reduce((s, p) => s + p.y, 0) / n,
  }
}

/**
 * Layout frame for a quarter-turn (90/270deg) scene: reserves the rotated footprint (imgH x imgW) so the
 * scroll viewport, centring and zoom see the visual size. For 0/180deg the scene is laid out directly.
 */
function RotationFrame({ quarterTurn, width, imgW, imgH, children }: { quarterTurn: boolean; width: string; imgW: number; imgH: number; children: ReactNode }) {
  if (!quarterTurn) return <>{children}</>
  return <Box sx={{ position: 'relative', m: 'auto', flexShrink: 0, width, aspectRatio: `${imgH} / ${imgW}` }}>{children}</Box>
}

/** An area is highlighted when it, or one of its child zones (A1 -> A1-1, A1-2), is selected. */
function isAreaSelected(area: MapArea, selectedZone: string) {
  return selectedZone === area.code || selectedZone.startsWith(`${area.code}-`)
}

export function FloorMap({ lang, title, imageData, imgW, imgH, zones, areas = NO_AREAS, rotationDeg = 0, selectedZone, onSelectZone }: Props) {
  const vi = lang === 'vi'
  const [zoomIndex, setZoomIndex] = useState(0)
  const zoom = ZOOM_STEPS[zoomIndex]
  const ratio = imgW / imgH
  const rotation = ((rotationDeg % 360) + 360) % 360
  const quarterTurn = rotation === 90 || rotation === 270
  /** Width/height of what the user sees (a quarter turn swaps the image's sides). */
  const visualRatio = quarterTurn ? imgH / imgW : ratio
  const sceneWidth = `calc(min(100%, ${BASE_HEIGHT * visualRatio}px) * ${zoom})`
  /** Keeps badge/label text upright inside a rotated scene (their positions still rotate with it). */
  const uprightText = rotation ? ` rotate(${-rotation}deg)` : ''
  const hasSelection = selectedZone !== ''
  /** Major area of the current selection: 'A1' for both 'A1' and 'A1-1'; '' when nothing is selected. */
  const parentCode = hasSelection ? selectedZone.split('-')[0] : ''

  return (
    <Box sx={{ position: 'relative', height: '100%', minHeight: 420, display: 'flex', flexDirection: 'column' }}>
      {/* Zoom controls */}
      <Stack
        direction="row"
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
            <IconButton size="small" aria-label={vi ? 'Vừa khung' : 'Fit to view'} disabled={zoomIndex === 0} onClick={() => setZoomIndex(0)}>
              <FitScreenOutlined fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      {/* Scroll viewport */}
      <Box
        sx={(theme) => ({
          flex: 1,
          overflow: 'auto',
          p: 2,
          display: 'flex',
          bgcolor: theme.palette.mode === 'dark' ? alpha('#ffffff', 0.03) : '#f8fafc',
          backgroundImage: `radial-gradient(${theme.palette.divider} 1px, transparent 1px)`,
          backgroundSize: '16px 16px',
        })}
      >
        {/* Image box = the scene: image, area SVG and markers share its % coordinate space (always the image
            aspect ratio). When the floor has rotationDeg, this whole box is rotated as one unit. */}
        <RotationFrame quarterTurn={quarterTurn} width={sceneWidth} imgW={imgW} imgH={imgH}>
        <Box
          sx={{
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
            aspectRatio: `${imgW} / ${imgH}`,
            bgcolor: '#ffffff',
            borderRadius: 1,
            boxShadow: 1,
            // Area layer: viewBox 0-100 stretched over the image box = the markers' % coordinate space.
            '& .map-areas': { position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' },
            // All areas keep a faint outline for spatial context (with or without a selection);
            // the selected zone's parent area is drawn strongly on top (see `data-selected` below).
            '& .map-areas polygon': {
              pointerEvents: 'visiblePainted',
              cursor: 'pointer',
              fill: alpha(AREA_BLUE, 0.018),
              stroke: AREA_BLUE,
              strokeOpacity: 0.72,
              strokeWidth: 1.8,
              strokeLinejoin: 'round',
              vectorEffect: 'non-scaling-stroke',
              transition: 'fill .15s, stroke-opacity .15s, stroke .15s, stroke-width .15s',
            },
            '& .map-areas polygon:hover': { strokeOpacity: 0.9, fill: alpha(AREA_BLUE, 0.04) },
            // Debug overrides (only when SHOW_AREA_DEBUG adds the class); declared before `selected` so selection still wins.
            '& .map-areas.area-debug polygon': { fill: alpha(AREA_BLUE, 0.08), strokeOpacity: 0.9, strokeWidth: 2 },
            '& .map-areas.area-debug polygon:hover': { fill: alpha(AREA_BLUE, 0.13) },
            '& .area-debug-label': {
              position: 'absolute',
              // Centred on the area, nudged up so the count marker near the centre does not cover it.
              transform: `translate(-50%, calc(-50% - 22px))${uprightText}`,
              px: 0.5,
              borderRadius: 0.5,
              fontSize: 10,
              fontWeight: 700,
              lineHeight: '16px',
              color: '#1d4ed8',
              bgcolor: 'rgba(255,255,255,0.85)',
              border: `1px solid ${alpha(AREA_BLUE, 0.5)}`,
              pointerEvents: 'none',
              userSelect: 'none',
              whiteSpace: 'nowrap',
            },
            // Soft halo drawn just under the selected outline (a wide translucent stroke; works in every browser).
            '& .map-areas polygon.area-glow': { pointerEvents: 'none', fill: 'none', stroke: AREA_BLUE, strokeOpacity: 0.18, strokeWidth: 7, transition: 'none' },
            '& .map-areas polygon[data-selected="true"]': { fill: alpha(AREA_BLUE, 0.14), stroke: SELECT_BLUE, strokeOpacity: 1, strokeWidth: 3.2 },
          }}
        >
          <Box
            component="img"
            src={imageData}
            alt={title}
            draggable={false}
            sx={{ display: 'block', width: '100%', height: '100%', borderRadius: 1, userSelect: 'none' }}
          />
          {areas.length > 0 && (
            // Mouse shortcut only; the markers above remain the keyboard-accessible way to select a zone.
            <svg
              className={SHOW_AREA_DEBUG ? 'map-areas area-debug' : 'map-areas'}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
              focusable="false"
            >
              {/* SVG paints in DOM order: non-selected first, selected area (and its halo) last = on top. */}
              {[...areas.filter((a) => !isAreaSelected(a, selectedZone)), ...areas.filter((a) => isAreaSelected(a, selectedZone))].map((a) => {
                const selected = isAreaSelected(a, selectedZone)
                const points = a.points.map((p) => `${p.x},${p.y}`).join(' ')
                return (
                  <Fragment key={a.code}>
                    {selected && <polygon className="area-glow" points={points} />}
                    <polygon points={points} data-selected={selected} onClick={() => onSelectZone(a.code)}>
                      <title>{a.code}</title>
                    </polygon>
                  </Fragment>
                )
              })}
            </svg>
          )}
          {/* Debug labels: part of the area layer (before the markers, so markers stay on top); not interactive. */}
          {SHOW_AREA_DEBUG && areas.map((a) => {
            const c = areaCenter(a)
            return <Box key={`label-${a.code}`} className="area-debug-label" aria-hidden sx={{ left: `${c.x}%`, top: `${c.y}%` }}>{a.code}</Box>
          })}
          {zones.map((z) => {
            const active = selectedZone === z.code
            const empty = z.count === 0
            const major = !z.code.includes('-')
            // Related = the selected zone's parent area and all of its child zones (includes siblings).
            const related = hasSelection && !active && (z.code === parentCode || z.code.startsWith(`${parentCode}-`))
            const dimmed = hasSelection && !active && !related
            const offset = MARKER_OFFSETS[z.code] ?? NO_OFFSET
            // Inner badge transform: centre on the anchor, keep text upright in a rotated scene, then scale.
            // All of these act around the badge centre, so the badge never leaves its anchor point.
            const badge = (scale: number) => `translate(-50%, -50%)${uprightText} scale(${scale})`
            return (
              <Tooltip key={z.code} title={`${z.code} · ${z.count.toLocaleString()} ${vi ? 'tài sản' : 'assets'}`} placement="top">
                <ButtonBase
                  disableRipple
                  onClick={() => onSelectZone(z.code)}
                  aria-label={`${z.code}: ${z.count} ${vi ? 'tài sản' : 'assets'}`}
                  aria-pressed={active}
                  sx={(theme) => {
                    // Hierarchy: major areas (A1..A11) = badge "A1  37"; child zones (A1-1) = smaller, quieter
                    // badge "A1-1  21". Colours are fixed because the layout image underneath is always white,
                    // in both theme modes.
                    const tone = active
                      ? { border: AREA_BLUE, code: '#ffffff', count: '#ffffff', bg: `linear-gradient(180deg, ${AREA_BLUE}, ${SELECT_BLUE})` }
                      : related
                        ? { border: AREA_BLUE, code: SELECT_BLUE, count: '#1e3a8a', bg: 'rgba(219,234,254,0.96)' }
                        : empty
                          ? { border: alpha('#64748b', 0.45), code: '#64748b', count: '#94a3b8', bg: 'rgba(255,255,255,0.8)' }
                          : { border: alpha(AREA_BLUE, major ? 1 : 0.95), code: major ? '#1e40af' : '#1d4ed8', count: major ? '#0f172a' : '#172554', bg: major ? 'rgba(255,255,255,0.98)' : 'rgba(255,255,255,0.97)' }
                    const ring = '0 0 0 3px rgba(37,99,235,.22)'
                    const relatedRing = '0 0 0 2px rgba(37,99,235,.14)'
                    const selectedShadow = major ? '0 8px 20px rgba(37,99,235,.28)' : '0 6px 14px rgba(37,99,235,.28)'
                    const selectedHoverShadow = major ? '0 10px 24px rgba(37,99,235,.36)' : '0 8px 18px rgba(37,99,235,.36)'
                    const shadow = major ? '0 3px 9px rgba(15,23,42,.20)' : '0 3px 8px rgba(15,23,42,.18)'
                    const hoverShadow = major ? '0 4px 12px rgba(15,23,42,.26)' : '0 4px 10px rgba(15,23,42,.24)'
                    return {
                      // Outer anchor: a zero-size point at the zone's x/y in the scene's (unrotated) % space.
                      // It rotates with the scene and carries only the render-only nudge; no scale, no counter-rotation.
                      position: 'absolute',
                      left: `${z.x}%`,
                      top: `${z.y}%`,
                      width: 0,
                      height: 0,
                      minWidth: 0,
                      padding: 0,
                      overflow: 'visible',
                      transform: `translate(${offset.x}px, ${offset.y}px)`,
                      // While something is selected, unrelated markers recede (never scale); related stay at full strength.
                      opacity: dimmed ? 0.45 : 1,
                      // Layering: selected target > related > majors > child badges; hover/focus on top.
                      zIndex: active ? 4 : related ? 3 : major ? 2 : 1,
                      transition: 'opacity .15s',
                      // Inner badge: every visual (box, colours, scale, upright text) lives here.
                      '& .marker-badge': {
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        transform: badge(active ? 1.06 : 1),
                        transformOrigin: 'center center',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        whiteSpace: 'nowrap',
                        ...(major
                          ? { height: '28px', gap: '6px', padding: '0 8px', borderRadius: '8px' }
                          : { height: '24px', gap: '5px', padding: '0 6px', borderRadius: '7px' }),
                        border: `${active ? 2.8 : major ? 2.2 : related ? 2 : 1.9}px solid ${tone.border}`,
                        background: tone.bg,
                        boxShadow: active
                          ? `${ring}, ${selectedShadow}, inset 0 1px 0 rgba(255,255,255,.25)`
                          : related
                            ? `${relatedRing}, ${shadow}, inset 0 1px 0 rgba(255,255,255,.8)`
                            : `${shadow}, inset 0 1px 0 rgba(255,255,255,.8)`,
                        transition: 'transform .12s, background .12s, border-color .12s, box-shadow .12s',
                      },
                      '& .marker-code': { fontSize: major ? '10.5px' : '9.5px', fontWeight: 800, lineHeight: 1, letterSpacing: '0.01em', color: tone.code },
                      '& .marker-count': { fontSize: major ? '13px' : '11px', fontWeight: 900, lineHeight: 1, color: tone.count, fontVariantNumeric: 'tabular-nums' },
                      // Hover: selected = deeper shadow only; others = small border/shadow lift, no scaling.
                      // Hover: selected = deeper shadow only; others = small border/shadow lift + 1.03 on the inner badge.
                      '&:hover': active ? { zIndex: 5 } : { zIndex: 5, opacity: dimmed ? 0.85 : 1 },
                      '&:hover .marker-badge': active
                        ? { boxShadow: `${ring}, ${selectedHoverShadow}, inset 0 1px 0 rgba(255,255,255,.25)` }
                        : { transform: badge(1.03), borderColor: SELECT_BLUE, boxShadow: `${hoverShadow}, inset 0 1px 0 rgba(255,255,255,.8)` },
                      // Keyboard focus is on the (zero-size) button; draw the ring on the visible badge.
                      '&.Mui-focusVisible': { zIndex: 5, opacity: 1, outline: 'none' },
                      '&.Mui-focusVisible .marker-badge': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: '2px' },
                    }
                  }}
                >
                  <span className="marker-badge" aria-hidden>
                    <span className="marker-code">{z.code}</span>
                    <span className="marker-count">{z.count.toLocaleString()}</span>
                  </span>
                </ButtonBase>
              </Tooltip>
            )
          })}
        </Box>
        </RotationFrame>
      </Box>
    </Box>
  )
}
