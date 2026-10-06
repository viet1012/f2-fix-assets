import { alpha, Alert, Box, Button, ButtonBase, FormControlLabel, GlobalStyles, Link, Stack, Switch, Typography, type Theme } from '@mui/material'
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { facLabel } from '../../config/relocation'
import { FLOORS, ZONE_INDEX, type LayoutId } from '../../data/mapData'
import { useAssetsWithLocation, useLocations } from '../../hooks/useLocations'
import { useMapViewSettings } from '../../hooks/useMapViewSettings'
import { useRelocationDraft } from '../../hooks/useRelocationDraft'
import { useRelocationRequests } from '../../hooks/useRelocationRequests'
import { RelocationApiError, relocationErrorMessage } from '../../api/relocationRequests'
import { useCurrentUser } from '../../auth/authContext'
import type { Lang } from '../../types/fixedAsset'
import type { AssetLocation, LocationZone } from '../../types/location'
import type { RelocationRequest, RelocationTarget } from '../../types/relocation'
import { density } from '../../theme/density'
import { tokens } from '../../theme/palette'
import { buildLocationCatalog, catalogFacs, catalogTray, isCatalogTarget, isOutsideAsset } from '../../utils/locationCatalog'
import { buildIndexes, buildTray, movers, moveTypeOf, rowFac, rowLayoutId, targetFac, type RelocationContext } from '../../utils/relocation'
import { EMPTY_FORM, todayIso, validateRelocationForm, type RelocationFormValues } from '../../utils/relocationForm'
import { downloadBlob, exportRelocationPng, snapshotExportInput, type RelocationExportInput } from '../../utils/exportRelocationPng'
import { buildRequestItems, pendingCodesOf, rowsInZone, sourceZonesByFac } from '../../utils/relocationInput'
import { SectionCard } from '../common/SectionCard'
import CheckRounded from '@mui/icons-material/CheckRounded'
import MapOutlined from '@mui/icons-material/MapOutlined'
import { createScrollSync, DEFAULT_MAP_VIEW, type MapView } from '../map/MapScene'
import { ErrorState, LoadingState } from '../common/States'
import { MachinePicker, SelectionSummary } from './MachinePicker'
import { RelocationFloorMap } from './RelocationFloorMap'
import { RelocationForm } from './RelocationForm'
import { RelocationRequestsTable } from './RelocationRequestsTable'
import { RelocationSummary } from './RelocationSummary'
import { TargetLocationSelect, type Route, type RouteBadge, type TargetLocationHandle } from './TargetLocationSelect'
import { RelocationMapToolbar } from './RelocationMapToolbar'
import { ZoneBrowseSelect } from './ZoneBrowseSelect'
import { ZoneMachineList } from './ZoneMachineList'

/** three.js and the 3D scene: a separate chunk, loaded on the first "Xem 3D". */
const Relocation3DView = lazy(() => import('./Relocation3DView'))

const MAP = tokens.light // Solid state colours with white text: the same in both theme modes.

const VISUALLY_HIDDEN = { position: 'absolute', width: 1, height: 1, p: 0, m: '-1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 } as const
const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
/** Scroll the card holding `el` into view (smooth unless reduced motion). */
function scrollToCard(el: HTMLElement | null) {
  const card = el?.closest<HTMLElement>('.MuiCard-root') ?? el
  card?.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' })
}
/**
 * Card of the active step: a static 2px primary ring drawn inside the card (::before masked to its padding, so the
 * card keeps overflow: hidden). When a step becomes active, two comets (bright head, long tail; the second one 180°
 * behind and fainter) run round a faint 3px track with a soft glow, until the user interacts with the card or
 * RING_MAX_MS; then the static ring stays. Without @property support or with reduced motion: static ring + glow.
 */
const RING_TURN_MS = 4000
const RING_MAX_MS = 20000
/** User interaction with the card that stops the run (attached after the programmatic focus of the step change). */
const RING_STOP_EVENTS = ['focusin', 'pointerdown', 'click', 'input', 'change'] as const
const canRunRing = () => !reducedMotion() && typeof CSS !== 'undefined' && typeof CSS.registerProperty === 'function'
const RING_PROPERTY = '@property --reloc-angle { syntax: "<angle>"; inherits: false; initial-value: 0deg; }'
const RING_MASK = 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)'
const ringStyles = (t: Theme) => {
  const c = t.palette.primary.main
  const head = t.palette.mode === 'dark' ? t.palette.primary.light : c
  /** Comet starting `offset` degrees round, colours scaled by `k` (1 = main comet). */
  const comet = (offset: number, k: number) =>
    `conic-gradient(from calc(var(--reloc-angle) + ${offset}deg), transparent 0 55%, ${alpha(head, 0.35 * k)} 75%, ${alpha(head, k)} 92%, ${alpha('#ffffff', k)} 95%, ${alpha(head, k)} 97%, transparent 100%)`
  const glow = `inset 0 0 0 1px ${alpha(c, 0.4)}, 0 0 12px ${alpha(c, 0.15)}`
  const lit = '.reloc-step-card.reloc-step-active, .reloc-step-card.is-running, .reloc-step-card.is-glow'
  return {
    '@keyframes relocRingSpin': { to: { '--reloc-angle': '360deg' } },
    [lit]: { position: 'relative' },
    [lit.split(', ').map((x) => `${x}::before`).join(', ')]: {
      content: '""',
      position: 'absolute',
      inset: 0,
      padding: '2px',
      borderRadius: 'inherit',
      pointerEvents: 'none',
      zIndex: 2,
      background: c,
      WebkitMask: RING_MASK,
      mask: RING_MASK,
      WebkitMaskComposite: 'xor',
      maskComposite: 'exclude',
    },
    '.reloc-step-card.is-running, .reloc-step-card.is-glow': { boxShadow: glow },
    '.reloc-step-card.is-running::before': {
      padding: '3px',
      background: `${comet(0, 1)}, ${comet(180, 0.5)}, ${alpha(c, 0.25)}`,
      animation: `relocRingSpin ${RING_TURN_MS}ms cubic-bezier(0.37, 0, 0.63, 1) infinite`,
    },
    '@media (prefers-reduced-motion: reduce)': { '.reloc-step-card.is-running::before': { animation: 'none', padding: '2px', background: c } },
  }
}

type Step = 1 | 2 | 3
interface StepItem {
  label: string
  /** Short summary once done ("2 máy", "A2-3"). */
  summary: string | null
  done: boolean
}

/** Chevron arrow (9px point); every item after the first also has the matching notch on its left. */
const CHEVRON_FIRST = 'polygon(0 0, calc(100% - 9px) 0, 100% 50%, calc(100% - 9px) 100%, 0 100%)'
const CHEVRON_NEXT = 'polygon(0 0, calc(100% - 9px) 0, 100% 50%, calc(100% - 9px) 100%, 0 100%, 9px 50%)'

/** Compact closed chevron process (1) Pick machines (2) Destination (3) Details & submit: a click scrolls to the step's card. */
function RelocationStepper({ lang, steps, active, onPick }: { lang: Lang; steps: readonly StepItem[]; active: Step; onPick: (step: Step) => void }) {
  const vi = lang === 'vi'
  return (
    <Box component="nav" aria-label={vi ? 'Các bước tạo yêu cầu' : 'Request steps'} data-testid="reloc-stepper" sx={{ alignSelf: 'flex-start', maxWidth: '100%' }}>
      <Box component="ol" sx={{ display: 'inline-flex', width: 'fit-content', maxWidth: '100%', listStyle: 'none', m: 0, p: 0 }}>
        {steps.map((s, i) => {
          const n = (i + 1) as Step
          const state = n === active ? 'active' : s.done ? 'done' : 'pending'
          const name = `${n}. ${s.label}${s.summary ? ` · ${s.summary}` : ''}${s.done ? (vi ? ' (đã xong)' : ' (done)') : ''}`
          return (
            // The focus ring sits on the item: the button's clip-path would cut an outline.
            <Box
              component="li"
              key={n}
              sx={(t) => ({ minWidth: 0, ml: i ? '-6px' : 0, '&:has(.Mui-focusVisible)': { outline: `2px solid ${t.palette.primary.main}`, outlineOffset: '2px', borderRadius: '4px' } })}
            >
              <ButtonBase
                onClick={() => onPick(n)}
                aria-current={state === 'active' ? 'step' : undefined}
                aria-label={name}
                title={s.label}
                data-state={state}
                data-step={n}
                sx={(t) => ({
                  maxWidth: '100%',
                  height: 28,
                  gap: 0.5,
                  p: i ? '0 14px 0 18px' : '0 14px 0 10px',
                  clipPath: i ? CHEVRON_NEXT : CHEVRON_FIRST,
                  fontSize: 12,
                  fontWeight: state === 'active' ? 600 : 500,
                  whiteSpace: 'nowrap',
                  color: state === 'active' ? t.palette.primary.contrastText : state === 'done' ? t.palette.primary.main : t.palette.text.secondary,
                  bgcolor: state === 'active' ? t.palette.primary.main : state === 'done' ? alpha(t.palette.primary.main, 0.12) : t.palette.action.hover,
                  '&:hover': { filter: 'brightness(0.95)' },
                })}
              >
                {s.done ? (
                  <CheckRounded aria-hidden sx={{ fontSize: 14, flexShrink: 0 }} />
                ) : (
                  <Box component="span" aria-hidden sx={{ width: 16, height: 16, borderRadius: '50%', border: '1px solid currentColor', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 10, fontWeight: 700, lineHeight: 1 }}>
                    {n}
                  </Box>
                )}
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>{s.label}</Box>
                {s.summary && (
                  <Box
                    component="span"
                    data-testid={`reloc-step-summary-${n}`}
                    sx={{ display: { xs: 'none', sm: 'inline-block' }, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 11, fontWeight: 400, opacity: 0.75 }}
                  >
                    · {s.summary}
                  </Box>
                )}
              </ButtonBase>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

/** Empty map card body: small icon + one hint line, capped at ~96px (no tall map frame). */
function MapEmpty({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <Stack direction="row" spacing={1} data-testid={testId} sx={{ alignItems: 'center', maxHeight: 96, py: 1.5, px: 1.25, borderRadius: 1, border: 1, borderStyle: 'dashed', borderColor: 'divider', color: 'text.secondary' }}>
      <MapOutlined fontSize="small" aria-hidden sx={{ flexShrink: 0, opacity: 0.7 }} />
      <Typography variant="body2" color="inherit">{children}</Typography>
    </Stack>
  )
}

/** Map card title: 12px colour square + bold title. */
function CardTitle({ color, children }: { color: string; children: ReactNode }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, fontWeight: 700 }}>
      <Box component="span" aria-hidden sx={{ width: 12, height: 12, borderRadius: '2px', bgcolor: color, flexShrink: 0 }} />
      {children}
    </Box>
  )
}

/** Drawing of the request just created: exported + uploaded after the 201. */
type DrawingState = { status: 'saving' } | { status: 'saved'; webUrl: string | null; fileName: string } | { status: 'failed' }
/**
 * Excel file the server writes with the request: unknown until the drawing is stored (pending), saved, failed (the
 * create or drawing response carried excelError), or being rebuilt (POST /{requestNo}/excel).
 */
type ExcelState = 'pending' | 'saving' | 'saved' | 'failed'

/** Relocation request tab: assets and zones come from the location API (Factory 2, every div), never from static data. */
/** account: the logged-in user (session), shown as the requester and used for "my requests". */
export default function RelocationTab({ lang, account }: { lang: Lang; account: string }) {
  const vi = lang === 'vi'
  const assets = useAssetsWithLocation()
  const locations = useLocations()
  const errors = [assets.status, locations.status].flatMap((s) => (s.type === 'error' ? [s.message] : []))

  if (errors.length) {
    return (
      <ErrorState
        title={vi ? 'Không tải được dữ liệu vị trí' : 'Could not load location data'}
        message={errors.join(' · ')}
        retryLabel={vi ? 'Thử lại' : 'Retry'}
        onRetry={() => {
          if (assets.status.type === 'error') assets.reload()
          if (locations.status.type === 'error') locations.reload()
        }}
      />
    )
  }
  if (assets.status.type === 'loading' || locations.status.type === 'loading') {
    return <LoadingState label={vi ? 'Đang tải dữ liệu vị trí...' : 'Loading location data...'} />
  }
  return <RelocationWorkspace lang={lang} account={account} rows={assets.data} locations={locations.data} />
}

function RelocationWorkspace({ lang, account, rows, locations }: { lang: Lang; account: string; rows: readonly AssetLocation[]; locations: readonly LocationZone[] }) {
  const vi = lang === 'vi'
  const user = useCurrentUser()
  const { byCode } = useMemo(() => buildIndexes(rows), [rows])
  const catalog = useMemo(() => buildLocationCatalog(locations, ZONE_INDEX), [locations])
  const zoneCount = catalog.count
  // Buildings come from the API fac of each zone.
  const ctx: RelocationContext = useMemo(() => ({ layouts: FLOORS, index: ZONE_INDEX, zoneFac: catalog.fac }), [catalog])
  const isOutside = useCallback((row: AssetLocation) => isOutsideAsset(row, catalog), [catalog])
  const facOf = useCallback((row: AssetLocation) => rowFac(row, ctx), [ctx])
  // Browse by zone: machines are where they are now (Outside excluded: nothing there can be picked).
  const zonesByFac = useMemo(() => sourceZonesByFac(rows.filter((r) => !isOutside(r)), ctx), [rows, isOutside, ctx])
  const draft = useRelocationDraft(byCode)
  const { requests, loading, persistent, create, get: getRequest, uploadDrawing, regenerateExcel } = useRelocationRequests()
  const pendingCodes = useMemo(() => pendingCodesOf(requests), [requests])
  const [afterLayoutId, setAfterLayoutId] = useState<LayoutId | null>(null)
  /** Before map layout chosen by the user (browsing); null = follow the selected machines. */
  const [viewBefore, setViewBefore] = useState<LayoutId | null>(null)
  /** Zone whose machine list is open. */
  const [openZone, setOpenZone] = useState<string | null>(null)
  const [mapSettings, updateMapSettings] = useMapViewSettings()
  const [open3d, setOpen3d] = useState(false)
  /** Zone of the selected-machine row being hovered: flashed on both maps. */
  const [hoverZone, setHoverZone] = useState<string | null>(null)
  // "Sync zoom": the zoom step is shared state; the scroll position never is. Live scroll goes map-to-map through the
  // scroll sync group (DOM only); the last stopped position is kept in a ref, to seed a map that mounts later.
  const [sharedZoom, setSharedZoom] = useState(DEFAULT_MAP_VIEW.zoomIndex)
  const sharedScroll = useRef({ scrollX: DEFAULT_MAP_VIEW.scrollX, scrollY: DEFAULT_MAP_VIEW.scrollY })
  const onSharedViewChange = useCallback((v: MapView) => {
    sharedScroll.current = { scrollX: v.scrollX, scrollY: v.scrollY }
    setSharedZoom(v.zoomIndex)
  }, [])
  const scrollSync = useMemo(() => (mapSettings.syncZoom ? createScrollSync() : undefined), [mapSettings.syncZoom])
  // Props shared by both maps, stable across renders that do not change them (RelocationFloorMap is memoised).
  const mapProps = useMemo(
    () => ({
      showAll: mapSettings.showAll,
      showCounts: mapSettings.showCounts,
      highlightZone: hoverZone,
      ...(scrollSync ? { view: { zoomIndex: sharedZoom, ...sharedScroll.current }, onViewChange: onSharedViewChange, scrollSync } : {}),
      ctx,
    }),
    [mapSettings.showAll, mapSettings.showCounts, hoverZone, scrollSync, sharedZoom, onSharedViewChange, ctx],
  )
  const [form, setForm] = useState<RelocationFormValues>(EMPTY_FORM)
  /** "Only my requests" filter of the submitted table. */
  const [mineOnly, setMineOnly] = useState(false)
  const isMine = (r: RelocationRequest) => r.requestedBy.trim().toLowerCase() === account.trim().toLowerCase()
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [lastCreated, setLastCreated] = useState<{ id: string; skipped: readonly string[]; drawing: DrawingState; excel: ExcelState } | null>(null)
  /** Export input and PNG per request, kept for "retry" and "download" (the draft is reset after a submit). */
  const exportInputs = useRef(new Map<string, RelocationExportInput>())
  const pngs = useRef(new Map<string, Blob>())
  /** Requests of the table whose drawing is being re-uploaded, and the last re-upload error. */
  const [tableUploads, setTableUploads] = useState<ReadonlySet<string>>(new Set())
  const [drawingError, setDrawingError] = useState<string | null>(null)
  /** Requests of the table whose Excel file is being rebuilt, and the last success message. */
  const [tableExcel, setTableExcel] = useState<ReadonlySet<string>>(new Set())
  const [excelNotice, setExcelNotice] = useState<string | null>(null)
  /** Machines of the last 409 (already in an open request), marked red in the selected table. */
  const [conflictCodes, setConflictCodes] = useState<ReadonlySet<string>>(new Set())

  // Guided flow: the active step frames its card; the user moves on (never while picking machines).
  const [step, setStep] = useState<Step>(1)
  const pickBox = useRef<HTMLDivElement>(null)
  const destBox = useRef<HTMLDivElement>(null)
  const formBox = useRef<HTMLDivElement>(null)
  const targetSelect = useRef<TargetLocationHandle>(null)
  const plannedDate = useRef<HTMLInputElement>(null)
  const pickedCount = draft.selected.length
  // Running ring: on the card of a step that just became active (and on the destination card as the "next" hint).
  // `animate` false (reduced motion / no @property): static ring + glow only.
  const [ring, setRing] = useState<{ step: Step; id: number; animate: boolean } | null>(null)
  const runRing = useCallback((s: Step) => setRing((r) => ({ step: s, id: (r?.id ?? 0) + 1, animate: canRunRing() })), [])
  const firstStep = useRef(true)
  useEffect(() => {
    if (firstStep.current) return void (firstStep.current = false)
    runRing(step)
  }, [step, runRing])
  // Stops at RING_MAX_MS or on the first interaction with the card; listeners are armed after the step change's own
  // programmatic focus (same tick), so only the user's focus / click / edit counts.
  useEffect(() => {
    if (!ring) return
    const card = [pickBox, destBox, formBox][ring.step - 1].current?.closest<HTMLElement>('.MuiCard-root')
    const stop = () => setRing((r) => (r?.id === ring.id ? null : r))
    const max = setTimeout(stop, RING_MAX_MS)
    const arm = setTimeout(() => RING_STOP_EVENTS.forEach((e) => card?.addEventListener(e, stop)), 0)
    return () => {
      clearTimeout(max)
      clearTimeout(arm)
      RING_STOP_EVENTS.forEach((e) => card?.removeEventListener(e, stop))
    }
  }, [ring])
  // Card classes set on the DOM (SectionCard takes no className); re-applied after every render, the ring restarts
  // (class removed + reflow) only for a new run id.
  useLayoutEffect(() => {
    ;[pickBox, destBox, formBox].forEach((box, i) => {
      const card = box.current?.closest<HTMLElement>('.MuiCard-root')
      if (!card) return
      const lit = ring?.step === i + 1
      const run = lit && ring.animate
      card.classList.add('reloc-step-card')
      card.classList.toggle('reloc-step-active', step === i + 1)
      if (run && card.dataset.ringId !== String(ring.id)) {
        card.classList.remove('is-running')
        void card.offsetWidth
        card.dataset.ringId = String(ring.id)
      }
      card.classList.toggle('is-running', run)
      card.classList.toggle('is-glow', lit && !ring.animate)
    })
  })
  // 0 -> >=1 machines: the ring runs round the destination card and the next step is announced; the focus stays.
  const [announce, setAnnounce] = useState('')
  const prevCount = useRef(pickedCount)
  useEffect(() => {
    const prev = prevCount.current
    prevCount.current = pickedCount
    if (prev !== 0 || pickedCount === 0) return
    runRing(2)
    setAnnounce(vi ? `Đã chọn ${pickedCount} máy. Tiếp theo: chọn vị trí đích.` : `${pickedCount} ${pickedCount === 1 ? 'machine' : 'machines'} selected. Next: pick the destination.`)
  }, [pickedCount, vi, runRing])
  const goToDestination = () => {
    setStep(2)
    scrollToCard(destBox.current)
    targetSelect.current?.start()
  }
  // Zone picked: the details card, "Planned date" focused (after the zone popup has closed).
  const [formFocus, setFormFocus] = useState(0)
  useEffect(() => {
    if (!formFocus) return
    scrollToCard(formBox.current)
    plannedDate.current?.focus({ preventScroll: true })
  }, [formFocus])
  const goToForm = () => {
    setStep(3)
    setFormFocus((n) => n + 1)
  }
  const pickStep = (n: Step) => {
    setStep(n)
    scrollToCard([pickBox, destBox, formBox][n - 1].current)
  }

  const layoutOf = (id: LayoutId | null) => FLOORS.find((l) => l.id === id)
  const beforeLayoutId = viewBefore ?? draft.activeBeforeLayout
  const beforeLayout = layoutOf(beforeLayoutId)
  const beforeTabs = viewBefore && !draft.beforeLayouts.includes(viewBefore) ? [...draft.beforeLayouts, viewBefore] : draft.beforeLayouts
  // Tray of the Before map when browsing: every asset zone of the layout that is not drawn.
  const beforeTray = useMemo(() => (beforeLayout ? buildTray(beforeLayout, rows, ctx) : []), [beforeLayout, rows, ctx])
  const openZoneFromList = (zone: string | null) => {
    setOpenZone(zone)
    const first = zone ? rowsInZone(rows, zone)[0] : undefined
    const id = first ? rowLayoutId(first, ctx.index) : null
    if (id) setViewBefore(id)
  }
  const afterLayout = layoutOf(afterLayoutId)
  const afterId = afterLayout?.id ?? null
  const afterPickable = useCallback((code: string) => afterId !== null && isCatalogTarget(catalog, afterId, code), [catalog, afterId])
  const afterTray = useMemo(() => (afterId ? catalogTray(catalog, afterId) : []), [catalog, afterId])
  const moverCount = draft.target ? movers(draft.selectedRows, draft.target, ctx).length : 0
  /** Side-by-side rows stretch to equal heights only when both sides have content; an empty side stays compact. */
  const rowAlign = draft.selectedRows.length > 0 && draft.target ? 'stretch' : 'start'

  // Card headers: "Toà A / 1F" of a layout (building from the machines there, else from the API zones of the layout).
  const placeOf = (id: LayoutId | null, fac: string | null) => {
    const l = layoutOf(id)
    if (!l) return ''
    return `${fac ? facLabel(fac, vi) : (l.title.split(' - ').pop() ?? l.title)} / ${l.dbFloor ?? '-'}`
  }
  const selectedOn = (id: LayoutId) => draft.selectedRows.filter((r) => rowLayoutId(r, ctx.index) === id)
  const layoutFac = (id: LayoutId) => {
    const first = selectedOn(id)[0]
    return (first ? rowFac(first, ctx) : null) ?? catalogFacs(catalog, id)[0] ?? null
  }
  const beforePlace = beforeLayoutId ? placeOf(beforeLayoutId, layoutFac(beforeLayoutId)) : ''
  const target = draft.target
  const destPlace = target
    ? placeOf(target.layoutId, targetFac(target, ctx) ?? catalogFacs(catalog, target.layoutId)[0] ?? null)
    : afterLayoutId
      ? placeOf(afterLayoutId, catalogFacs(catalog, afterLayoutId)[0] ?? null)
      : ''
  // Move kinds of the machines that actually move: purple when a building/floor changes, green when all stay.
  const moves = target ? draft.selectedRows.map((r) => ({ row: r, type: moveTypeOf(r, target, ctx) })).filter((m) => m.type !== 'none') : []
  const kinds = new Set(moves.map((m) => m.type))
  const cross = kinds.has('building') || kinds.has('floor')
  const moveKind: 'cross' | 'same' | 'none' = cross ? 'cross' : moves.length ? 'same' : 'none'
  const sourcePlaces = [...new Set(moves.map((m) => { const id = rowLayoutId(m.row, ctx.index); return id ? placeOf(id, rowFac(m.row, ctx)) : m.row.floor ?? '-' }))]
  const afterBorder = moveKind === 'cross' ? `2px solid ${MAP.relocCross}` : moveKind === 'same' ? `2px solid ${MAP.relocTo}` : undefined
  // "Đổi toà" / "Đổi tầng": solid purple; "Cùng tầng": light green.
  const badges: RouteBadge[] = []
  if (kinds.has('building')) badges.push({ key: 'building', label: vi ? 'Đổi toà' : 'Building change', solid: true, color: MAP.relocCross })
  if (kinds.has('floor')) badges.push({ key: 'floor', label: vi ? 'Đổi tầng' : 'Floor change', solid: true, color: MAP.relocCross })
  if (kinds.has('same')) badges.push({ key: 'same', label: vi ? 'Cùng tầng' : 'Same floor', solid: false, color: MAP.relocTo })
  const route: Route | null = target && moves.length ? { count: moves.length, dest: `${destPlace} / ${target.zone}`, badges } : null
  const routeColors = { from: MAP.relocFrom, to: MAP.relocTo }
  const formReady = Object.keys(validateRelocationForm(form, todayIso())).length === 0 && moverCount > 0
  const steps: StepItem[] = [
    { label: vi ? 'Chọn máy' : 'Pick machines', summary: pickedCount ? (vi ? `${pickedCount} máy` : `${pickedCount} ${pickedCount === 1 ? 'machine' : 'machines'}`) : null, done: pickedCount > 0 },
    { label: vi ? 'Vị trí đích' : 'Destination', summary: target?.zone ?? null, done: !!target },
    { label: vi ? 'Thông tin & gửi' : 'Details & submit', summary: formReady ? (vi ? 'Sẵn sàng gửi' : 'Ready') : null, done: formReady },
  ]

  const setTarget = (target: RelocationTarget | null) => {
    if (target) setAfterLayoutId(target.layoutId)
    draft.setTarget(target)
  }
  const pickOnMap = (target: RelocationTarget) => {
    if (!isCatalogTarget(catalog, target.layoutId, target.zone)) return
    setTarget(target)
    goToForm()
  }
  /** Stable map callback (latest pickOnMap through a ref), so the memoised After map does not re-render for it. */
  const pickRef = useRef(pickOnMap)
  pickRef.current = pickOnMap
  const onPickZone = useCallback((target: RelocationTarget) => pickRef.current(target), [])

  const pngOf = async (id: string) => {
    const cached = pngs.current.get(id)
    if (cached) return cached
    const input = exportInputs.current.get(id)
    if (!input) throw new Error(`No drawing data for ${id}`)
    const png = await exportRelocationPng(input)
    pngs.current.set(id, png)
    return png
  }
  const setDrawing = (id: string, drawing: DrawingState) => setLastCreated((c) => (c?.id === id ? { ...c, drawing } : c))
  const setExcel = (id: string, excel: ExcelState) => setLastCreated((c) => (c?.id === id ? { ...c, excel } : c))
  /** Export (once) + upload; a failure keeps the request, the banner offers "retry". */
  const saveDrawing = async (id: string) => {
    setDrawing(id, { status: 'saving' })
    try {
      const saved = await uploadDrawing(id, await pngOf(id))
      setDrawing(id, { status: 'saved', webUrl: saved.webUrl, fileName: saved.fileName })
      // A failure reported earlier (create) stays until "Tạo lại Excel" succeeds.
      setLastCreated((c) => (c?.id === id && c.excel !== 'failed' ? { ...c, excel: saved.excelError ? 'failed' : 'saved' } : c))
    } catch {
      setDrawing(id, { status: 'failed' })
    }
  }
  /** Guards double clicks before the disabled menu item re-renders. */
  const rebuildingExcel = useRef(new Set<string>())
  /** POST /{requestNo}/excel, from the banner or the table menu. */
  const rebuildExcel = async (id: string) => {
    if (rebuildingExcel.current.has(id)) return
    rebuildingExcel.current.add(id)
    setDrawingError(null)
    setExcelNotice(null)
    setExcel(id, 'saving')
    setTableExcel((prev) => new Set(prev).add(id))
    try {
      await regenerateExcel(id)
      setExcel(id, 'saved')
      setExcelNotice(vi ? `Đã tạo lại Excel cho ${id}` : `Excel rebuilt for ${id}`)
    } catch (e) {
      setExcel(id, 'failed')
      if (e instanceof RelocationApiError && e.status === 403) setDrawingError(vi ? 'Chỉ người tạo mới được tạo lại Excel' : 'Only the requester can rebuild the Excel file')
      else setDrawingError(`${vi ? `Chưa tạo lại được Excel ${id}` : `Could not rebuild the Excel file of ${id}`}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      rebuildingExcel.current.delete(id)
      setTableExcel((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }
  const downloadPng = async (id: string) => {
    try {
      downloadBlob(await pngOf(id), `${id}.png`)
    } catch (e) {
      setDrawingError(`${vi ? 'Không tạo được ảnh PNG' : 'Could not build the PNG'}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  /** Guards double clicks before the disabled button re-renders. */
  const reuploading = useRef(new Set<string>())
  /** Table "re-upload": the PNG is rebuilt from the stored snapshot (GET detail), never from where the machines are now. */
  const reupload = async (r: RelocationRequest) => {
    if (reuploading.current.has(r.id)) return
    reuploading.current.add(r.id)
    setDrawingError(null)
    setTableUploads((prev) => new Set(prev).add(r.id))
    try {
      if (!pngs.current.has(r.id)) {
        const snapshot = await getRequest(r.id)
        const names = new Map(snapshot.items.map((i) => [i.code, byCode.get(i.code)?.name ?? null] as const))
        exportInputs.current.set(r.id, snapshotExportInput(snapshot, { lang, layouts: FLOORS, ctx, names }))
      }
      await uploadDrawing(r.id, await pngOf(r.id))
    } catch (e) {
      if (e instanceof RelocationApiError && e.status === 403) setDrawingError(vi ? 'Chỉ người tạo mới được tải lên lại' : 'Only the requester can re-upload the drawing')
      else setDrawingError(`${vi ? `Chưa lưu được bản vẽ ${r.id}` : `Could not save the drawing of ${r.id}`}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      reuploading.current.delete(r.id)
      setTableUploads((prev) => {
        const next = new Set(prev)
        next.delete(r.id)
        return next
      })
    }
  }

  const submit = async (values: RelocationFormValues) => {
    if (!draft.target) return
    setSubmitting(true)
    setSubmitError(null)
    setConflictCodes(new Set())
    try {
      const created = await create({
        items: buildRequestItems(draft.selectedRows, draft.target, ctx),
        to: draft.target,
        // Not sent: the server takes the session account; kept for the local copy and the PNG.
        requestedBy: account,
        requesterName: user?.name ?? null,
        plannedMoveDate: values.plannedMoveDate,
        plannedDoneDate: values.plannedDoneDate,
        reason: values.reason.trim(),
      })
      // Snapshot for the PNG before the draft is reset: the machines written by the API, at their current location.
      const written = new Set(created.items.map((i) => i.code))
      const moving = draft.selectedRows.filter((row) => written.has(row.code))
      const beforeId = moving[0] ? rowLayoutId(moving[0], ctx.index) : draft.activeBeforeLayout
      exportInputs.current.set(created.id, {
        lang,
        request: created,
        rows: moving,
        target: draft.target,
        beforeLayout: layoutOf(beforeId) ?? null,
        afterLayout: layoutOf(draft.target.layoutId) ?? null,
        ctx,
      })
      setLastCreated({ id: created.id, skipped: created.skipped, drawing: { status: 'saving' }, excel: created.excelError ? 'failed' : 'pending' })
      void saveDrawing(created.id)
      draft.reset()
      setAfterLayoutId(null)
      setViewBefore(null)
      setOpenZone(null)
      setForm(EMPTY_FORM)
      setStep(1)
    } catch (e) {
      setSubmitError(relocationErrorMessage(e, vi))
      if (e instanceof RelocationApiError && e.status === 409) setConflictCodes(new Set(e.codes))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Stack spacing={density.gap}>
      {!persistent && (
        <Alert severity="warning">
          {vi
            ? 'Trình duyệt không cho lưu dữ liệu (localStorage). Yêu cầu chỉ được giữ tạm và sẽ mất khi tải lại trang.'
            : 'Browser storage (localStorage) is unavailable. Requests are kept temporarily and will be lost on reload.'}
        </Alert>
      )}
      {lastCreated && (
        <Alert
          severity={lastCreated.drawing.status === 'failed' || lastCreated.excel === 'failed' ? 'warning' : 'success'}
          onClose={() => setLastCreated(null)}
          data-testid="reloc-created"
          data-drawing={lastCreated.drawing.status}
          data-excel={lastCreated.excel}
          action={
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              {lastCreated.drawing.status === 'failed' && (
                <Button size="small" color="inherit" variant="outlined" onClick={() => void saveDrawing(lastCreated.id)}>
                  {vi ? 'Thử lại' : 'Retry'}
                </Button>
              )}
              {lastCreated.excel === 'failed' && (
                <Button size="small" color="inherit" variant="outlined" onClick={() => void rebuildExcel(lastCreated.id)}>
                  {vi ? 'Tạo lại Excel' : 'Rebuild Excel'}
                </Button>
              )}
              <Button size="small" color="inherit" onClick={() => void downloadPng(lastCreated.id)}>
                {vi ? 'Tải PNG về máy' : 'Download PNG'}
              </Button>
            </Stack>
          }
        >
          {lastCreated.drawing.status === 'failed'
            ? vi
              ? `Đã tạo ${lastCreated.id} nhưng chưa lưu được bản vẽ`
              : `Created ${lastCreated.id} but the drawing could not be saved`
            : `${vi ? 'Đã tạo' : 'Created'} ${lastCreated.id}`}
          {lastCreated.drawing.status === 'saving' && (vi ? ' · Đang lưu bản vẽ...' : ' · Saving the drawing...')}
          {lastCreated.drawing.status === 'saved' && (vi ? ' · Đã lưu bản vẽ' : ' · Drawing saved')}
          {lastCreated.excel === 'saved' && (vi ? ' · Đã lưu Excel' : ' · Excel saved')}
          {lastCreated.excel === 'saving' && (vi ? ' · Đang tạo Excel...' : ' · Building the Excel file...')}
          {lastCreated.excel === 'failed' && (vi ? ' · Chưa lưu được Excel' : ' · Excel file not saved')}
          {lastCreated.drawing.status === 'saved' && (
            <>
              {' · '}
              {lastCreated.drawing.webUrl ? (
                <Link href={lastCreated.drawing.webUrl} target="_blank" rel="noopener noreferrer" data-testid="reloc-drawing-link">
                  {vi ? 'Mở bản vẽ' : 'Open drawing'}
                </Link>
              ) : (
                lastCreated.drawing.fileName
              )}
            </>
          )}
          {lastCreated.skipped.length > 0 &&
            (vi ? ` · Bỏ qua (đã ở vị trí đích): ${lastCreated.skipped.join(', ')}` : ` · Skipped (already at the destination): ${lastCreated.skipped.join(', ')}`)}
        </Alert>
      )}
      {drawingError && <Alert severity="error" onClose={() => setDrawingError(null)}>{drawingError}</Alert>}
      {excelNotice && <Alert severity="success" onClose={() => setExcelNotice(null)}>{excelNotice}</Alert>}

      <GlobalStyles styles={RING_PROPERTY} />
      <GlobalStyles styles={ringStyles} />
      <RelocationStepper lang={lang} steps={steps} active={step} onPick={pickStep} />
      <Box role="status" aria-live="polite" data-testid="reloc-next-hint" sx={VISUALLY_HIDDEN}>{announce}</Box>

      {/* Pick machines + destination side by side (3fr / 2fr) from lg, stacked below; equal heights only when both have content. */}
      <Box data-testid="reloc-row-pick" data-align={rowAlign} sx={{ display: 'grid', gap: density.gap, alignItems: rowAlign, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 3fr) minmax(0, 2fr)' } }}>
      <SectionCard
        title={vi ? '1. Chọn máy' : '1. Pick machines'}
        actions={<SelectionSummary lang={lang} selectedRows={draft.selectedRows} onClear={draft.clear} />}
        sx={rowAlign === 'stretch' ? { height: '100%' } : undefined}
      >
        <Box ref={pickBox} onFocus={() => setStep(1)}>
        <MachinePicker
          lang={lang}
          rows={rows}
          byCode={byCode}
          selected={draft.selected}
          selectedRows={draft.selectedRows}
          pendingCodes={pendingCodes}
          conflictCodes={conflictCodes}
          isOutside={isOutside}
          facOf={facOf}
          onHoverZone={setHoverZone}
          onAdd={draft.add}
          onRemove={draft.remove}
          onClear={draft.clear}
          onNext={goToDestination}
        />
        </Box>
      </SectionCard>

      <SectionCard title={vi ? '2. Vị trí đích' : '2. Destination'} sx={rowAlign === 'stretch' ? { height: '100%' } : undefined}>
        <Box ref={destBox} onFocus={() => setStep(2)} data-testid="reloc-dest">
        <TargetLocationSelect
          ref={targetSelect}
          lang={lang}
          layouts={FLOORS}
          layoutId={afterLayoutId}
          target={draft.target}
          catalog={catalog}
          onLayoutChange={setAfterLayoutId}
          onTargetChange={setTarget}
          route={route}
          routeColors={routeColors}
          onZonePicked={goToForm}
        />
        </Box>
      </SectionCard>
      </Box>

      <RelocationMapToolbar lang={lang} settings={mapSettings} onChange={updateMapSettings} onOpen3d={() => setOpen3d(true)} />
      {open3d && (
        <Suspense fallback={null}>
          <Relocation3DView
            lang={lang}
            open
            onClose={() => setOpen3d(false)}
            layouts={FLOORS}
            initialLayoutId={afterLayoutId ?? beforeLayoutId ?? FLOORS[0].id}
            zoneCount={zoneCount}
            rows={draft.selectedRows}
            target={draft.target}
            ctx={ctx}
            route={route}
            routeColors={routeColors}
            placeOf={placeOf}
            layoutPlace={(id) => placeOf(id, layoutFac(id))}
            isPickable={(id, code) => isCatalogTarget(catalog, id, code)}
            onPickZone={onPickZone}
          />
        </Suspense>
      )}

      {/* Two equal map columns (same frame ratio and fit); the zone machine list is a third column when open. */}
      <Box sx={{ display: 'grid', gap: density.gap, alignItems: beforeLayout && afterLayout ? 'stretch' : 'start', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: openZone ? 'repeat(2, minmax(0, 1fr)) 300px' : 'repeat(2, minmax(0, 1fr))' } }}>
        <SectionCard
          title={<CardTitle color={MAP.relocFrom}>{vi ? 'Bố trí hiện tại (Trước)' : 'Current layout (Before)'}</CardTitle>}
          description={beforePlace || undefined}
          actions={
            <Box sx={{ width: { xs: 260, sm: 400 } }}>
              <ZoneBrowseSelect lang={lang} zonesByFac={zonesByFac} zone={openZone} onOpenZone={openZoneFromList} />
            </Box>
          }
          sx={{ borderTop: `3px solid ${MAP.relocFrom}` }}
        >
          <Stack spacing={1} data-testid="reloc-before-card">
            {beforeTabs.length > 1 && (
              <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }} role="group" aria-label={vi ? 'Tầng của máy đã chọn' : 'Floors of the selected machines'}>
                <Typography variant="body2" color="text.secondary">{vi ? 'Máy đã chọn nằm ở nhiều tầng:' : 'Selected machines are on several floors:'}</Typography>
                {beforeTabs.map((id) => {
                  const active = id === beforeLayoutId
                  return (
                    <ButtonBase
                      key={id}
                      className={`reloc-layout-pill${active ? ' is-active' : ''}`}
                      data-layout={id}
                      aria-pressed={active}
                      onClick={() => {
                        setViewBefore(id)
                        draft.setBeforeLayout(id)
                      }}
                      sx={(theme) => ({
                        px: 1.25,
                        py: 0.375,
                        borderRadius: '999px',
                        fontSize: 12,
                        fontWeight: 700,
                        color: active ? '#ffffff' : 'text.primary',
                        bgcolor: active ? MAP.relocFrom : theme.palette.action.hover,
                        '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: '2px' },
                      })}
                    >
                      {placeOf(id, layoutFac(id))} ({selectedOn(id).length})
                    </ButtonBase>
                  )
                })}
              </Stack>
            )}
            {beforeLayout ? (
              <RelocationFloorMap
                lang={lang}
                layout={beforeLayout}
                role="before"
                rows={draft.selectedRows}
                target={draft.target}
                zoneCount={zoneCount}
                onOpenZone={setOpenZone}
                openZone={openZone}
                extraTray={beforeTray}
                {...mapProps}
              />
            ) : (
              <MapEmpty testId="reloc-before-empty">
                {draft.selected.length
                  ? vi ? 'Máy đã chọn không nằm trên sơ đồ nào.' : 'Selected machines are not on any layout.'
                  : vi ? 'Chưa chọn máy. Chọn toà và zone ở trên để duyệt máy theo zone.' : 'No machine selected. Pick a building and zone above to browse machines.'}
              </MapEmpty>
            )}
          </Stack>
        </SectionCard>
        <SectionCard
          title={<CardTitle color={MAP.relocTo}>{vi ? 'Bố trí sau di dời (Sau)' : 'Layout after relocation (After)'}</CardTitle>}
          description={destPlace || undefined}
          sx={afterBorder ? { border: afterBorder } : undefined}
        >
          <Stack spacing={1} data-testid="reloc-after-card" data-move={moveKind}>
            {cross && target && (
              <Box
                role="status"
                data-testid="reloc-cross-banner"
                sx={{ px: 1.5, py: 0.75, borderRadius: 1, fontSize: 13, fontWeight: 700, color: '#ffffff', bgcolor: MAP.relocCross }}
              >
                {kinds.has('building') ? (vi ? 'Đổi toà' : 'Building change') : vi ? 'Đổi tầng' : 'Floor change'}: {sourcePlaces.join(', ')} → {destPlace}
              </Box>
            )}
          {afterLayout ? (
            <RelocationFloorMap
              lang={lang}
              layout={afterLayout}
              role="after"
              rows={draft.selectedRows}
              target={draft.target}
              onPickZone={onPickZone}
              zoneCount={zoneCount}
              isPickable={afterPickable}
              extraTray={afterTray}
              {...mapProps}
            />
          ) : (
            <MapEmpty testId="reloc-after-empty">{vi ? 'Chọn toà nhà và tầng đích.' : 'Pick the destination building and floor.'}</MapEmpty>
          )}
          </Stack>
        </SectionCard>
        {openZone && (
          <SectionCard>
            <ZoneMachineList
              lang={lang}
              zone={openZone}
              rows={rows}
              selected={draft.selected}
              pendingCodes={pendingCodes}
              isOutside={isOutside}
              onAdd={draft.add}
              onRemove={draft.remove}
              onClose={() => setOpenZone(null)}
            />
          </SectionCard>
        )}
      </Box>

      {/* Summary + request details side by side (11fr / 9fr) from lg, stacked below; equal heights only when the summary has content. */}
      <Box data-testid="reloc-row-summary" data-align={rowAlign} sx={{ display: 'grid', gap: density.gap, alignItems: rowAlign, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 11fr) minmax(0, 9fr)' } }}>
        <SectionCard title={vi ? '3. Tóm tắt' : '3. Summary'} sx={rowAlign === 'stretch' ? { height: '100%' } : undefined}>
          <RelocationSummary lang={lang} rows={draft.selectedRows} target={draft.target} zoneCount={zoneCount} ctx={ctx} />
        </SectionCard>

        <SectionCard title={vi ? '4. Thông tin yêu cầu' : '4. Request details'} sx={rowAlign === 'stretch' ? { height: '100%' } : undefined}>
          <Box ref={formBox} onFocus={() => setStep(3)}>
            <RelocationForm lang={lang} account={account} requesterName={user?.name ?? null} value={form} onChange={setForm} moverCount={moverCount} submitting={submitting} error={submitError} onSubmit={submit} plannedDateRef={plannedDate} />
          </Box>
        </SectionCard>
      </Box>

      <SectionCard
        title={vi ? 'Yêu cầu đã gửi' : 'Submitted requests'}
        actions={
          <FormControlLabel
            control={<Switch size="small" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />}
            label={<Typography variant="body2">{vi ? 'Chỉ yêu cầu của tôi' : 'Only my requests'}</Typography>}
          />
        }
      >
        <RelocationRequestsTable lang={lang} requests={mineOnly ? requests.filter(isMine) : requests} loading={loading} onReupload={(r) => void reupload(r)} uploading={tableUploads} onRegenerateExcel={(r) => void rebuildExcel(r.id)} canManage={isMine} excelBusy={tableExcel} />
      </SectionCard>
    </Stack>
  )
}
