import {
  Box, Button, Checkbox, Chip, Divider, ListItemIcon, ListItemText, Menu, MenuItem, Table, TableBody, TableCell,
  TableContainer, TableHead, TablePagination, TableRow, Tooltip, Typography,
} from '@mui/material'
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutlined'
import HideImageOutlined from '@mui/icons-material/HideImageOutlined'
import SearchOffOutlined from '@mui/icons-material/SearchOffOutlined'
import TableRowsOutlined from '@mui/icons-material/TableRowsOutlined'
import ViewColumnOutlined from '@mui/icons-material/ViewColumnOutlined'
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { FixedAsset, Lang } from '../../types/fixedAsset'
import { formatMoney } from '../../utils/fixedAsset'
import { SectionCard } from '../common/SectionCard'
import { EmptyState } from '../common/States'
import { glassButton, glassIconButton, glassInset, glassRadius } from '../../theme/liquidGlass'

const PAGE_SIZES = [25, 50, 100]
const DEFAULT_PAGE_SIZE = 50
const STORAGE_KEY = 'f2-table-hidden-columns'
const mono = { fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '0.78rem' }

interface Column {
  key: string
  label: (vi: boolean) => string
  align?: 'left' | 'right' | 'center'
  minWidth?: number
  render: (r: FixedAsset, vi: boolean) => ReactNode
}

const columns: Column[] = [
  { key: 'code', label: (vi) => (vi ? 'Mã máy' : 'Code'), render: (r) => <Box component="span" sx={{ ...mono, fontWeight: 700 }}>{r.code}</Box> },
  { key: 'name', label: (vi) => (vi ? 'Tên tài sản' : 'Asset name'), minWidth: 240, render: (r) => <Box component="span" sx={{ fontWeight: 500 }}>{r.name}</Box> },
  { key: 'factory', label: () => 'Fac', render: (r) => (r.factory ? <Chip size="small" variant="outlined" label={r.factory} /> : '-') },
  { key: 'div', label: () => 'Div', render: (r) => r.div || '-' },
  { key: 'group', label: () => 'Group', render: (r) => r.group || '-' },
  { key: 'floor', label: () => 'Floor', render: (r) => r.floor || '-' },
  { key: 'pos', label: (vi) => (vi ? 'Vị trí' : 'Position'), render: (r) => (r.position ? <Box component="span" sx={mono}>{r.position}</Box> : '-') },
  { key: 'cost', label: (vi) => (vi ? 'Giá trị' : 'Value'), align: 'right', render: (r) => <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(r.cost)}</Box> },
  { key: 'maker', label: () => 'Maker', render: (r) => r.maker || '-' },
  { key: 'pic', label: () => 'PIC Check', render: (r) => r.pic || '-' },
  { key: 'pic_approved', label: () => 'PIC Approved', render: (r) => r.pic_approved || '-' },
  { key: 'kind', label: (vi) => (vi ? 'Loại TS' : 'Type'), render: (r) => (r.kind ? <Chip size="small" label={r.kind} /> : '-') },
  { key: 'status', label: (vi) => (vi ? 'Trạng thái' : 'Status'), render: (r) => (r.status ? <Chip size="small" color="success" variant="outlined" label={r.status} /> : '-') },
  {
    key: 'photo',
    label: (vi) => (vi ? 'Ảnh' : 'Photo'),
    align: 'center',
    render: (r, vi) => (
      <Tooltip title={`${r.hasPhoto ? (vi ? 'Có ảnh' : 'Has photo') : (vi ? 'Chưa có ảnh' : 'No photo')}${r.photoEval ? ` · ${r.photoEval}` : ''}`}>
        {r.hasPhoto
          ? <CheckCircleOutline fontSize="small" color="success" aria-label={vi ? 'Có ảnh' : 'Has photo'} />
          : <HideImageOutlined fontSize="small" color="error" aria-label={vi ? 'Chưa có ảnh' : 'No photo'} />}
      </Tooltip>
    ),
  },
  { key: 'depYears', label: (vi) => (vi ? 'Năm KH' : 'Dep. years'), align: 'center', render: (r) => r.depYears ?? '-' },
]

function readHidden(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function AssetTableImpl({ rows, lang }: { rows: FixedAsset[]; lang: Lang }) {
  const vi = lang === 'vi'
  const [hidden, setHidden] = useState<string[]>(readHidden)
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [prevRows, setPrevRows] = useState(rows)
  const scrollRef = useRef<HTMLDivElement>(null)

  // New filter result -> back to the first page (adjusting state during render avoids an extra paint).
  if (rows !== prevRows) {
    setPrevRows(rows)
    setPage(0)
  }

  const visibleColumns = useMemo(() => columns.filter((c) => !hidden.includes(c.key)), [hidden])
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const shown = useMemo(() => rows.slice(safePage * pageSize, (safePage + 1) * pageSize), [rows, safePage, pageSize])
  const from = rows.length === 0 ? 0 : safePage * pageSize + 1
  const to = safePage * pageSize + shown.length

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(hidden)) } catch { /* per-viewer convenience only */ }
  }, [hidden])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [safePage, pageSize])

  const toggle = (key: string) => setHidden((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key]))

  return (
    <SectionCard
      flush
      icon={<TableRowsOutlined />}
      title={vi ? 'Danh sách tài sản chi tiết' : 'Detailed asset list'}
      actions={
        <>
          <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {from.toLocaleString()}–{to.toLocaleString()} / {rows.length.toLocaleString()}
          </Typography>
          <Button
            size="small"
            color="inherit"
            startIcon={<ViewColumnOutlined />}
            sx={glassButton}
            onClick={(e) => setMenuAnchor(e.currentTarget)}
            aria-haspopup="menu"
            aria-expanded={Boolean(menuAnchor)}
          >
            {vi ? 'Cột' : 'Columns'}{hidden.length ? ` (${columns.length - hidden.length}/${columns.length})` : ''}
          </Button>
          <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)} slotProps={{ paper: { sx: { maxHeight: 420 } } }}>
            {columns.map((c) => (
              <MenuItem key={c.key} dense onClick={() => toggle(c.key)} disabled={c.key === 'code'}>
                <ListItemIcon><Checkbox size="small" edge="start" checked={!hidden.includes(c.key)} tabIndex={-1} disableRipple /></ListItemIcon>
                <ListItemText>{c.label(vi)}</ListItemText>
              </MenuItem>
            ))}
            <Divider />
            <MenuItem dense onClick={() => setHidden([])} disabled={hidden.length === 0}>
              <ListItemText inset>{vi ? 'Hiện tất cả cột' : 'Show all columns'}</ListItemText>
            </MenuItem>
          </Menu>
        </>
      }
    >
      {rows.length === 0 ? (
        <EmptyState icon={<SearchOffOutlined />} title={vi ? 'Không có tài sản' : 'No assets'} description={vi ? 'Không có tài sản phù hợp với bộ lọc hiện tại.' : 'No assets match the current filters.'} />
      ) : (
        <>
          <TableContainer ref={scrollRef} sx={{ maxHeight: 'max(440px, calc(100vh - 250px))' }}>
            {/* Cell styling lives on the table (one style rule) instead of per-cell sx (one per cell). */}
            <Table stickyHeader size="small" sx={tableSx}>
              <TableHead>
                <TableRow>
                  {visibleColumns.map((c) => (
                    <TableCell key={c.key} align={c.align}>{c.label(vi)}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {shown.map((r) => (
                  <TableRow hover key={r.code}>
                    {visibleColumns.map((c) => (
                      <TableCell key={c.key} align={c.align} className={c.minWidth ? 'wrap' : undefined} style={c.minWidth ? { minWidth: c.minWidth } : undefined}>
                        {c.render(r, vi)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={rows.length}
            page={safePage}
            onPageChange={(_, next: number) => setPage(next)}
            rowsPerPage={pageSize}
            rowsPerPageOptions={PAGE_SIZES}
            onRowsPerPageChange={(e) => { setPageSize(Number(e.target.value)); setPage(0) }}
            labelRowsPerPage={vi ? 'Số dòng / trang' : 'Rows per page'}
            labelDisplayedRows={({ from: a, to: b, count }) => `${a.toLocaleString()}–${b.toLocaleString()} ${vi ? 'trên' : 'of'} ${count.toLocaleString()}`}
            getItemAriaLabel={(type) => ({
              first: vi ? 'Trang đầu' : 'First page',
              last: vi ? 'Trang cuối' : 'Last page',
              next: vi ? 'Trang sau' : 'Next page',
              previous: vi ? 'Trang trước' : 'Previous page',
            })[type]}
            showFirstButton
            showLastButton
            sx={(theme) => ({
              borderTop: 1,
              borderColor: 'divider',
              flexShrink: 0,
              '& .MuiTablePagination-actions': { display: 'flex', gap: 0.5 },
              '& .MuiTablePagination-actions .MuiIconButton-root': glassIconButton(theme, 30),
              '& .MuiTablePagination-select': { ...glassInset(theme, glassRadius.control), py: 0.5 },
            })}
          />
        </>
      )}
    </SectionCard>
  )
}

const tableSx = {
  minWidth: 1400,
  '& .MuiTableCell-root': { whiteSpace: 'nowrap' },
  '& .MuiTableCell-root.wrap': { whiteSpace: 'normal' },
  '& .MuiTableCell-head:first-of-type': { position: 'sticky', left: 0, zIndex: 3 },
  '& .MuiTableCell-body:first-of-type': { position: 'sticky', left: 0, zIndex: 1, bgcolor: 'background.paper', borderRight: 1, borderRightColor: 'divider' },
} as const

/** Memoized: re-renders only when the filtered rows or language change, not on unrelated App state. */
export const AssetTable = memo(AssetTableImpl)
