import { Autocomplete, Box, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import type { LayoutId } from '../../data/mapData'
import type { Lang } from '../../types/fixedAsset'
import type { RelocationTarget } from '../../types/relocation'
import { glassFilterControls } from '../../theme/liquidGlass'
import { facLabel } from '../../config/relocation'
import { catalogFacs, catalogLayouts, catalogOptions, unplacedZones, type CatalogOption, type LocationCatalog } from '../../utils/locationCatalog'
import { isMajorZone } from '../../utils/relocationInput'
import type { RelocationLayout } from './RelocationFloorMap'

interface Props {
  lang: Lang
  layouts: readonly RelocationLayout[]
  /** Layout chosen for the After map (may be set before a zone is picked). */
  layoutId: LayoutId | null
  target: RelocationTarget | null
  /** Destination zones from GET /api/locations joined with the drawings (buildLocationCatalog). */
  catalog: LocationCatalog
  onLayoutChange: (id: LayoutId | null) => void
  onTargetChange: (target: RelocationTarget | null) => void
}

export function countLabel(code: string, count: number, vi: boolean) {
  const base = `${count} ${vi ? 'máy' : count === 1 ? 'machine' : 'machines'}`
  return isMajorZone(code) ? `${base} (${vi ? 'gồm khu con' : 'incl. sub-zones'})` : base
}

/**
 * Building (API fac) → Floor (layout) → Zone, listing only zones from the API (Outside excluded; undrawn zones stay
 * pickable).
 * Controlled by `layoutId`/`target`, so a click on the After map updates it too.
 */
export function TargetLocationSelect({ lang, layouts: allLayouts, layoutId, target, catalog, onLayoutChange, onTargetChange }: Props) {
  const vi = lang === 'vi'
  const buildings = useMemo(() => catalogFacs(catalog), [catalog])
  const unplaced = useMemo(() => unplacedZones(catalog), [catalog])
  const layout = catalogLayouts(catalog, allLayouts).find((l) => l.id === layoutId) ?? null
  const [building, setBuilding] = useState('')
  // Follow changes from outside (map click, reset): the target's fac, else keep the building if the layout has it.
  const targetFac = target ? (catalog.zones.get(target.zone)?.fac ?? null) : null
  useEffect(() => {
    if (targetFac) return setBuilding(targetFac)
    if (!layout) return
    const facs = catalogFacs(catalog, layout.id)
    setBuilding((b) => (facs.includes(b) ? b : (facs[0] ?? '')))
  }, [targetFac, layout, catalog])

  const floors = useMemo(() => (building ? catalogLayouts(catalog, allLayouts, building) : []), [catalog, allLayouts, building])
  const options = useMemo(() => (layout && building ? catalogOptions(catalog, layout.id, building) : []), [catalog, layout, building])
  const value = (target && target.layoutId === layoutId && options.find((o) => o.code === target.zone)) || null

  return (
    <Stack spacing={1}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={(theme) => ({ ...glassFilterControls(theme), '& > *': { flex: 1, minWidth: 0 } })}>
        <TextField
          select
          size="small"
          label={vi ? 'Toà nhà' : 'Building'}
          value={building}
          onChange={(e) => {
            setBuilding(e.target.value)
            onLayoutChange(null)
            onTargetChange(null)
          }}
        >
          {buildings.map((b) => <MenuItem key={b} value={b}>{facLabel(b, vi)}</MenuItem>)}
        </TextField>
        <TextField
          select
          size="small"
          label={vi ? 'Tầng' : 'Floor'}
          value={layout && floors.some((l) => l.id === layout.id) ? layout.id : ''}
          disabled={!building}
          onChange={(e) => {
            onLayoutChange(e.target.value as LayoutId)
            onTargetChange(null)
          }}
        >
          {floors.map((l) => <MenuItem key={l.id} value={l.id}>{l.title}</MenuItem>)}
        </TextField>
        <Autocomplete<CatalogOption>
          size="small"
          disabled={!layout || !building}
          options={options}
          value={value}
          groupBy={(o) => o.group}
          getOptionLabel={(o) => o.code}
          getOptionDisabled={(o) => o.disabled}
          isOptionEqualToValue={(a, b) => a.code === b.code}
          onChange={(_, next) => onTargetChange(next && layout ? { layoutId: layout.id, zone: next.code } : null)}
          renderOption={({ key, ...props }, o) => (
            <li key={key} {...props}>
              <Box component="span" sx={{ flex: 1, fontWeight: isMajorZone(o.code) ? 600 : 400, pl: isMajorZone(o.code) ? 0 : 1.5 }}>{o.code}</Box>
              <Typography variant="caption" color="text.secondary">
                {o.disabled ? (vi ? 'có khu con' : 'has sub-zones') : countLabel(o.code, o.count, vi)}
                {!o.drawn && ` · ${vi ? 'không có trên bản vẽ' : 'not on the drawing'}`}
              </Typography>
            </li>
          )}
          noOptionsText={vi ? 'Không có zone' : 'No zones'}
          renderInput={(params) => <TextField {...params} label="Zone" placeholder={vi ? 'Chọn zone đích' : 'Pick destination zone'} />}
        />
      </Stack>
      {unplaced.length > 0 && (
        <Typography variant="caption" color="text.secondary" data-testid="unplaced-zones">
          {vi ? 'Zone chưa gắn với sơ đồ nào (không chọn được)' : 'Zones not tied to any layout (not selectable)'}: {unplaced.join(', ')}
        </Typography>
      )}
    </Stack>
  )
}
