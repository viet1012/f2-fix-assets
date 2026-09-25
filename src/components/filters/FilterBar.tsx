import { Autocomplete, Box, Button, Chip, IconButton, InputAdornment, Stack, TextField, Typography } from '@mui/material'
import ClearRounded from '@mui/icons-material/ClearRounded'
import FilterAltOffOutlined from '@mui/icons-material/FilterAltOffOutlined'
import SearchRounded from '@mui/icons-material/SearchRounded'
import TuneRounded from '@mui/icons-material/TuneRounded'
import { memo, useMemo } from 'react'
import type { DashboardFilters, FixedAsset, Lang } from '../../types/fixedAsset'
import { filterAssets, uniq } from '../../utils/fixedAsset'
import { glassFilterControls, glassFilterReset, glassFilterSearch } from '../../theme/liquidGlass'

interface Props {
  lang: Lang
  rows: FixedAsset[]
  filteredCount: number
  value: DashboardFilters
  onChange: (next: DashboardFilters) => void
  onReset: () => void
}

type SelectKey = Exclude<keyof DashboardFilters, 'text'>

const config: Array<{ key: SelectKey; field: keyof FixedAsset; vi: string; en: string }> = [
  { key: 'factory', field: 'factory', vi: 'Factory (Fac)', en: 'Factory (Fac)' },
  { key: 'div', field: 'div', vi: 'Div', en: 'Div' },
  { key: 'kind', field: 'kind', vi: 'Loại tài sản', en: 'Asset type' },
  { key: 'group', field: 'group', vi: 'Bộ phận (Group)', en: 'Department (Group)' },
  { key: 'checked', field: 'pic', vi: 'PIC Checked', en: 'PIC Checked' },
  { key: 'approved', field: 'pic_approved', vi: 'PIC Approved', en: 'PIC Approved' },
  { key: 'floor', field: 'floor', vi: 'Floor', en: 'Floor' },
  { key: 'status', field: 'status', vi: 'Trạng thái', en: 'Status' },
]

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

  const active = config.filter((cfg) => value[cfg.key])
  const hasAny = active.length > 0 || value.text !== ''

  return (
    // No card: the glass fields float directly on the page background (glass on an opaque white box reads as plain white).
    <Box component="section" aria-label={vi ? 'Bộ lọc' : 'Filters'}>
      {/*
        One grid for search + filters + result/reset:
        lg+ (6 cols): [search ×2][f1][f2][f3][f4] / [f5][f6][f7][f8][count · reset ×2]
        sm (4 cols) and xs (2 cols) wrap the same sequence into more rows.
      */}
      <Box
        sx={(theme) => ({
          ...glassFilterControls(theme),
          display: 'grid',
          gap: '10px',
          alignItems: 'center',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))', lg: 'repeat(6, minmax(0, 1fr))' },
        })}
      >
        <TextField
          fullWidth
          value={value.text}
          onChange={(e) => onChange({ ...value, text: e.target.value })}
          placeholder={vi ? 'Tên / Mã máy / Maker / Vị trí...' : 'Name / Code / Maker / Position...'}
          sx={(theme) => ({ ...glassFilterSearch(theme), gridColumn: { xs: '1 / -1', sm: 'span 2' } })}
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
        {config.map((cfg) => (
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
        ))}
        <Stack direction="row" spacing={1.5} sx={{ gridColumn: { xs: '1 / -1', sm: 'span 2' }, alignItems: 'center', justifyContent: { xs: 'space-between', sm: 'flex-end' }, minWidth: 0 }}>
          <Typography variant="body2" color="text.secondary" noWrap aria-live="polite">
            <Box component="strong" sx={{ color: 'text.primary' }}>{filteredCount.toLocaleString()}</Box> / {rows.length.toLocaleString()} {vi ? 'tài sản' : 'assets'}
          </Typography>
          <Button size="small" color="inherit" startIcon={<FilterAltOffOutlined />} disabled={!hasAny} onClick={onReset} sx={(theme) => ({ ...glassFilterReset(theme), flexShrink: 0 })}>
            {vi ? 'Xóa bộ lọc' : 'Reset filters'}
          </Button>
        </Stack>
      </Box>

      {hasAny && (
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center', mt: 1.25 }} aria-label={vi ? 'Bộ lọc đang áp dụng' : 'Active filters'}>
          <TuneRounded fontSize="small" color="action" aria-hidden />
          {value.text && (
            <Chip
              size="small"
              label={`${vi ? 'Tìm' : 'Search'}: "${value.text}"`}
              onDelete={() => onChange({ ...value, text: '' })}
            />
          )}
          {active.map((cfg) => (
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
