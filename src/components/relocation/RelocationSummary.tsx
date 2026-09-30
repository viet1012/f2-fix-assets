import { Chip, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import type { Lang } from '../../types/fixedAsset'
import type { AssetLocation } from '../../types/location'
import type { RelocationTarget } from '../../types/relocation'
import { facLabel } from '../../config/relocation'
import { DEFAULT_CONTEXT, rowFac, rowLayoutId, targetFac, type RelocationContext, type RelocationRow } from '../../utils/relocation'
import { moveBadgeOf, type MoveBadge } from '../../utils/relocationInput'
import { countLabel } from './TargetLocationSelect'

type Row = RelocationRow & Pick<AssetLocation, 'code' | 'name'>

const BADGES: Record<MoveBadge, { vi: string; en: string; color: 'error' | 'warning' | 'info' | 'default' | 'secondary' }> = {
  building: { vi: 'Đổi toà', en: 'Building change', color: 'error' },
  floor: { vi: 'Đổi tầng', en: 'Floor change', color: 'warning' },
  same: { vi: 'Cùng tầng', en: 'Same floor', color: 'info' },
  none: { vi: 'Không đổi', en: 'No change', color: 'default' },
  unknownBuilding: { vi: 'Chưa xác định toà', en: 'Building unknown', color: 'secondary' },
}

interface Props {
  lang: Lang
  rows: readonly Row[]
  target: RelocationTarget | null
  /** Machines currently at each zone (majors include their sub-zones). */
  zoneCount: ReadonlyMap<string, number>
  ctx?: RelocationContext
}

export function RelocationSummary({ lang, rows, target, zoneCount, ctx = DEFAULT_CONTEXT }: Props) {
  const vi = lang === 'vi'
  if (!target || !rows.length) {
    return <Typography variant="body2" color="text.secondary">{vi ? 'Chọn máy và vị trí đích để xem tóm tắt.' : 'Pick machines and a destination to see the summary.'}</Typography>
  }
  const to = ctx.layouts.find((l) => l.id === target.layoutId)
  const describe = (building: string | null | undefined, floor: string | null | undefined, zone: string | null) =>
    [building ? facLabel(building, vi) : null, floor || null, zone || null].filter(Boolean).join(' / ') || '-'
  const items = rows.map((r) => {
    const fromId = rowLayoutId(r, ctx.index)
    const from = fromId === null ? undefined : ctx.layouts.find((l) => l.id === fromId)
    return { row: r, badge: moveBadgeOf(r, target, ctx), from: describe(rowFac(r, ctx), from?.dbFloor ?? r.floor, r.currentZone) }
  })
  const moving = items.filter((i) => i.badge !== 'none').length

  return (
    <Stack spacing={1}>
      <Typography variant="body2" color="text.secondary">
        {vi ? 'Đích' : 'Destination'} <strong>{target.zone}</strong>: {countLabel(target.zone, zoneCount.get(target.zone) ?? 0, vi)} {vi ? 'hiện có' : 'there now'} ·{' '}
        {vi ? 'Sẽ di chuyển' : 'Moving'} <strong>{moving}</strong> / {items.length}
      </Typography>
      <TableContainer sx={{ maxHeight: 320 }}>
        <Table size="small" stickyHeader aria-label={vi ? 'Tóm tắt di dời' : 'Relocation summary'}>
          <TableHead>
            <TableRow>
              <TableCell>{vi ? 'Mã' : 'Code'}</TableCell>
              <TableCell>{vi ? 'Tên' : 'Name'}</TableCell>
              <TableCell>{vi ? 'Từ' : 'From'}</TableCell>
              <TableCell>{vi ? 'Đến' : 'To'}</TableCell>
              <TableCell>{vi ? 'Loại' : 'Type'}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map(({ row, badge, from }) => (
              <TableRow key={row.code} data-move={badge} sx={badge === 'none' ? { opacity: 0.45 } : undefined}>
                <TableCell>{row.code}</TableCell>
                <TableCell>{row.name}</TableCell>
                <TableCell>{from}</TableCell>
                <TableCell>{describe(targetFac(target, ctx), to?.dbFloor, target.zone)}</TableCell>
                <TableCell>
                  <Chip size="small" variant={badge === 'none' ? 'outlined' : 'filled'} color={BADGES[badge].color} label={vi ? BADGES[badge].vi : BADGES[badge].en} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  )
}
