import { alpha, Alert, Box, Button, ButtonBase, FormControlLabel, Link, Stack, Switch, Typography, type Theme } from '@mui/material'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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

const MAP = tokens.light // Solid state colours with white text: the same in both theme modes.

const VISUALLY_HIDDEN = { position: 'absolute', width: 1, height: 1, p: 0, m: '-1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 } as const
const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
/** Scroll the card holding `el` into view (smooth unless reduced motion). */
function scrollToCard(el: HTMLElement | null) {
  const card = el?.closest<HTMLElement>('.MuiCard-root') ?? el
  card?.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' })
}
/** Card of the active step: 2px primary frame (outline: no layout shift). */
const activeCardSx = (t: Theme) => ({ outline: `2px solid ${t.palette.primary.main}`, outlineOffset: '-2px' })
/** Destination hint once machines are picked: the frame flashes twice (~1.2s), off with reduced motion. */
const PULSE_MS = 1200
const pulseCardSx = (t: Theme) => ({
  '@keyframes relocDestPulse': { '0%, 100%': { boxShadow: `0 0 0 0 ${alpha(t.palette.primary.main, 0)}` }, '50%': { boxShadow: `0 0 0 4px ${alpha(t.palette.primary.main, 0.5)}` } },
  animation: `relocDestPulse ${PULSE_MS / 2}ms ease-in-out 2`,
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
})

type Step = 1 | 2 | 3
interface StepItem {
  label: string
  /** Short summary once done ("2 máy", "A2-3"). */
  summary: string | null
  done: boolean
}

/** (1) Pick machines (2) Destination (3) Details & submit: a click scrolls to the step's card. */
function RelocationStepper({ lang, steps, active, onPick }: { lang: Lang; steps: readonly StepItem[]; active: Step; onPick: (step: Step) => void }) {
  const vi = lang === 'vi'
  return (
    <Box component="nav" aria-label={vi ? 'Các bước tạo yêu cầu' : 'Request steps'} data-testid="reloc-stepper">
      <Stack component="ol" direction="row" useFlexGap sx={{ listStyle: 'none', m: 0, p: 0, flexWrap: 'wrap', alignItems: 'center', rowGap: 0.5 }}>
        {steps.map((s, i) => {
          const n = (i + 1) as Step
          const state = n === active ? 'active' : s.done ? 'done' : 'pending'
          return (
            <Box component="li" key={n} sx={{ display: 'flex', alignItems: 'center' }}>
              {i > 0 && <Box aria-hidden sx={{ width: 20, height: '1px', bgcolor: 'divider', mx: 0.75 }} />}
              <ButtonBase
                onClick={() => onPick(n)}
                aria-current={state === 'active' ? 'step' : undefined}
                data-state={state}
                data-step={n}
                sx={(t) => ({
                  gap: 0.75,
                  px: 1,
                  py: 0.5,
                  borderRadius: '999px',
                  fontSize: 13,
                  color: state === 'pending' ? 'text.secondary' : 'text.primary',
                  '&:hover': { bgcolor: t.palette.action.hover },
                  '&:focus-visible': { outline: `2px solid ${t.palette.primary.main}`, outlineOffset: '2px' },
                })}
              >
                <Box
                  component="span"
                  aria-hidden
                  sx={(t) => {
                    const c = state === 'active' ? t.palette.primary.main : state === 'done' ? t.palette.success.main : null
                    return { width: 20, height: 20, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0, color: c ? '#ffffff' : 'text.secondary', bgcolor: c ?? 'transparent', border: c ? 0 : `1px solid ${t.palette.divider}` }
                  }}
                >
                  {s.done ? '✓' : n}
                </Box>
                <Box component="span" sx={{ fontWeight: state === 'active' ? 700 : 500 }}>{s.label}</Box>
                {s.summary && <Box component="span" sx={{ color: 'text.secondary', fontSize: 12 }} data-testid={`reloc-step-summary-${n}`}>· {s.summary}</Box>}
                {s.done && <Box component="span" sx={VISUALLY_HIDDEN}>{vi ? ' (đã xong)' : ' (done)'}</Box>}
              </ButtonBase>
            </Box>
          )
        })}
      </Stack>
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
  const { requests, loading, persistent, create, get: getRequest, uploadDrawing } = useRelocationRequests()
  const pendingCodes = useMemo(() => pendingCodesOf(requests), [requests])
  const [afterLayoutId, setAfterLayoutId] = useState<LayoutId | null>(null)
  /** Before map layout chosen by the user (browsing); null = follow the selected machines. */
  const [viewBefore, setViewBefore] = useState<LayoutId | null>(null)
  /** Zone whose machine list is open. */
  const [openZone, setOpenZone] = useState<string | null>(null)
  const [mapSettings, updateMapSettings] = useMapViewSettings()
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
      use3d: mapSettings.image3d,
      highlightZone: hoverZone,
      ...(scrollSync ? { view: { zoomIndex: sharedZoom, ...sharedScroll.current }, onViewChange: onSharedViewChange, scrollSync } : {}),
      ctx,
    }),
    [mapSettings.showAll, mapSettings.showCounts, mapSettings.image3d, hoverZone, scrollSync, sharedZoom, onSharedViewChange, ctx],
  )
  const [form, setForm] = useState<RelocationFormValues>(EMPTY_FORM)
  /** "Only my requests" filter of the submitted table. */
  const [mineOnly, setMineOnly] = useState(false)
  const isMine = (r: RelocationRequest) => r.requestedBy.trim().toLowerCase() === account.trim().toLowerCase()
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [lastCreated, setLastCreated] = useState<{ id: string; count: number; skipped: readonly string[]; drawing: DrawingState } | null>(null)
  /** Export input and PNG per request, kept for "retry" and "download" (the draft is reset after a submit). */
  const exportInputs = useRef(new Map<string, RelocationExportInput>())
  const pngs = useRef(new Map<string, Blob>())
  /** Requests of the table whose drawing is being re-uploaded, and the last re-upload error. */
  const [tableUploads, setTableUploads] = useState<ReadonlySet<string>>(new Set())
  const [drawingError, setDrawingError] = useState<string | null>(null)
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
  // 0 -> >=1 machines: flash the destination card and announce the next step; the focus stays where it is.
  const [pulse, setPulse] = useState(false)
  const [announce, setAnnounce] = useState('')
  const prevCount = useRef(pickedCount)
  useEffect(() => {
    const prev = prevCount.current
    prevCount.current = pickedCount
    if (prev !== 0 || pickedCount === 0) return
    setPulse(true)
    setAnnounce(vi ? `Đã chọn ${pickedCount} máy. Tiếp theo: chọn vị trí đích.` : `${pickedCount} ${pickedCount === 1 ? 'machine' : 'machines'} selected. Next: pick the destination.`)
  }, [pickedCount, vi])
  useEffect(() => {
    if (!pulse) return
    const t = setTimeout(() => setPulse(false), PULSE_MS)
    return () => clearTimeout(t)
  }, [pulse])
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
  /** Export (once) + upload; a failure keeps the request, the banner offers "retry". */
  const saveDrawing = async (id: string) => {
    setDrawing(id, { status: 'saving' })
    try {
      const saved = await uploadDrawing(id, await pngOf(id))
      setDrawing(id, { status: 'saved', webUrl: saved.webUrl, fileName: saved.fileName })
    } catch {
      setDrawing(id, { status: 'failed' })
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
      setLastCreated({ id: created.id, count: created.items.length, skipped: created.skipped, drawing: { status: 'saving' } })
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
          severity={lastCreated.drawing.status === 'failed' ? 'warning' : 'success'}
          onClose={() => setLastCreated(null)}
          data-testid="reloc-created"
          data-drawing={lastCreated.drawing.status}
          action={
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              {lastCreated.drawing.status === 'failed' && (
                <Button size="small" color="inherit" variant="outlined" onClick={() => void saveDrawing(lastCreated.id)}>
                  {vi ? 'Thử lại' : 'Retry'}
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
            : vi
              ? `Đã tạo ${lastCreated.id} (${lastCreated.count} máy)`
              : `Created ${lastCreated.id} (${lastCreated.count} ${lastCreated.count === 1 ? 'machine' : 'machines'})`}
          {lastCreated.drawing.status === 'saving' && (vi ? ' · Đang lưu bản vẽ...' : ' · Saving the drawing...')}
          {lastCreated.drawing.status === 'saved' && (
            <>
              {vi ? ' · Đã lưu bản vẽ' : ' · Drawing saved'}
              {' '}
              {lastCreated.drawing.webUrl ? (
                <Link href={lastCreated.drawing.webUrl} target="_blank" rel="noopener noreferrer" data-testid="reloc-drawing-link">
                  {vi ? 'Mở file' : 'Open file'}
                </Link>
              ) : (
                `(${lastCreated.drawing.fileName})`
              )}
            </>
          )}
          {lastCreated.skipped.length > 0 &&
            (vi ? ` · Bỏ qua (đã ở vị trí đích): ${lastCreated.skipped.join(', ')}` : ` · Skipped (already at the destination): ${lastCreated.skipped.join(', ')}`)}
        </Alert>
      )}
      {drawingError && <Alert severity="error" onClose={() => setDrawingError(null)}>{drawingError}</Alert>}

      <RelocationStepper lang={lang} steps={steps} active={step} onPick={pickStep} />
      <Box role="status" aria-live="polite" data-testid="reloc-next-hint" sx={VISUALLY_HIDDEN}>{announce}</Box>

      {/* Pick machines + destination side by side (3fr / 2fr) from lg, stacked below; equal heights only when both have content. */}
      <Box data-testid="reloc-row-pick" data-align={rowAlign} sx={{ display: 'grid', gap: density.gap, alignItems: rowAlign, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 3fr) minmax(0, 2fr)' } }}>
      <SectionCard
        title={vi ? '1. Chọn máy' : '1. Pick machines'}
        actions={<SelectionSummary lang={lang} selectedRows={draft.selectedRows} onClear={draft.clear} />}
        sx={[rowAlign === 'stretch' && { height: '100%' }, step === 1 && activeCardSx]}
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

      <SectionCard title={vi ? '2. Vị trí đích' : '2. Destination'} sx={[rowAlign === 'stretch' && { height: '100%' }, step === 2 && activeCardSx, pulse && pulseCardSx]}>
        <Box ref={destBox} onFocus={() => setStep(2)} data-testid="reloc-dest" data-pulse={pulse || undefined}>
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

      <RelocationMapToolbar lang={lang} settings={mapSettings} onChange={updateMapSettings} />

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

        <SectionCard title={vi ? '4. Thông tin yêu cầu' : '4. Request details'} sx={[rowAlign === 'stretch' && { height: '100%' }, step === 3 && activeCardSx]}>
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
        <RelocationRequestsTable lang={lang} requests={mineOnly ? requests.filter(isMine) : requests} loading={loading} onReupload={(r) => void reupload(r)} uploading={tableUploads} />
      </SectionCard>
    </Stack>
  )
}
