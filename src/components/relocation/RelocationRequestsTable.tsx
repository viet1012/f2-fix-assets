import { Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import type { Lang } from '../../types/fixedAsset'
import type { RelocationRequest } from '../../types/relocation'

export function RelocationRequestsTable({ lang, requests, loading = false }: { lang: Lang; requests: readonly RelocationRequest[]; loading?: boolean }) {
  const vi = lang === 'vi'
  if (!requests.length) {
    return <Typography variant="body2" color="text.secondary">{loading ? (vi ? 'Đang tải...' : 'Loading...') : vi ? 'Chưa có yêu cầu nào.' : 'No requests yet.'}</Typography>
  }
  return (
    <TableContainer sx={{ maxHeight: 360 }}>
      <Table size="small" stickyHeader aria-label={vi ? 'Yêu cầu đã gửi' : 'Submitted requests'}>
        <TableHead>
          <TableRow>
            <TableCell>ID</TableCell>
            <TableCell>{vi ? 'Số máy' : 'Machines'}</TableCell>
            <TableCell>{vi ? 'Đến' : 'To'}</TableCell>
            <TableCell>{vi ? 'Người yêu cầu' : 'Requested by'}</TableCell>
            <TableCell>{vi ? 'Ngày dự kiến' : 'Planned'}</TableCell>
            <TableCell>{vi ? 'Ngày hoàn thành' : 'Completion'}</TableCell>
            <TableCell>{vi ? 'Lý do' : 'Reason'}</TableCell>
            <TableCell>{vi ? 'Trạng thái' : 'Status'}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {[...requests].reverse().map((r) => (
            <TableRow key={r.id} hover>
              <TableCell>{r.id}</TableCell>
              <TableCell title={r.items.map((i) => i.code).join(', ')}>{r.items.length}</TableCell>
              <TableCell>{r.to.zone}</TableCell>
              <TableCell>{r.requestedBy}</TableCell>
              <TableCell>{r.dStart}</TableCell>
              <TableCell>{r.dEnd}</TableCell>
              <TableCell sx={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason || '-'}</TableCell>
              <TableCell><Chip size="small" color="warning" label={r.status} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
