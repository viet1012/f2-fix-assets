import { Alert, Autocomplete, Box, Card, Stack, Tab, Tabs, TextField, Typography } from '@mui/material'
import { useMemo, useState } from 'react'
import { FLOORS } from '../../data/legacyData'
import type { FixedAsset, Lang } from '../../types/fixedAsset'
import { uniq } from '../../utils/fixedAsset'
import { FloorMap, type MapZone } from './FloorMap'
import { ZoneDetailPanel } from './ZoneDetailPanel'
import { density } from '../../theme/density'
import { glassFilterControls, glassFloating, glassRadius, glassTabs } from '../../theme/liquidGlass'

// The layout images only cover Factory 2 / KVH division.
const MAP_FACTORY = 'Factory 2'
const MAP_DIV = 'KVH'

function normalize(value?: string | null) {
  return (value ?? '').trim().toLowerCase()
}
function posTokens(position?: string | null) {
  return (position ?? '').trim().split(/\s+/).filter(Boolean)
}
function matchesZone(row: FixedAsset, code: string) {
  return posTokens(row.position).some((token) => token === code || token.startsWith(`${code}-`))
}
/** DB floor value for a layout, taken from its title ("Floor 1 - Press" -> "1F"). */
function layoutDbFloor(title: string): string | null {
  const m = /^Floor\s+(\d+)\b/i.exec(title)
  return m ? `${m[1]}F` : null
}

function LegendDot({ color, label, ring = false }: { color: string; label: string; ring?: boolean }) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
      <Box aria-hidden sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: color, border: '2px solid #fff', boxShadow: ring ? (t) => `0 0 0 2px ${t.palette.error.light}` : '0 0 0 1px rgba(0,0,0,.15)' }} />
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Stack>
  )
}

export default function MapTab({ rows, lang }: { rows: FixedAsset[]; lang: Lang }) {
  const vi = lang === 'vi'
  const [floorIndex, setFloorIndex] = useState(0)
  const [pic, setPic] = useState('')
  const [zone, setZone] = useState('')
  const base = useMemo(
    () => rows.filter((r) => normalize(r.factory) === normalize(MAP_FACTORY) && normalize(r.div) === normalize(MAP_DIV)),
    [rows],
  )
  const pics = useMemo(() => uniq(base.map((r) => r.pic)), [base])
  const floor = FLOORS[floorIndex]
  const dbFloor = layoutDbFloor(floor.title)
  const visible = useMemo(() => {
    let result = base
    if (dbFloor) result = result.filter((r) => normalize(r.floor) === normalize(dbFloor))
    if (pic) result = result.filter((r) => r.pic === pic)
    return result
  }, [base, dbFloor, pic])
  const selectedRows = useMemo(() => (zone ? visible.filter((r) => matchesZone(r, zone)) : []), [visible, zone])
  const zones: MapZone[] = useMemo(
    () => floor.zones.map((z) => ({ code: z.code, x: z.x, y: z.y, count: visible.filter((r) => matchesZone(r, z.code)).length })),
    [floor, visible],
  )

  return (
    <Stack spacing={density.gap}>
      {/* Floating glass control layer (no opaque card behind it). */}
      <Stack spacing={1}>
        <Box sx={{ display: 'flex' }}>
          <Tabs
            sx={(theme) => ({ ...glassTabs(theme), maxWidth: '100%', width: 'fit-content' })}
            value={floorIndex}
            onChange={(_, i: number) => { setFloorIndex(i); setZone('') }}
            variant="scrollable"
            scrollButtons="auto"
            aria-label={vi ? 'Chọn tầng / khu vực' : 'Select floor / area'}
          >
            {FLOORS.map((f, i) => <Tab key={f.id} value={i} label={f.title} />)}
          </Tabs>
        </Box>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} useFlexGap sx={{ alignItems: { md: 'center' }, flexWrap: { md: 'wrap' } }}>
          <Autocomplete
            options={pics}
            value={pic || null}
            onChange={(_, next) => { setPic(next ?? ''); setZone('') }}
            isOptionEqualToValue={(opt, val) => opt === val}
            autoHighlight
            sx={(theme) => ({ ...glassFilterControls(theme), width: { xs: '100%', md: 280 } })}
            noOptionsText={vi ? 'Không có giá trị' : 'No options'}
            renderInput={(params) => <TextField {...params} label="PIC Checked" placeholder={vi ? 'Tất cả PIC' : 'All PIC'} />}
          />
          <Typography variant="body2" color="text.secondary" aria-live="polite">
            {vi ? 'Tài sản trong phạm vi sơ đồ' : 'Assets in map scope'}: <Box component="strong" sx={{ color: 'text.primary' }}>{visible.length.toLocaleString()}</Box>
            {zone ? ` · ${zone}: ${selectedRows.length}` : ''}
          </Typography>
          <Alert severity="warning" variant="standard" sx={{ py: 0, px: 1.25, '& .MuiAlert-icon': { mr: 1 } }}>
            {vi ? 'Sơ đồ layout chỉ áp dụng cho Factory 2 (KVH).' : 'Layout map applies to Factory 2 (KVH) only.'}
          </Alert>
          <Box sx={{ flex: 1, display: { xs: 'none', md: 'block' } }} />
          <Stack direction="row" spacing={2} useFlexGap sx={(theme) => ({ ...glassFloating(theme, glassRadius.capsule), position: 'relative', flexWrap: 'wrap', px: 1.5, py: 0.75 })} aria-label={vi ? 'Chú giải' : 'Legend'}>
            <LegendDot color="#2563eb" label={vi ? 'Có tài sản (số lượng)' : 'Has assets (count)'} />
            <LegendDot color="#64748b" label={vi ? 'Không có tài sản' : 'No assets'} />
            <LegendDot color="error.main" label={vi ? 'Đang chọn' : 'Selected'} ring />
          </Stack>
        </Stack>
      </Stack>

      <Box sx={{ display: 'grid', gap: density.gap, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 320px' } }}>
        <Card sx={{ minHeight: 480, height: { lg: 640 } }}>
          <FloorMap
            lang={lang}
            key={floor.id}
            title={floor.title}
            imageData={floor.imageData}
            imgW={floor.imgW}
            imgH={floor.imgH}
            zones={zones}
            selectedZone={zone}
            onSelectZone={setZone}
          />
        </Card>
        <Card sx={{ height: { xs: 420, lg: 640 } }}>
          <ZoneDetailPanel lang={lang} zone={zone} rows={selectedRows} zones={zones} onSelectZone={setZone} />
        </Card>
      </Box>
    </Stack>
  )
}
