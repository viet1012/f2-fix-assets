import { Autocomplete, MenuItem, Stack, TextField } from '@mui/material'
import { useEffect, useState } from 'react'
import { facLabel } from '../../config/relocation'
import type { Lang } from '../../types/fixedAsset'
import { glassFilterControls } from '../../theme/liquidGlass'
import type { SourceZone } from '../../utils/relocationInput'

interface Props {
  lang: Lang
  /** Building (fac, '' = unknown) -> zones where assets are now (sourceZonesByFac). */
  zonesByFac: ReadonlyMap<string, readonly SourceZone[]>
  /** Zone whose machine list is open. */
  zone: string | null
  onOpenZone: (zone: string | null) => void
}

/** Select value for assets whose building is unknown ('' in zonesByFac), distinct from "nothing chosen". */
const UNKNOWN = '__unknown__'
const toValue = (fac: string) => fac || UNKNOWN
const fromValue = (value: string) => (value === UNKNOWN ? '' : value)

/** Building → Zone: the dropdown way to open a zone's machine list (same as clicking it on the Before map). */
export function ZoneBrowseSelect({ lang, zonesByFac, zone, onOpenZone }: Props) {
  const vi = lang === 'vi'
  const facOfZone = (code: string | null) => (code === null ? undefined : [...zonesByFac].find(([, zs]) => zs.some((z) => z.code === code))?.[0])
  // null = no building chosen yet.
  const [fac, setFac] = useState<string | null>(() => facOfZone(zone) ?? null)
  // Follow zones opened from the map.
  const openedFac = facOfZone(zone)
  useEffect(() => {
    if (openedFac !== undefined) setFac(openedFac)
  }, [openedFac])
  const options = fac === null ? [] : (zonesByFac.get(fac) ?? [])
  const label = (f: string) => (f ? facLabel(f, vi) : vi ? 'Chưa xác định toà' : 'Unknown building')

  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={(theme) => ({ ...glassFilterControls(theme), '& > *': { flex: 1, minWidth: 0 } })}>
      <TextField
        select
        size="small"
        label={vi ? 'Toà nhà (vị trí hiện tại)' : 'Building (current location)'}
        value={fac !== null && zonesByFac.has(fac) ? toValue(fac) : ''}
        onChange={(e) => {
          setFac(fromValue(e.target.value))
          onOpenZone(null)
        }}
      >
        {[...zonesByFac.keys()].map((f) => <MenuItem key={toValue(f)} value={toValue(f)}>{label(f)}</MenuItem>)}
      </TextField>
      <Autocomplete<SourceZone>
        size="small"
        disabled={fac === null || !zonesByFac.has(fac)}
        options={options as SourceZone[]}
        value={options.find((z) => z.code === zone) ?? null}
        getOptionLabel={(z) => z.code}
        isOptionEqualToValue={(a, b) => a.code === b.code}
        onChange={(_, next) => onOpenZone(next?.code ?? null)}
        renderOption={({ key, ...props }, z) => (
          <li key={key} {...props}>
            <span style={{ flex: 1 }}>{z.code}</span>
            <span style={{ opacity: 0.7, fontSize: 12 }}>{z.count} {vi ? 'máy' : z.count === 1 ? 'machine' : 'machines'}</span>
          </li>
        )}
        noOptionsText={vi ? 'Không có zone' : 'No zones'}
        renderInput={(params) => <TextField {...params} label={vi ? 'Duyệt theo zone' : 'Browse by zone'} />}
      />
    </Stack>
  )
}
