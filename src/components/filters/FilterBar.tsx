import { Autocomplete, Box, Button, Chip, IconButton, InputAdornment, Popover, Stack, TextField, Typography } from '@mui/material'
import AddRounded from '@mui/icons-material/AddRounded'
import ClearRounded from '@mui/icons-material/ClearRounded'
import FilterAltOffOutlined from '@mui/icons-material/FilterAltOffOutlined'
import SearchRounded from '@mui/icons-material/SearchRounded'
import TuneRounded from '@mui/icons-material/TuneRounded'
import { memo, useId, useMemo, useState } from 'react'
import type { DashboardFilters, FixedAsset, Lang } from '../../types/fixedAsset'
import { filterAssets, uniq } from '../../utils/fixedAsset'
import { glassFilterControls, glassFilterReset, glassFilterSearch, glassPopover } from '../../theme/liquidGlass'

interface Props {
  lang: Lang
  rows: FixedAsset[]
  filteredCount: number
  value: DashboardFilters
  onChange: (next: DashboardFilters) => void
  onReset: () => void
}

type SelectKey = Exclude<keyof DashboardFilters, 'text'>
type FieldConfig = { key: SelectKey; field: keyof FixedAsset; vi: string; en: string }

const config: FieldConfig[] = [
  { key: 'factory', field: 'factory', vi: 'Factory (Fac)', en: 'Factory (Fac)' },
  { key: 'div', field: 'div', vi: 'Div', en: 'Div' },
  { key: 'kind', field: 'kind', vi: 'Loại tài sản', en: 'Asset type' },
  { key: 'group', field: 'group', vi: 'Bộ phận (Group)', en: 'Department (Group)' },
  { key: 'checked', field: 'pic', vi: 'PIC Checked', en: 'PIC Checked' },
  { key: 'approved', field: 'pic_approved', vi: 'PIC Approved', en: 'PIC Approved' },
  { key: 'floor', field: 'floor', vi: 'Floor', en: 'Floor' },
  { key: 'status', field: 'status', vi: 'Trạng thái', en: 'Status' },
]

/** Always visible next to the search; the other fields live in the "More filters" popover. */
const PRIMARY_KEYS: ReadonlySet<SelectKey> = new Set<SelectKey>(['factory', 'div', 'kind'])
const primary = config.filter((cfg) => PRIMARY_KEYS.has(cfg.key))
export const secondary = config.filter((cfg) => !PRIMARY_KEYS.has(cfg.key))

function FilterBarImpl({ lang, rows, filteredCount, value, onChange, onReset }: Props) {
  const vi = lang === 'vi'

  // Cascading options: each field lists values available under all *other* active filters (unchanged rule).
  const options = useMemo(() => {
    const out = {} as Record<SelectKey, string[]>
    for (const cfg of config) {
      const next = { ...value, [cfg.key]: '' }
      out[cfg.key] = uniq(filterAssets(rows, next).map((r) => String(r[cfg.field] ?? '')))
    }
    return out
  }, [rows, value])

  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null)
  const popoverId = useId()
  const hasAny = config.some((cfg) => value[cfg.key]) || value.text !== ''
  const activeSecondary = secondary.filter((cfg) => value[cfg.key])

  const renderSelect = (cfg: FieldConfig) => (
    <Autocomplete
      key={cfg.key}
      options={options[cfg.key]}
      value={value[cfg.key] || null}
      onChange={(_, next) => onChange({ ...value, [cfg.key]: next ?? '' })}
      isOptionEqualToValue={(opt, val) => opt === val}
      autoHighlight
      noOptionsText={vi ? 'Không có giá trị' : 'No options'}
      renderInput={(params) => <TextField {...params} label={vi ? cfg.vi : cfg.en} placeholder={vi ? 'Tất cả' : 'All'} />}
    />
  )

  return (
    // No card: the glass fields float directly on the page background (glass on an opaque white box reads as plain white).
    <Box component="section" aria-label={vi ? 'Bộ lọc' : 'Filters'}>
      {/*
        md+: one row [search ×2][factory][div][kind][+ more][count · reset].
        < md: search full width, the other cells wrap below it.
      */}
      <Box
        sx={(theme) => ({
          ...glassFilterControls(theme),
          display: 'grid',
          gap: '10px',
          alignItems: 'center',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', md: 'minmax(0, 2fr) repeat(3, minmax(0, 1fr)) auto auto' },
        })}
      >
        <TextField
          fullWidth
          value={value.text}
          onChange={(e) => onChange({ ...value, text: e.target.value })}
          placeholder={vi ? 'Tên / Mã máy / Maker / Vị trí...' : 'Name / Code / Maker / Position...'}
          sx={(theme) => ({ ...glassFilterSearch(theme), gridColumn: { xs: '1 / -1', md: 'auto' } })}
          slotProps={{
            htmlInput: { 'aria-label': vi ? 'Tìm kiếm' : 'Search' },
            input: {
              startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment>,
              endAdornment: value.text ? (
                <InputAdornment position="end">
                  <IconButton size="small" edge="end" aria-label={vi ? 'Xóa từ khóa' : 'Clear search'} onClick={() => onChange({ ...value, text: '' })}>
                    <ClearRounded fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            },
          }}
        />
        {primary.map(renderSelect)}
        <Button
          size="small"
          color="inherit"
          startIcon={<AddRounded />}
          aria-haspopup="dialog"
          aria-expanded={moreAnchor !== null}
          aria-controls={moreAnchor ? popoverId : undefined}
          onClick={(e) => setMoreAnchor(e.currentTarget)}
          sx={(theme) => ({ ...glassFilterReset(theme), whiteSpace: 'nowrap' })}
        >
          {vi ? `Thêm bộ lọc (${secondary.length})` : `More filters (${secondary.length})`}
        </Button>
        <Stack direction="row" spacing={1.5} sx={{ gridColumn: { xs: '1 / -1', sm: 'span 2', md: 'auto' }, alignItems: 'center', justifyContent: { xs: 'space-between', md: 'flex-end' }, minWidth: 0 }}>
          <Typography variant="body2" color="text.secondary" noWrap aria-live="polite">
            <Box component="strong" sx={{ color: 'text.primary' }}>{filteredCount.toLocaleString()}</Box>/{rows.length.toLocaleString()} {vi ? 'tài sản' : 'assets'}
          </Typography>
          <Button size="small" color="inherit" startIcon={<FilterAltOffOutlined />} disabled={!hasAny} onClick={onReset} sx={(theme) => ({ ...glassFilterReset(theme), flexShrink: 0 })}>
            {vi ? 'Xóa lọc' : 'Clear'}
          </Button>
        </Stack>
      </Box>

      <Popover
        id={popoverId}
        open={moreAnchor !== null}
        anchorEl={moreAnchor}
        onClose={() => setMoreAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { role: 'dialog', 'aria-label': vi ? 'Bộ lọc khác' : 'More filters', sx: (theme) => ({ ...glassPopover(theme), p: 1.5, width: 'min(440px, calc(100vw - 32px))' }) } }}
      >
        <Box data-testid="more-filters" sx={(theme) => ({ ...glassFilterControls(theme), display: 'grid', gap: '12px 10px', pt: 0.75, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' })}>
          {secondary.map(renderSelect)}
        </Box>
      </Popover>

      {activeSecondary.length > 0 && (
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center', mt: 1 }} aria-label={vi ? 'Bộ lọc khác đang áp dụng' : 'Other active filters'}>
          <TuneRounded fontSize="small" color="action" aria-hidden />
          {activeSecondary.map((cfg) => (
            <Chip
              key={cfg.key}
              size="small"
              color="primary"
              variant="outlined"
              label={`${vi ? cfg.vi : cfg.en}: ${value[cfg.key]}`}
              onDelete={() => onChange({ ...value, [cfg.key]: '' })}
            />
          ))}
        </Stack>
      )}
    </Box>
  )
}

export const FilterBar = memo(FilterBarImpl)
