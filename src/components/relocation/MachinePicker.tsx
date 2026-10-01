import { Alert, Autocomplete, Box, type AutocompleteRenderGroupParams, type AutocompleteRenderOptionState, Button, IconButton, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography } from '@mui/material'
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded'
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded'
import { useCallback, useDeferredValue, useEffect, useMemo, useState, type ClipboardEvent, type HTMLAttributes, type Key } from 'react'
import { ALLOWED_KINDS, FAC_LABELS, facLabel } from '../../config/relocation'
import type { Lang } from '../../types/fixedAsset'
import type { AssetLocation } from '../../types/location'
import { glassFilterControls } from '../../theme/liquidGlass'
import { eligibleForRelocation } from '../../utils/relocation'
import { checkCodes, parseCodes, zoneCountOf, type CodeCheck } from '../../utils/relocationInput'
import { FacChips, fold, GROUP_PAGE, MachineGroup, MachineOption, matchesAll, PickerPaper, PopupHeaderContext, searchTokens } from './MachinePickerParts'

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

// No limit: every eligible machine is searchable by code, name or current zone (all words, any order).
const haystackOf = (r: Row) => `${r.code} ${r.name ?? ''} ${r.currentZone ?? ''}`
const byCode = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })

/** How long the "✓ added" note stays visible. */
export const ADDED_NOTE_MS = 3000

/** "Đã chọn N máy từ M zone" + "Xoá tất cả", for the card header. */
export function SelectionSummary({ lang, selectedRows, onClear }: { lang: Lang; selectedRows: readonly Pick<AssetLocation, 'currentZone'>[]; onClear: () => void }) {
  const vi = lang === 'vi'
  const zones = zoneCountOf(selectedRows)
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Typography variant="body2" color="text.secondary" noWrap>
        {vi ? 'Đã chọn ' : 'Selected '}
        <Box component="strong" sx={{ color: 'text.primary' }} data-testid="selected-count">{selectedRows.length}</Box>
        {vi ? ` máy từ ${zones} zone` : ` ${selectedRows.length === 1 ? 'machine' : 'machines'} from ${zones} ${zones === 1 ? 'zone' : 'zones'}`}
      </Typography>
      <Button size="small" color="inherit" disabled={!selectedRows.length} onClick={onClear}>
        {vi ? 'Xoá tất cả' : 'Remove all'}
      </Button>
    </Stack>
  )
}

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
  // Filtering follows a deferred copy so typing stays instant while the list catches up.
  const query = useDeferredValue(input)
  // Building quick filter (null = all); component state only.
  const [facFilter, setFacFilter] = useState<string | null>(null)
  // Groups are collapsed by default and open while searching. `browseOpen`: groups the user opened with no search;
  // `searchClosed`: groups the user collapsed during the search `q` (forgotten once the search changes).
  const [browseOpen, setBrowseOpen] = useState<ReadonlySet<string>>(() => new Set())
  const [searchClosed, setSearchClosed] = useState<{ q: string; groups: ReadonlySet<string> }>({ q: '', groups: new Set() })
  // Rows rendered per open group ("Xem thêm" adds GROUP_PAGE more).
  const [shownByGroup, setShownByGroup] = useState<ReadonlyMap<string, number>>(() => new Map())
  // "✓ Added N": a small note that hides itself; `id` restarts the timer on every add.
  const [added, setAdded] = useState<{ n: number; id: number } | null>(null)
  useEffect(() => {
    if (!added) return
    const t = setTimeout(() => setAdded(null), ADDED_NOTE_MS)
    return () => clearTimeout(t)
  }, [added])
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
        .map((r) => ({ r, fac: facOf?.(r) ?? '\uFFFF', zone: r.currentZone ?? '\uFFFF' }))
        .sort((a, b) => byCode(a.fac, b.fac) || byCode(a.zone, b.zone) || byCode(a.r.code, b.r.code))
        .map((x) => x.r),
    [rows, pendingCodes, isOutside, facOf],
  )
  // Chips: the known buildings (config order) plus any other fac found, each with its eligible count.
  const facChips = useMemo(() => {
    if (!facOf) return []
    const counts = new Map<string, number>(Object.keys(FAC_LABELS).map((f) => [f, 0]))
    for (const r of options) {
      const fac = facOf(r as R)
      if (fac) counts.set(fac, (counts.get(fac) ?? 0) + 1)
    }
    return [...counts].map(([fac, count]) => ({ fac, label: facLabel(fac, vi), count }))
  }, [options, facOf, vi])
  // Per option, computed once: folded search text, group label and building.
  const meta = useMemo(() => new Map<Row, { hay: string; group: string; fac: string | null }>(options.map((r) => [r, { hay: fold(haystackOf(r)), group: groupOf(r), fac: facOf?.(r as R) ?? null }])), [options, groupOf, facOf])
  const groupByOption = useCallback((r: Row) => meta.get(r)?.group ?? groupOf(r), [meta, groupOf])
  const scoped = useMemo(() => (facFilter ? options.filter((r) => meta.get(r)?.fac === facFilter) : options), [options, facFilter, meta])
  const tokens = useMemo(() => searchTokens(query), [query])
  const searching = tokens.length > 0
  const queryKey = tokens.join(' ')
  const filtered = useMemo(() => (searching ? scoped.filter((r) => matchesAll(meta.get(r)!.hay, tokens)) : scoped), [scoped, tokens, searching, meta])
  // Rows per group of the filtered list, for the header count and "select whole zone" (contiguous: options are sorted by group).
  const groupRows = useMemo(() => {
    const m = new Map<string, Row[]>()
    for (const r of filtered) {
      const g = groupByOption(r)
      const list = m.get(g)
      if (list) list.push(r)
      else m.set(g, [r])
    }
    return m
  }, [filtered, groupByOption])
  const isOpen = useCallback(
    (g: string) => (searching ? !(searchClosed.q === queryKey && searchClosed.groups.has(g)) : browseOpen.has(g)),
    [searching, searchClosed, queryKey, browseOpen],
  )
  // What MUI actually renders: a collapsed group keeps one row (so its header is drawn, the row itself is not),
  // an open group its first `shown` rows. Rendering ~900 rows on open was the bottleneck.
  const visible = useMemo(() => {
    const out: Row[] = []
    for (const [g, list] of groupRows) {
      const n = isOpen(g) ? Math.min(list.length, shownByGroup.get(g) ?? GROUP_PAGE) : 1
      for (let i = 0; i < n; i++) out.push(list[i])
    }
    return out
  }, [groupRows, isOpen, shownByGroup])
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const value = useMemo(() => [...selectedRows], [selectedRows])

  /** `keepInput`: picking from the list keeps the typed search so the user can pick more. */
  const submitCodes = useCallback((codes: string[], keepInput = false) => {
    if (!codes.length) return
    const result = checkCodes(codes, { byCode: rowsByCode, selected, allowedKinds: ALLOWED_KINDS, pendingCodes, isOutside })
    if (result.accepted.length) {
      onAdd(result.accepted)
      setAdded((prev) => ({ n: result.accepted.length, id: (prev?.id ?? 0) + 1 }))
    }
    setReport(result)
    if (!keepInput) setInput('')
  }, [rowsByCode, selected, pendingCodes, isOutside, onAdd])

  const toggleGroup = useCallback(
    (group: string) => {
      const flip = (prev: ReadonlySet<string>) => {
        const next = new Set(prev)
        if (!next.delete(group)) next.add(group)
        return next
      }
      if (searching) setSearchClosed((prev) => ({ q: queryKey, groups: flip(prev.q === queryKey ? prev.groups : new Set()) }))
      else setBrowseOpen(flip)
    },
    [searching, queryKey],
  )
  const showMore = useCallback((group: string) => setShownByGroup((prev) => new Map(prev).set(group, (prev.get(group) ?? GROUP_PAGE) + GROUP_PAGE)), [])

  // Filtering is done above (AND on words, accent-insensitive) so the count line and group headers agree with the list.
  const filterOptions = useCallback(() => visible, [visible])
  const renderOption = useCallback(
    ({ key, ...props }: HTMLAttributes<HTMLLIElement> & { key: Key }, o: Row, { selected: checked }: AutocompleteRenderOptionState) => (
      <MachineOption key={key} liKey={key} liProps={props} code={o.code} name={o.name} zone={o.currentZone} checked={checked} tokens={tokens} />
    ),
    [tokens],
  )
  const renderGroup = useCallback(
    ({ key, group, children }: AutocompleteRenderGroupParams) => {
      const codes = (groupRows.get(group) ?? []).map((r) => r.code)
      const allSelected = codes.length > 0 && codes.every((c) => selectedSet.has(c))
      const open = isOpen(group)
      return (
        <MachineGroup
          key={key}
          group={group}
          count={codes.length}
          collapsed={!open}
          allSelected={allSelected}
          shown={Math.min(codes.length, shownByGroup.get(group) ?? GROUP_PAGE)}
          onToggle={() => toggleGroup(group)}
          onSelectAll={() => (allSelected ? codes.forEach(onRemove) : submitCodes(codes.filter((c) => !selectedSet.has(c)), true))}
          onShowMore={() => showMore(group)}
          selectLabel={vi ? 'Chọn cả zone' : 'Select zone'}
          deselectLabel={vi ? 'Bỏ cả zone' : 'Deselect zone'}
          moreLabel={(n) => (vi ? `Xem thêm ${n} máy` : `Show ${n} more ${n === 1 ? 'machine' : 'machines'}`)}
        >
          {open ? children : null}
        </MachineGroup>
      )
    },
    [groupRows, selectedSet, isOpen, shownByGroup, toggleGroup, onRemove, submitCodes, showMore, vi],
  )
  const popupHeader = useMemo(
    () => (
      <Typography variant="caption" color="text.secondary" component="div" sx={{ px: 2, py: 0.75, borderBottom: 1, borderColor: 'divider' }} data-testid="picker-count">
        {vi ? `Hiển thị ${filtered.length} / ${scoped.length} máy` : `Showing ${filtered.length} / ${scoped.length} ${scoped.length === 1 ? 'machine' : 'machines'}`}
      </Typography>
    ),
    [vi, filtered.length, scoped.length],
  )

  const onPaste = (e: ClipboardEvent) => {
    const codes = parseCodes(e.clipboardData.getData('text'))
    if (codes.length < 2) return // A single code: let the user see it in the input and pick it.
    e.preventDefault()
    submitCodes(codes)
  }

  const problems = report ? (Object.keys(REPORT_LABELS) as (keyof typeof REPORT_LABELS)[]).filter((k) => report[k].length) : []

  return (
    <Stack spacing={1.25}>
      {facChips.length > 0 && (
        <FacChips facs={facChips} value={facFilter} total={options.length} onChange={setFacFilter} allLabel={vi ? 'Tất cả' : 'All'} label={vi ? 'Lọc theo toà' : 'Filter by building'} />
      )}
      <PopupHeaderContext.Provider value={popupHeader}>
      <Box sx={(theme) => ({ ...glassFilterControls(theme), '& .MuiAutocomplete-inputRoot.MuiOutlinedInput-root': { height: 'auto', minHeight: 36 } })}>
        <Autocomplete<Row, true, false, true>
          multiple
          freeSolo
          size="small"
          limitTags={3}
          disableCloseOnSelect
          options={scoped}
          filterOptions={filterOptions}
          groupBy={groupByOption}
          slots={{ paper: PickerPaper }}
          slotProps={{ listbox: { sx: { maxHeight: 380 } } }}
          value={value}
          inputValue={input}
          // Picking or unpicking from the list keeps the typed search (the popup stays open for more picks).
          onInputChange={(_, v, reason) => reason !== 'reset' && reason !== 'selectOption' && reason !== 'removeOption' && setInput(v)}
          getOptionLabel={(o) => (typeof o === 'string' ? o : o.code)}
          isOptionEqualToValue={(a, b) => typeof b !== 'string' && a.code === b.code}
          renderOption={renderOption}
          renderGroup={renderGroup}
          onChange={(_, next, reason, details) => {
            if (reason === 'clear') return onClear()
            if (reason === 'removeOption' && details && typeof details.option !== 'string') return onRemove(details.option.code)
            if (reason === 'selectOption' && details && typeof details.option !== 'string') return submitCodes([details.option.code], true)
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
      </PopupHeaderContext.Provider>

      <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
        <Typography variant="caption" color="text.secondary">
          {vi ? 'Hoặc click một zone trên sơ đồ để chọn nhiều máy' : 'Or click a zone on the map to pick several machines'}
        </Typography>
        {/* Always mounted so screen readers announce each change. */}
        <Typography variant="caption" color="success.main" sx={{ fontWeight: 700 }} role="status" aria-live="polite" data-testid="added-note">
          {added ? `✓ ${vi ? `Đã thêm ${added.n} máy` : `Added ${added.n} ${added.n === 1 ? 'machine' : 'machines'}`}` : ''}
        </Typography>
      </Stack>

      {problems.length > 0 && report && (
        <Stack spacing={0.5} aria-live="polite">
          {problems.map((k) => (
            <Alert key={k} severity={k === 'duplicate' ? 'info' : k === 'outside' ? 'error' : 'warning'} sx={{ py: 0 }} data-report={k}>
              {vi ? REPORT_LABELS[k].vi : REPORT_LABELS[k].en} ({report[k].length}): {report[k].join(', ')}
            </Alert>
          ))}
        </Stack>
      )}

      {selectedRows.length > 0 && (
        <TableContainer sx={{ maxHeight: 200 }}>
          <Table size="small" stickyHeader aria-label={vi ? 'Máy đã chọn' : 'Selected machines'}>
            <TableHead>
              <TableRow>
                <TableCell>{vi ? 'Mã' : 'Code'}</TableCell>
                <TableCell>{vi ? 'Tên' : 'Name'}</TableCell>
                <TableCell>{vi ? 'Vị trí' : 'Zone'}</TableCell>
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
                  <TableCell sx={{ maxWidth: 220 }}>
                    <Tooltip title={r.name ?? ''}>
                      <Typography variant="body2" noWrap data-testid={`name-${r.code}`}>{r.name}</Typography>
                    </Tooltip>
                  </TableCell>
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
