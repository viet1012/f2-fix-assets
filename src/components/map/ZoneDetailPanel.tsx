import { Box, Chip, Divider, IconButton, List, ListItem, ListItemButton, ListItemText, Stack, Tooltip, Typography } from '@mui/material'
import CloseRounded from '@mui/icons-material/CloseRounded'
import TouchAppOutlined from '@mui/icons-material/TouchAppOutlined'
import type { FixedAsset, Lang } from '../../types/fixedAsset'
import { formatMoney } from '../../utils/fixedAsset'
import { EmptyState } from '../common/States'
import type { MapZone } from './FloorMap'

interface Props {
  lang: Lang
  zone: string
  rows: FixedAsset[]
  zones: MapZone[]
  onSelectZone: (code: string) => void
}

const LIST_LIMIT = 100

export function ZoneDetailPanel({ lang, zone, rows, zones, onSelectZone }: Props) {
  const vi = lang === 'vi'

  if (!zone) {
    const ranked = zones.filter((z) => z.count > 0).sort((a, b) => b.count - a.count)
    return (
      <Stack sx={{ height: '100%', minHeight: 0 }}>
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="subtitle1" component="h3">{vi ? 'Khu vực trên tầng này' : 'Zones on this floor'}</Typography>
          <Typography variant="caption" color="text.secondary">
            {vi ? 'Chọn khu vực trên sơ đồ hoặc trong danh sách để xem chi tiết.' : 'Select a zone on the map or in the list to view assets.'}
          </Typography>
        </Box>
        <Divider />
        {ranked.length === 0 ? (
          <EmptyState compact icon={<TouchAppOutlined />} title={vi ? 'Không có tài sản trên tầng này' : 'No assets on this floor'} />
        ) : (
          <List dense disablePadding sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            {ranked.map((z) => (
              <ListItemButton key={z.code} onClick={() => onSelectZone(z.code)} sx={{ py: 0.5 }}>
                <ListItemText primary={z.code} slotProps={{ primary: { sx: { fontWeight: 600, fontSize: '0.8125rem' } } }} />
                <Chip size="small" label={z.count.toLocaleString()} />
              </ListItemButton>
            ))}
          </List>
        )}
      </Stack>
    )
  }

  const totalValue = rows.reduce((s, r) => s + Number(r.cost || 0), 0)
  return (
    <Stack sx={{ height: '100%', minHeight: 0 }}>
      <Stack direction="row" sx={{ px: 2, py: 1.5, alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="overline" color="text.secondary">{vi ? 'Khu vực' : 'Zone'}</Typography>
          <Typography variant="h2" component="h3">{zone}</Typography>
        </Box>
        <Tooltip title={vi ? 'Bỏ chọn khu vực' : 'Clear selection'}>
          <IconButton size="small" aria-label={vi ? 'Bỏ chọn khu vực' : 'Clear selection'} onClick={() => onSelectZone('')}>
            <CloseRounded fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      <Box sx={{ px: 2, pb: 1.5, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
        <Box sx={{ bgcolor: 'action.hover', borderRadius: 1.5, px: 1.25, py: 0.75 }}>
          <Typography variant="overline" color="text.secondary" component="div">{vi ? 'Tài sản' : 'Assets'}</Typography>
          <Typography sx={{ fontWeight: 700, fontSize: '1rem' }}>{rows.length.toLocaleString()}</Typography>
        </Box>
        <Box sx={{ bgcolor: 'action.hover', borderRadius: 1.5, px: 1.25, py: 0.75, minWidth: 0 }}>
          <Typography variant="overline" color="text.secondary" component="div">{vi ? 'Giá trị' : 'Value'}</Typography>
          <Typography sx={{ fontWeight: 700, fontSize: '1rem' }} noWrap>{formatMoney(totalValue)}</Typography>
        </Box>
      </Box>
      <Divider />
      {rows.length === 0 ? (
        <EmptyState compact title={vi ? 'Không có tài sản trong khu vực này' : 'No assets in this zone'} />
      ) : (
        <>
          <List dense disablePadding sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            {rows.slice(0, LIST_LIMIT).map((r) => (
              <ListItem key={r.code} divider sx={{ display: 'block', py: 0.75 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '0.78rem' }}>{r.code}</Typography>
                <Typography variant="body2" sx={{ lineHeight: 1.35 }}>{r.name}</Typography>
                <Typography variant="caption" color="text.secondary">{r.pic} · {formatMoney(r.cost)}</Typography>
              </ListItem>
            ))}
          </List>
          {rows.length > LIST_LIMIT && (
            <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 1, borderTop: 1, borderColor: 'divider' }}>
              {vi ? `Hiển thị ${LIST_LIMIT} / ${rows.length}` : `Showing ${LIST_LIMIT} of ${rows.length}`}
            </Typography>
          )}
        </>
      )}
    </Stack>
  )
}
