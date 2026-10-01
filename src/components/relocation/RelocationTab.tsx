import { alpha, Alert, Box, ButtonBase, Stack, Typography } from '@mui/material'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { facLabel } from '../../config/relocation'
import { FLOORS, ZONE_INDEX, type LayoutId } from '../../data/mapData'
import { useAssetsWithLocation, useLocations } from '../../hooks/useLocations'
import { useMapViewSettings } from '../../hooks/useMapViewSettings'
import { useRelocationDraft } from '../../hooks/useRelocationDraft'
import { useRelocationRequests } from '../../hooks/useRelocationRequests'
import type { Lang } from '../../types/fixedAsset'
import type { AssetLocation, LocationZone } from '../../types/location'
import type { RelocationTarget } from '../../types/relocation'
import { density } from '../../theme/density'
import { tokens } from '../../theme/palette'
import { buildLocationCatalog, catalogFacs, catalogTray, isCatalogTarget, isOutsideAsset } from '../../utils/locationCatalog'
import { buildIndexes, buildTray, movers, moveTypeOf, rowFac, rowLayoutId, targetFac, type RelocationContext } from '../../utils/relocation'
import { EMPTY_FORM, type RelocationFormValues } from '../../utils/relocationForm'
import { buildRequestItems, pendingCodesOf, rowsInZone, sourceZonesByFac } from '../../utils/relocationInput'
import { SectionCard } from '../common/SectionCard'
import { DEFAULT_MAP_VIEW, type MapView } from '../map/MapScene'
import { ErrorState, LoadingState } from '../common/States'
import { MachinePicker, SelectionSummary } from './MachinePicker'
import { RelocationFloorMap } from './RelocationFloorMap'
import { RelocationForm } from './RelocationForm'
import { RelocationRequestsTable } from './RelocationRequestsTable'
import { RelocationSummary } from './RelocationSummary'
import { RouteLine, TargetLocationSelect, type Route, type RouteBadge } from './TargetLocationSelect'
import { RelocationMapToolbar } from './RelocationMapToolbar'
import { ZoneBrowseSelect } from './ZoneBrowseSelect'
import { ZoneMachineList } from './ZoneMachineList'

const MAP = tokens.light // Solid state colours with white text: the same in both theme modes.
/** Space reserved above each map for its card info (pills / banner / route), so both map frames line up. */
const MAP_INFO_MIN_H = 76

/** Map card title: 12px colour square + bold title. */
function CardTitle({ color, children }: { color: string; children: ReactNode }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, fontWeight: 700 }}>
      <Box component="span" aria-hidden sx={{ width: 12, height: 12, borderRadius: '2px', bgcolor: color, flexShrink: 0 }} />
      {children}
    </Box>
  )
}

/** Relocation request tab: assets and zones come from the location API (Factory 2, every div), never from static data. */
export default function RelocationTab({ lang }: { lang: Lang }) {
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
  return <RelocationWorkspace lang={lang} rows={assets.data} locations={locations.data} />
}

function RelocationWorkspace({ lang, rows, locations }: { lang: Lang; rows: readonly AssetLocation[]; locations: readonly LocationZone[] }) {
  const vi = lang === 'vi'
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
  const { requests, loading, persistent, create } = useRelocationRequests()
  const pendingCodes = useMemo(() => pendingCodesOf(requests), [requests])
  const [afterLayoutId, setAfterLayoutId] = useState<LayoutId | null>(null)
  /** Before map layout chosen by the user (browsing); null = follow the selected machines. */
  const [viewBefore, setViewBefore] = useState<LayoutId | null>(null)
  /** Zone whose machine list is open. */
  const [openZone, setOpenZone] = useState<string | null>(null)
  const [mapSettings, updateMapSettings] = useMapViewSettings()
  /** Zone of the selected-machine row being hovered: flashed on both maps. */
  const [hoverZone, setHoverZone] = useState<string | null>(null)
  // Shared zoom/scroll while "Sync zoom" is on; each map keeps its own otherwise.
  const [sharedView, setSharedView] = useState<MapView>(DEFAULT_MAP_VIEW)
  const mapProps = {
    showAll: mapSettings.showAll,
    showCounts: mapSettings.showCounts,
    highlightZone: hoverZone,
    ...(mapSettings.syncZoom ? { view: sharedView, onViewChange: setSharedView } : {}),
    ctx,
  }
  const [form, setForm] = useState<RelocationFormValues>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [lastId, setLastId] = useState<string | null>(null)

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
  const moverCount = draft.target ? movers(draft.selectedRows, draft.target, ctx).length : 0

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

  const setTarget = (target: RelocationTarget | null) => {
    if (target) setAfterLayoutId(target.layoutId)
    draft.setTarget(target)
  }
  const pickOnMap = (target: RelocationTarget) => {
    if (isCatalogTarget(catalog, target.layoutId, target.zone)) setTarget(target)
  }

  const submit = async (values: RelocationFormValues) => {
    if (!draft.target) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const created = await create({
        items: buildRequestItems(draft.selectedRows, draft.target, ctx),
        to: draft.target,
        requestedBy: values.requestedBy.trim(),
        dStart: values.dStart,
        dEnd: values.dEnd,
        reason: values.reason.trim(),
      })
      setLastId(created.id)
      draft.reset()
      setAfterLayoutId(null)
      setViewBefore(null)
      setOpenZone(null)
      setForm(EMPTY_FORM)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e))
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
      {lastId && <Alert severity="success" onClose={() => setLastId(null)}>{vi ? `Đã gửi yêu cầu ${lastId}.` : `Request ${lastId} submitted.`}</Alert>}

      {/* Pick machines + destination side by side (3fr / 2fr) from lg, stacked below; equal heights. */}
      <Box sx={{ display: 'grid', gap: density.gap, alignItems: 'stretch', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 3fr) minmax(0, 2fr)' } }}>
      <SectionCard
        title={vi ? '1. Chọn máy' : '1. Pick machines'}
        actions={<SelectionSummary lang={lang} selectedRows={draft.selectedRows} onClear={draft.clear} />}
        sx={{ height: '100%' }}
      >
        <MachinePicker
          lang={lang}
          rows={rows}
          byCode={byCode}
          selected={draft.selected}
          selectedRows={draft.selectedRows}
          pendingCodes={pendingCodes}
          isOutside={isOutside}
          facOf={facOf}
          onHoverZone={setHoverZone}
          onAdd={draft.add}
          onRemove={draft.remove}
          onClear={draft.clear}
        />
      </SectionCard>

      <SectionCard title={vi ? '2. Vị trí đích' : '2. Destination'} sx={{ height: '100%' }}>
        <TargetLocationSelect
          lang={lang}
          layouts={FLOORS}
          layoutId={afterLayoutId}
          target={draft.target}
          catalog={catalog}
          onLayoutChange={setAfterLayoutId}
          onTargetChange={setTarget}
          route={route}
          routeColors={routeColors}
        />
      </SectionCard>
      </Box>

      <Stack spacing={1}>
        <RelocationMapToolbar lang={lang} settings={mapSettings} onChange={updateMapSettings} />
        <ZoneBrowseSelect lang={lang} zonesByFac={zonesByFac} zone={openZone} onOpenZone={openZoneFromList} />
      </Stack>

      {/* Two equal map columns (same frame ratio and fit); the zone machine list is a third column when open. */}
      <Box sx={{ display: 'grid', gap: density.gap, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: openZone ? 'repeat(2, minmax(0, 1fr)) 300px' : 'repeat(2, minmax(0, 1fr))' } }}>
        <SectionCard
          title={<CardTitle color={MAP.relocFrom}>{vi ? 'Bố trí hiện tại (Trước)' : 'Current layout (Before)'}</CardTitle>}
          description={beforePlace || undefined}
          sx={{ borderTop: `3px solid ${MAP.relocFrom}` }}
        >
          <Stack spacing={1} data-testid="reloc-before-card">
            <Box sx={{ minHeight: { lg: MAP_INFO_MIN_H } }}>
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
            </Box>
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
              <Typography variant="body2" color="text.secondary">
                {draft.selected.length
                  ? vi ? 'Máy đã chọn không nằm trên sơ đồ nào.' : 'Selected machines are not on any layout.'
                  : vi ? 'Chưa chọn máy. Chọn toà và zone ở trên để duyệt máy theo zone.' : 'No machine selected. Pick a building and zone above to browse machines.'}
              </Typography>
            )}
          </Stack>
        </SectionCard>
        <SectionCard
          title={<CardTitle color={MAP.relocTo}>{vi ? 'Bố trí sau di dời (Sau)' : 'Layout after relocation (After)'}</CardTitle>}
          description={destPlace || undefined}
          sx={afterBorder ? { border: afterBorder } : undefined}
        >
          <Stack spacing={1} data-testid="reloc-after-card" data-move={moveKind}>
            <Stack spacing={0.75} sx={{ minHeight: { lg: MAP_INFO_MIN_H } }}>
              {cross && target && (
                <Box
                  role="status"
                  data-testid="reloc-cross-banner"
                  sx={{ px: 1.5, py: 0.75, borderRadius: 1, fontSize: 13, fontWeight: 700, color: '#ffffff', bgcolor: MAP.relocCross }}
                >
                  {kinds.has('building') ? (vi ? 'Đổi toà' : 'Building change') : vi ? 'Đổi tầng' : 'Floor change'}: {sourcePlaces.join(', ')} → {destPlace}
                </Box>
              )}
              {route && <RouteLine lang={lang} route={route} fromColor={routeColors.from} toColor={routeColors.to} testId="reloc" />}
            </Stack>
          {afterLayout ? (
            <RelocationFloorMap
              lang={lang}
              layout={afterLayout}
              role="after"
              rows={draft.selectedRows}
              target={draft.target}
              onPickZone={pickOnMap}
              zoneCount={zoneCount}
              isPickable={(code) => isCatalogTarget(catalog, afterLayout.id, code)}
              extraTray={catalogTray(catalog, afterLayout.id)}
              {...mapProps}
            />
          ) : (
            <Typography variant="body2" color="text.secondary">{vi ? 'Chọn toà nhà và tầng đích.' : 'Pick the destination building and floor.'}</Typography>
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

      {/* Summary + request details side by side (11fr / 9fr) from lg, stacked below; equal heights. */}
      <Box sx={{ display: 'grid', gap: density.gap, alignItems: 'stretch', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 11fr) minmax(0, 9fr)' } }}>
        <SectionCard title={vi ? '3. Tóm tắt' : '3. Summary'} sx={{ height: '100%' }}>
          <RelocationSummary lang={lang} rows={draft.selectedRows} target={draft.target} zoneCount={zoneCount} ctx={ctx} />
        </SectionCard>

        <SectionCard title={vi ? '4. Thông tin yêu cầu' : '4. Request details'} sx={{ height: '100%' }}>
          <RelocationForm lang={lang} value={form} onChange={setForm} moverCount={moverCount} submitting={submitting} error={submitError} onSubmit={submit} />
        </SectionCard>
      </Box>

      <SectionCard title={vi ? 'Yêu cầu đã gửi' : 'Submitted requests'}>
        <RelocationRequestsTable lang={lang} requests={requests} loading={loading} />
      </SectionCard>
    </Stack>
  )
}
