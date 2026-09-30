import { Box, Button, Checkbox, Drawer, IconButton, InputAdornment, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Stack, TextField, Typography, useMediaQuery, useTheme } from '@mui/material'
import CloseRounded from '@mui/icons-material/CloseRounded'
import SearchRounded from '@mui/icons-material/SearchRounded'
import { useMemo, useState } from 'react'
import { ALLOWED_KINDS } from '../../config/relocation'
import type { Lang } from '../../types/fixedAsset'
import type { AssetLocation } from '../../types/location'
import { glassFilterControls } from '../../theme/liquidGlass'
import { blockReason, rowsInZone, type BlockReason } from '../../utils/relocationInput'
import { normalize } from '../../utils/zone'

type Row = Pick<AssetLocation, 'code' | 'name' | 'kind' | 'currentZone' | 'positionA'>

const REASONS: Record<BlockReason, { vi: string; en: string }> = {
  pending: { vi: 'Đang có yêu cầu PENDING', en: 'Already in a PENDING request' },
  wrongKind: { vi: 'Sai loại tài sản', en: 'Asset type not allowed' },
  outside: { vi: 'Đang ở Outside', en: 'Located Outside' },
}

interface Props<R extends Row> {
  lang: Lang
  zone: string
  /** All assets in scope; the list shows those in `zone` (a major zone includes its sub-zones). */
  rows: readonly R[]
  selected: readonly string[]
  pendingCodes: ReadonlySet<string>
  isOutside?: (row: R) => boolean
  onAdd: (codes: string[]) => void
  onRemove: (code: string) => void
  onClose: () => void
}

/** Machines of one zone with checkboxes, kept in sync with the draft selection. Side panel on md+, bottom sheet below. */
export function ZoneMachineList<R extends Row>(props: Props<R>) {
  const theme = useTheme()
  const mobile = useMediaQuery(theme.breakpoints.down('md'))
  const vi = props.lang === 'vi'
  const body = <ZoneMachineListBody {...props} />
  if (!mobile) return body
  return (
    <Drawer anchor="bottom" open onClose={props.onClose} slotProps={{ paper: { sx: { maxHeight: '75vh', borderTopLeftRadius: 16, borderTopRightRadius: 16 } } }} aria-label={`${vi ? 'Máy trong zone' : 'Machines in zone'} ${props.zone}`}>
      {body}
    </Drawer>
  )
}

function ZoneMachineListBody<R extends Row>({ lang, zone, rows, selected, pendingCodes, isOutside, onAdd, onRemove, onClose }: Props<R>) {
  const vi = lang === 'vi'
  const [query, setQuery] = useState('')
  const inZone = useMemo(() => rowsInZone(rows, zone), [rows, zone])
  const items = useMemo(() => {
    const q = normalize(query)
    return inZone
      .filter((r) => !q || normalize(`${r.code} ${r.name ?? ''} ${r.currentZone ?? ''}`).includes(q))
      .map((row) => ({ row, reason: blockReason(row, { allowedKinds: ALLOWED_KINDS, pendingCodes, isOutside }) }))
  }, [inZone, query, pendingCodes, isOutside])
  const chosen = new Set(selected)
  const selectable = items.filter((i) => !i.reason)
  const toAdd = selectable.filter((i) => !chosen.has(i.row.code)).map((i) => i.row.code)
  const toRemove = items.filter((i) => chosen.has(i.row.code)).map((i) => i.row.code)
  const listId = `zone-machines-${zone}`

  return (
    <Stack component="section" spacing={1} aria-labelledby={`${listId}-title`} sx={{ p: 1.5, minWidth: 0, height: '100%' }} data-testid="zone-machine-list">
      <Stack direction="row" sx={{ alignItems: 'center' }}>
        <Typography id={`${listId}-title`} variant="subtitle2" sx={{ flex: 1 }}>
          {vi ? 'Máy trong zone' : 'Machines in zone'} {zone} ({inZone.length})
        </Typography>
        <IconButton size="small" aria-label={vi ? 'Đóng' : 'Close'} onClick={onClose}>
          <CloseRounded fontSize="small" />
        </IconButton>
      </Stack>
      <Box sx={glassFilterControls}>
        <TextField
          size="small"
          fullWidth
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={vi ? 'Lọc nhanh: mã, tên...' : 'Quick filter: code, name...'}
          slotProps={{
            htmlInput: { 'aria-label': vi ? 'Lọc máy trong zone' : 'Filter machines in zone' },
            input: { startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> },
          }}
        />
      </Box>
      <Stack direction="row" spacing={1}>
        <Button size="small" variant="outlined" disabled={!toAdd.length} onClick={() => onAdd(toAdd)}>
          {vi ? 'Chọn tất cả' : 'Select all'}
        </Button>
        <Button size="small" color="inherit" disabled={!toRemove.length} onClick={() => toRemove.forEach(onRemove)}>
          {vi ? 'Bỏ chọn' : 'Deselect'}
        </Button>
        <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center', ml: 'auto !important' }}>
          {selectable.length}/{items.length} {vi ? 'chọn được' : 'selectable'}
        </Typography>
      </Stack>
      {items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">{vi ? 'Không có máy.' : 'No machines.'}</Typography>
      ) : (
        <List dense disablePadding sx={{ overflow: 'auto', flex: 1, maxHeight: { md: 460 } }} aria-label={`${vi ? 'Máy trong zone' : 'Machines in zone'} ${zone}`}>
          {items.map(({ row, reason }) => {
            const checked = chosen.has(row.code)
            const labelId = `${listId}-${row.code}`
            const secondary = [row.name, row.currentZone !== zone ? row.currentZone : null, reason ? (vi ? REASONS[reason].vi : REASONS[reason].en) : null].filter(Boolean).join(' · ')
            return (
              <ListItem key={row.code} disablePadding data-code={row.code} data-reason={reason ?? undefined} sx={reason ? { opacity: 0.5 } : undefined}>
                <ListItemButton dense disabled={!!reason} onClick={() => (checked ? onRemove(row.code) : onAdd([row.code]))}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <Checkbox edge="start" size="small" checked={checked} disabled={!!reason} tabIndex={-1} disableRipple slotProps={{ input: { 'aria-labelledby': labelId } }} />
                  </ListItemIcon>
                  <ListItemText id={labelId} primary={row.code} secondary={secondary || undefined} />
                </ListItemButton>
              </ListItem>
            )
          })}
        </List>
      )}
    </Stack>
  )
}
