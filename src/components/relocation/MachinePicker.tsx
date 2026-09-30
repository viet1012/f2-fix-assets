import { Alert, Autocomplete, Box, Button, createFilterOptions, IconButton, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography } from '@mui/material'
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded'
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded'
import { useMemo, useState, type ClipboardEvent } from 'react'
import { ALLOWED_KINDS, facLabel } from '../../config/relocation'
import type { Lang } from '../../types/fixedAsset'
import type { AssetLocation } from '../../types/location'
import { glassFilterControls } from '../../theme/liquidGlass'
import { eligibleForRelocation } from '../../utils/relocation'
import { checkCodes, parseCodes, zoneCountOf, type CodeCheck } from '../../utils/relocationInput'

type Row = Pick<AssetLocation, 'code' | 'name' | 'kind' | 'currentZone' | 'floor' | 'mapFloor' | 'floorMismatch'>

interface Props<R extends Row> {
  lang: Lang
  /** All assets in scope; the dropdown only offers eligible, non-pending ones. */
  rows: readonly R[]
  byCode: ReadonlyMap<string, R>
  selected: readonly string[]
  selectedRows: readonly R[]
  pendingCodes: ReadonlySet<string>
  /** Assets at an Outside location: not offered, and rejected with their own message when typed or pasted. */
  isOutside?: (row: R) => boolean
  /** Building (API fac) of an asset, for grouping the dropdown by building → zone. */
  facOf?: (row: R) => string | null
  /** Zone of the selected-table row under the pointer / keyboard focus (null on leave), to flash it on the maps. */
  onHoverZone?: (zone: string | null) => void
  onAdd: (codes: string[]) => void
  onRemove: (code: string) => void
  onClear: () => void
}

// No limit: every eligible machine is searchable by code, name or current zone.
const filterOptions = createFilterOptions<Row>({ stringify: (r) => `${r.code} ${r.name ?? ''} ${r.currentZone ?? ''}` })
const byCode = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })

const REPORT_LABELS: Record<Exclude<keyof CodeCheck, 'accepted'>, { vi: string; en: string }> = {
  notFound: { vi: 'Không tìm thấy', en: 'Not found' },
  duplicate: { vi: 'Trùng / đã chọn', en: 'Duplicate / already selected' },
  wrongKind: { vi: 'Sai loại tài sản', en: 'Asset type not allowed' },
  outside: { vi: 'Đang ở Outside (không di dời được)', en: 'Located Outside (cannot be relocated)' },
  pending: { vi: 'Đang có yêu cầu PENDING', en: 'Already in a PENDING request' },
}

export function MachinePicker<R extends Row>({ lang, rows, byCode: rowsByCode, selected, selectedRows, pendingCodes, isOutside, facOf, onHoverZone, onAdd, onRemove, onClear }: Props<R>) {
  const vi = lang === 'vi'
  const [report, setReport] = useState<CodeCheck | null>(null)
  const [input, setInput] = useState('')
  // Group header "Toà A · A2-3"; options are sorted by building, zone, then code so each group is contiguous.
  const groupOf = useMemo(() => {
    const unknown = vi ? 'Chưa xác định toà' : 'Unknown building'
    return (r: Row) => {
      const fac = facOf?.(r as R)
      return `${fac ? facLabel(fac, vi) : unknown} · ${r.currentZone ?? '-'}`
    }
  }, [facOf, vi])
  const options = useMemo(
    () =>
      rows
        .filter((r) => eligibleForRelocation(r, ALLOWED_KINDS) && !pendingCodes.has(r.code) && !isOutside?.(r))
        .map((r) => ({ r, fac: facOf?.(r) ?? '￿', zone: r.currentZone ?? '￿' }))
        .sort((a, b) => byCode(a.fac, b.fac) || byCode(a.zone, b.zone) || byCode(a.r.code, b.r.code))
        .map((x) => x.r),
    [rows, pendingCodes, isOutside, facOf],
  )

  const submitCodes = (codes: string[]) => {
    if (!codes.length) return
    const result = checkCodes(codes, { byCode: rowsByCode, selected, allowedKinds: ALLOWED_KINDS, pendingCodes, isOutside })
    if (result.accepted.length) onAdd(result.accepted)
    setReport(result)
    setInput('')
  }

  const onPaste = (e: ClipboardEvent) => {
    const codes = parseCodes(e.clipboardData.getData('text'))
    if (codes.length < 2) return // A single code: let the user see it in the input and pick it.
    e.preventDefault()
    submitCodes(codes)
  }

  const problems = report ? (Object.keys(REPORT_LABELS) as (keyof typeof REPORT_LABELS)[]).filter((k) => report[k].length) : []

  return (
    <Stack spacing={1.25}>
      <Box sx={(theme) => ({ ...glassFilterControls(theme), '& .MuiAutocomplete-inputRoot.MuiOutlinedInput-root': { height: 'auto', minHeight: 36 } })}>
        <Autocomplete<Row, true, false, true>
          multiple
          freeSolo
          size="small"
          limitTags={3}
          filterSelectedOptions
          options={options}
          filterOptions={filterOptions}
          groupBy={groupOf}
          value={[...selectedRows]}
          inputValue={input}
          onInputChange={(_, v, reason) => reason !== 'reset' && setInput(v)}
          getOptionLabel={(o) => (typeof o === 'string' ? o : o.code)}
          isOptionEqualToValue={(a, b) => typeof b !== 'string' && a.code === b.code}
          renderOption={({ key, ...props }, o) => (
            <li key={key} {...props}>
              <Box component="strong" sx={{ mr: 1 }}>{o.code}</Box>
              <Typography variant="body2" color="text.secondary" noWrap>{o.name}</Typography>
            </li>
          )}
          onChange={(_, next, reason, details) => {
            if (reason === 'clear') return onClear()
            if (reason === 'removeOption' && details && typeof details.option !== 'string') return onRemove(details.option.code)
            const last = next[next.length - 1]
            if (last === undefined) return
            submitCodes(typeof last === 'string' ? parseCodes(last) : [last.code])
          }}
          noOptionsText={vi ? 'Không có máy phù hợp' : 'No matching machines'}
          renderInput={(params) => (
            <TextField
              {...params}
              label={vi ? 'Chọn máy' : 'Pick machines'}
              placeholder={vi ? 'Gõ hoặc dán nhiều mã (cách nhau bằng dấu cách , ;)' : 'Type or paste codes (separated by space , ;)'}
              onPaste={onPaste}
            />
          )}
        />
      </Box>

      <Typography variant="caption" color="text.secondary">
        {vi ? 'Hoặc click một zone trên sơ đồ để chọn nhiều máy' : 'Or click a zone on the map to pick several machines'}
      </Typography>

      {report && (
        <Stack spacing={0.5} aria-live="polite">
          {report.accepted.length > 0 && (
            <Alert severity="success" sx={{ py: 0 }}>{vi ? 'Đã thêm' : 'Added'}: {report.accepted.length}</Alert>
          )}
          {problems.map((k) => (
            <Alert key={k} severity={k === 'duplicate' ? 'info' : k === 'outside' ? 'error' : 'warning'} sx={{ py: 0 }} data-report={k}>
              {vi ? REPORT_LABELS[k].vi : REPORT_LABELS[k].en} ({report[k].length}): {report[k].join(', ')}
            </Alert>
          ))}
        </Stack>
      )}

      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="body2" color="text.secondary">
          {vi ? 'Đã chọn ' : 'Selected '}
          <Box component="strong" sx={{ color: 'text.primary' }} data-testid="selected-count">{selectedRows.length}</Box>
          {vi ? ` máy từ ${zoneCountOf(selectedRows)} zone` : ` ${selectedRows.length === 1 ? 'machine' : 'machines'} from ${zoneCountOf(selectedRows)} ${zoneCountOf(selectedRows) === 1 ? 'zone' : 'zones'}`}
        </Typography>
        <Button size="small" color="inherit" disabled={!selectedRows.length} onClick={onClear}>
          {vi ? 'Xoá tất cả' : 'Remove all'}
        </Button>
      </Stack>

      {selectedRows.length > 0 && (
        <TableContainer sx={{ maxHeight: 280 }}>
          <Table size="small" stickyHeader aria-label={vi ? 'Máy đã chọn' : 'Selected machines'}>
            <TableHead>
              <TableRow>
                <TableCell>{vi ? 'Mã' : 'Code'}</TableCell>
                <TableCell>{vi ? 'Tên' : 'Name'}</TableCell>
                <TableCell>{vi ? 'Vị trí' : 'Zone'}</TableCell>
                <TableCell>{vi ? 'Loại TS' : 'Type'}</TableCell>
                <TableCell padding="checkbox" />
              </TableRow>
            </TableHead>
            <TableBody>
              {selectedRows.map((r) => (
                <TableRow
                  key={r.code}
                  hover
                  data-code={r.code}
                  onMouseEnter={() => onHoverZone?.(r.currentZone)}
                  onMouseLeave={() => onHoverZone?.(null)}
                  onFocus={() => onHoverZone?.(r.currentZone)}
                  onBlur={() => onHoverZone?.(null)}
                >
                  <TableCell>{r.code}</TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                      <span>{r.currentZone ?? '-'}</span>
                      {r.floorMismatch && (
                        <Tooltip
                          title={vi ? `Tầng trong dữ liệu (${r.floor ?? '-'}) khác tầng của zone (${r.mapFloor ?? '-'})` : `Asset floor (${r.floor ?? '-'}) differs from the zone floor (${r.mapFloor ?? '-'})`}
                        >
                          <WarningAmberRounded fontSize="small" color="warning" data-testid={`floor-mismatch-${r.code}`} aria-label={vi ? 'Lệch tầng' : 'Floor mismatch'} />
                        </Tooltip>
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell>{r.kind ?? '-'}</TableCell>
                  <TableCell padding="checkbox">
                    <IconButton size="small" aria-label={`${vi ? 'Xoá' : 'Remove'} ${r.code}`} onClick={() => onRemove(r.code)}>
                      <DeleteOutlineRounded fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  )
}
