import { alpha, Box, Button, FormControlLabel, Stack, Switch, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import ViewInArOutlined from '@mui/icons-material/ViewInArOutlined'
import type { MapViewSettings } from '../../hooks/useMapViewSettings'
import type { Lang } from '../../types/fixedAsset'
import { glassFloating, glassRadius } from '../../theme/liquidGlass'
import { tokens } from '../../theme/palette'
import { FOCUS } from './RelocationFloorMap'

const MAP = tokens.light

/** Legend swatch: fill + border style, so states differ by more than colour. */
function Swatch({ color, fill = 0.28, dashed = false, label }: { color: string; fill?: number; dashed?: boolean; label: string }) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
      <Box aria-hidden sx={{ width: 16, height: 12, borderRadius: '3px', bgcolor: alpha(color, fill), border: `2px ${dashed ? 'dashed' : 'solid'} ${color}` }} />
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Stack>
  )
}

interface Props {
  lang: Lang
  settings: MapViewSettings
  onChange: (patch: Partial<MapViewSettings>) => void
  /** "Xem 3D": opens the 3D dialog. */
  onOpen3d?: () => void
}

/** Controls shared by the Before and After maps. */
export function RelocationMapToolbar({ lang, settings, onChange, onOpen3d }: Props) {
  const vi = lang === 'vi'
  return (
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      spacing={{ xs: 1, md: 2 }}
      useFlexGap
      role="toolbar"
      aria-label={vi ? 'Tuỳ chọn sơ đồ' : 'Map options'}
      sx={(theme) => ({ ...glassFloating(theme, glassRadius.bar), position: 'relative', px: 1.5, py: 1, alignItems: { md: 'center' }, flexWrap: 'wrap' })}
    >
      <ToggleButtonGroup
        size="small"
        exclusive
        value={settings.showAll ? 'all' : 'relevant'}
        onChange={(_, v: 'all' | 'relevant' | null) => v && onChange({ showAll: v === 'all' })}
        aria-label={vi ? 'Zone hiển thị' : 'Zones shown'}
      >
        <ToggleButton value="all">{vi ? 'Tất cả zone' : 'All zones'}</ToggleButton>
        <ToggleButton value="relevant">{vi ? 'Chỉ liên quan' : 'Related only'}</ToggleButton>
      </ToggleButtonGroup>
      <FormControlLabel
        control={<Switch size="small" checked={settings.showCounts} onChange={(e) => onChange({ showCounts: e.target.checked })} />}
        label={<Typography variant="body2">{vi ? 'Hiện số máy' : 'Show machine counts'}</Typography>}
      />
      <FormControlLabel
        control={<Switch size="small" checked={settings.syncZoom} onChange={(e) => onChange({ syncZoom: e.target.checked })} />}
        label={<Typography variant="body2">{vi ? 'Đồng bộ zoom' : 'Sync zoom'}</Typography>}
      />
      {onOpen3d && (
        <Button size="small" variant="outlined" startIcon={<ViewInArOutlined />} onClick={onOpen3d} data-testid="reloc-open-3d" sx={{ alignSelf: { xs: 'flex-start', md: 'center' }, whiteSpace: 'nowrap' }}>
          {vi ? 'Xem 3D' : '3D view'}
        </Button>
      )}
      <Box sx={{ flex: 1, display: { xs: 'none', md: 'block' } }} />
      <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap' }} aria-label={vi ? 'Chú giải' : 'Legend'} data-testid="reloc-legend">
        <Swatch color={FOCUS.from.color} fill={1} label={vi ? 'Vị trí hiện tại' : 'Current location'} />
        <Swatch color={FOCUS.old.color} fill={FOCUS.old.fill} dashed label={vi ? 'Vị trí cũ' : 'Old location'} />
        <Swatch color={MAP.relocTo} label={vi ? 'Vị trí mới' : 'New location'} />
        <Swatch color={MAP.relocCross} label={vi ? 'Từ/Sang toà khác' : 'From/To another building'} />
      </Stack>
    </Stack>
  )
}
