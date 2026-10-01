import { Button, Chip, CircularProgress, type ChipProps, IconButton, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from '@mui/material'
import ImageOutlined from '@mui/icons-material/ImageOutlined'
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded'
import type { Lang } from '../../types/fixedAsset'
import { RELOCATION_STATUS_LABELS } from '../../config/relocation'
import type { RelocationRequest, RelocationStatus } from '../../types/relocation'
import { formatRequestDate } from '../../utils/relocationForm'

export { formatRequestDate }

const STATUS_COLOR: Record<RelocationStatus, ChipProps['color']> = {
  REQ_PENDING_PE: 'warning',
  REQ_PENDING_BOD: 'warning',
  REQ_APPROVED: 'info',
  REQ_REJECTED: 'error',
  REQ_DONE: 'success',
}

/** Status chip: known REQ_* values are translated, anything else is shown as-is. */
function StatusChip({ status, vi }: { status: RelocationStatus | null; vi: boolean }) {
  const label = status ? RELOCATION_STATUS_LABELS[status] : undefined
  return <Chip size="small" color={(status && STATUS_COLOR[status]) || 'default'} label={label ? (vi ? label.vi : label.en) : (status ?? '-')} title={status ?? undefined} />
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

export function RelocationRequestsTable({ lang, requests, loading = false, onReupload, uploading }: Props) {
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
          </TableRow>
        </TableHead>
        <TableBody>
          {[...requests].reverse().map((r) => (
            <TableRow key={r.id} hover data-request={r.id}>
              <TableCell>{r.id}</TableCell>
              <TableCell title={r.items.map((i) => i.code).join(', ')}>{r.items.length}</TableCell>
              <TableCell>{r.to.zone}</TableCell>
              <TableCell>{r.requestedBy}</TableCell>
              <TableCell>{formatRequestDate(r.plannedMoveDate, vi)}</TableCell>
              <TableCell>{formatRequestDate(r.plannedDoneDate, vi)}</TableCell>
              <TableCell sx={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason || '-'}</TableCell>
              <TableCell><StatusChip status={r.status} vi={vi} /></TableCell>
              <TableCell><DrawingCell request={r} vi={vi} onReupload={onReupload} busy={uploading?.has(r.id) ?? false} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
