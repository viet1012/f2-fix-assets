import { Button, Chip, CircularProgress, type ChipProps, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from '@mui/material'
import ImageOutlined from '@mui/icons-material/ImageOutlined'
import MoreVertRounded from '@mui/icons-material/MoreVertRounded'
import TableChartOutlined from '@mui/icons-material/TableChartOutlined'
import { useState } from 'react'
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded'
import { displayName } from '../../api/authApi'
import type { Lang } from '../../types/fixedAsset'
import { isKnownRelocationStatus, relocationStatusLabel } from '../../config/relocation'
import type { RelocationRequest, RelocationStatus } from '../../types/relocation'
import { formatRequestDate } from '../../utils/relocationForm'

export { formatRequestDate }

const STATUS_COLOR: Record<RelocationStatus, ChipProps['color']> = {
  REQ_PENDING: 'warning',
  REQ_APPROVED: 'info',
  REQ_REJECTED: 'error',
  REQ_DONE: 'success',
}

/** Status chip: known REQ_* values are translated, anything else is shown as-is. */
function StatusChip({ status, vi }: { status: string | null; vi: boolean }) {
  const color = isKnownRelocationStatus(status) ? STATUS_COLOR[status] : 'default'
  return <Chip size="small" color={color} label={relocationStatusLabel(status, vi)} title={status ?? undefined} />
}

const isWebUrl = (u: string) => /^https?:\/\//i.test(u)

interface Props {
  lang: Lang
  requests: readonly RelocationRequest[]
  loading?: boolean
  /** Rebuilds and uploads the drawing of a request that has none. */
  onReupload?: (request: RelocationRequest) => void
  /** Requests whose drawing is being uploaded (button disabled). */
  uploading?: ReadonlySet<string>
  /** "Tạo lại Excel" in the row's action menu (POST /{requestNo}/excel). */
  onRegenerateExcel?: (request: RelocationRequest) => void
  /** Rows whose action menu is shown (the requester's own requests). */
  canManage?: (request: RelocationRequest) => boolean
  /** Requests whose Excel file is being rebuilt (menu item disabled). */
  excelBusy?: ReadonlySet<string>
}

/** Small "⋮" menu of row actions; for now only "Tạo lại Excel". */
function RowActions({ request: r, vi, onRegenerateExcel, busy }: { request: RelocationRequest; vi: boolean; onRegenerateExcel: (r: RelocationRequest) => void; busy: boolean }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const label = vi ? 'Tạo lại Excel' : 'Rebuild Excel'
  return (
    <>
      <IconButton size="small" aria-label={`${vi ? 'Hành động' : 'Actions'} ${r.id}`} aria-haspopup="menu" aria-expanded={anchor !== null} onClick={(e) => setAnchor(e.currentTarget)}>
        <MoreVertRounded fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        <MenuItem
          dense
          disabled={busy}
          onClick={() => {
            setAnchor(null)
            onRegenerateExcel(r)
          }}
        >
          <ListItemIcon>{busy ? <CircularProgress size={14} /> : <TableChartOutlined fontSize="small" />}</ListItemIcon>
          <ListItemText>{busy ? (vi ? 'Đang tạo Excel…' : 'Building Excel…') : label}</ListItemText>
        </MenuItem>
      </Menu>
    </>
  )
}

/** Drawing cell: link icon (webUrl), image icon with the file name (stored without web address), or "re-upload". */
function DrawingCell({ request: r, vi, onReupload, busy }: { request: RelocationRequest; vi: boolean; onReupload?: (r: RelocationRequest) => void; busy: boolean }) {
  if (r.drawingUrl && isWebUrl(r.drawingUrl)) {
    return (
      <Tooltip title={vi ? 'Mở bản vẽ' : 'Open drawing'}>
        <IconButton size="small" component="a" href={r.drawingUrl} target="_blank" rel="noopener noreferrer" aria-label={`${vi ? 'Mở bản vẽ' : 'Open drawing'} ${r.id}`} data-testid={`drawing-link-${r.id}`}>
          <OpenInNewRounded fontSize="small" />
        </IconButton>
      </Tooltip>
    )
  }
  if (r.drawingUrl) {
    return (
      <Tooltip title={r.drawingUrl}>
        <ImageOutlined fontSize="small" color="action" aria-label={`${vi ? 'Đã lưu bản vẽ' : 'Drawing saved'}: ${r.drawingUrl}`} data-testid={`drawing-file-${r.id}`} />
      </Tooltip>
    )
  }
  if (!onReupload) return <>-</>
  return (
    <Button
      size="small"
      variant="text"
      disabled={busy}
      aria-busy={busy || undefined}
      onClick={() => !busy && onReupload(r)}
      startIcon={busy ? <CircularProgress size={14} color="inherit" data-testid={`drawing-spinner-${r.id}`} /> : undefined}
      sx={{ whiteSpace: 'nowrap' }}
    >
      {busy ? (vi ? 'Đang tạo bản vẽ…' : 'Building drawing…') : vi ? 'Tải lên lại' : 'Re-upload'}
    </Button>
  )
}

export function RelocationRequestsTable({ lang, requests, loading = false, onReupload, uploading, onRegenerateExcel, canManage, excelBusy }: Props) {
  const vi = lang === 'vi'
  if (!requests.length) {
    return <Typography variant="body2" color="text.secondary">{loading ? (vi ? 'Đang tải...' : 'Loading...') : vi ? 'Chưa có yêu cầu nào.' : 'No requests yet.'}</Typography>
  }
  return (
    <TableContainer sx={{ maxHeight: 360 }}>
      <Table size="small" stickyHeader aria-label={vi ? 'Yêu cầu đã gửi' : 'Submitted requests'}>
        <TableHead>
          <TableRow>
            <TableCell>{vi ? 'Mã yêu cầu' : 'Request No.'}</TableCell>
            <TableCell>{vi ? 'Số máy' : 'Machines'}</TableCell>
            <TableCell>{vi ? 'Đến' : 'To'}</TableCell>
            <TableCell>{vi ? 'Người yêu cầu' : 'Requested by'}</TableCell>
            <TableCell>{vi ? 'Ngày dự kiến' : 'Planned'}</TableCell>
            <TableCell>{vi ? 'Hoàn thành' : 'Completion'}</TableCell>
            <TableCell>{vi ? 'Lý do' : 'Reason'}</TableCell>
            <TableCell>{vi ? 'Trạng thái' : 'Status'}</TableCell>
            <TableCell>{vi ? 'Bản vẽ' : 'Drawing'}</TableCell>
            {onRegenerateExcel && <TableCell padding="checkbox" aria-label={vi ? 'Hành động' : 'Actions'} />}
          </TableRow>
        </TableHead>
        <TableBody>
          {[...requests].reverse().map((r) => (
            <TableRow key={r.id} hover data-request={r.id}>
              <TableCell>{r.id}</TableCell>
              <TableCell title={r.items.map((i) => i.code).join(', ')}>{r.items.length}</TableCell>
              <TableCell>{r.to.zone}</TableCell>
              <TableCell>{`${displayName(r.requesterName, lang)} (${r.requestedBy})`}</TableCell>
              <TableCell>{formatRequestDate(r.plannedMoveDate, vi)}</TableCell>
              <TableCell>{formatRequestDate(r.plannedDoneDate, vi)}</TableCell>
              <TableCell sx={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason || '-'}</TableCell>
              <TableCell><StatusChip status={r.status} vi={vi} /></TableCell>
              <TableCell><DrawingCell request={r} vi={vi} onReupload={onReupload} busy={uploading?.has(r.id) ?? false} /></TableCell>
              {onRegenerateExcel && (
                <TableCell padding="checkbox">
                  {(canManage?.(r) ?? false) && <RowActions request={r} vi={vi} onRegenerateExcel={onRegenerateExcel} busy={excelBusy?.has(r.id) ?? false} />}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
