import { Box, ButtonBase, Collapse, IconButton, Tooltip, Typography, useMediaQuery } from '@mui/material'
import type { Theme } from '@mui/material'
import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded'
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded'
import FilterAltOutlined from '@mui/icons-material/FilterAltOutlined'
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined'
import ReportProblemOutlined from '@mui/icons-material/ReportProblemOutlined'
import { memo, useCallback, useEffect, useId, useState, type ReactElement, type ReactNode } from 'react'
import type { AppTab, DashboardFilters, FixedAsset, Lang } from '../../types/fixedAsset'
import { emptyFilters } from '../../utils/fixedAsset'
import { glassIconButton, glassRadius, px } from '../../theme/liquidGlass'
import { density } from '../../theme/density'
import { FilterBar } from '../filters/FilterBar'
import { DashboardTabs } from './DashboardTabs'
import { SummaryCards } from './SummaryCards'

export const COLLAPSED_STORAGE_KEY = 'f2.controlsCollapsed'
/** Tabs that ignore the dashboard filters: the controls auto-collapse there (without touching the saved choice). */
const UNFILTERED_TABS: ReadonlySet<AppTab> = new Set<AppTab>(['relocation', 'guide'])

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0')
  } catch {
    // Storage blocked: the choice just lasts for this session.
  }
}

/** Number of filter fields that differ from their default value. */
export const countActiveFilters = (filters: DashboardFilters) =>
  (Object.keys(emptyFilters) as Array<keyof DashboardFilters>).filter((k) => filters[k] !== emptyFilters[k]).length

const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

interface StatProps {
  icon: ReactElement
  value: number
  /** Word after the number, hidden on narrow screens (icon + number only). */
  unit?: string
  label: string
  warning?: boolean
  onClick?: () => void
}

/** Small capsule in the tab row: icon + number (+ unit from sm). A button when onClick is set. */
function Stat({ icon, value, unit, label, warning = false, onClick }: StatProps) {
  const sx = (theme: Theme) => ({
    height: px(26),
    px: 1,
    gap: 0.5,
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: px(glassRadius.capsule),
    border: `1px solid ${theme.palette.divider}`,
    bgcolor: 'background.paper',
    fontSize: 12,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    color: warning ? 'warning.main' : 'text.primary',
    '& svg': { fontSize: 15, color: warning ? 'warning.main' : 'text.secondary' },
    ...(onClick && { '&:hover': { bgcolor: 'action.hover' }, '&.Mui-focusVisible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 1 } }),
  })
  const content: ReactNode = (
    <>
      {icon}
      {value.toLocaleString()}
      {unit && <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, fontWeight: 500, color: 'text.secondary' }}>{unit}</Box>}
    </>
  )
  return onClick ? (
    <ButtonBase aria-label={label} onClick={onClick} sx={sx}>{content}</ButtonBase>
  ) : (
    <Box component="span" role="img" aria-label={label} sx={sx}>{content}</Box>
  )
}

interface Props {
  lang: Lang
  tab: AppTab
  onChangeTab: (tab: AppTab) => void
  /** All rows (before filtering). */
  rows: FixedAsset[]
  filteredRows: FixedAsset[]
  flaggedCount: number
  filters: DashboardFilters
  onChangeFilters: (next: DashboardFilters) => void
  onReset: () => void
  loading?: boolean
  onOpenIssues?: () => void
}

/**
 * Tab row + collapsible SummaryCards/FilterBar right below it. The collapse toggle and a compact summary
 * sit at the right end of the tab row (Alt+F toggles; choice saved in localStorage).
 */
function DashboardControlsImpl({ lang, tab, onChangeTab, rows, filteredRows, flaggedCount, filters, onChangeFilters, onReset, loading = false, onOpenIssues }: Props) {
  const vi = lang === 'vi'
  const regionId = useId()
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)', { noSsr: true })
  const [userCollapsed, setUserCollapsed] = useState(readCollapsed)
  // On auto-collapsed tabs the user may still open the section; that override is per visit and never saved.
  const [autoOpen, setAutoOpen] = useState(false)
  const [lastTab, setLastTab] = useState(tab)
  if (lastTab !== tab) {
    setLastTab(tab)
    setAutoOpen(false)
  }
  const auto = UNFILTERED_TABS.has(tab)
  const collapsed = auto ? !autoOpen : userCollapsed

  const setOpen = useCallback((open: boolean) => {
    if (auto) {
      setAutoOpen(open)
      return
    }
    writeCollapsed(!open)
    setUserCollapsed(!open)
  }, [auto])
  const toggle = useCallback(() => setOpen(collapsed), [setOpen, collapsed])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || (e.code !== 'KeyF' && e.key.toLowerCase() !== 'f')) return
      if (isTypingTarget(e.target)) return
      e.preventDefault()
      toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  const activeCount = countActiveFilters(filters)
  const toggleLabel = collapsed ? (vi ? 'Mở rộng tổng quan & bộ lọc' : 'Expand overview & filters') : vi ? 'Thu gọn tổng quan & bộ lọc' : 'Collapse overview & filters'

  const endSlot = (
    <Box data-testid="controls-toggle-row" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      {auto && (
        <Typography component="span" sx={{ fontSize: 11, fontStyle: 'italic', color: 'text.secondary' }}>
          {vi ? 'Bộ lọc không áp dụng cho tab này' : 'Filters do not apply to this tab'}
        </Typography>
      )}
      {collapsed && !auto && !loading && (
        <Box data-testid="controls-summary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Stat
            icon={<Inventory2Outlined />}
            value={filteredRows.length}
            unit={vi ? 'TS' : 'assets'}
            label={`${filteredRows.length.toLocaleString()}/${rows.length.toLocaleString()} ${vi ? 'tài sản' : 'assets'}`}
          />
          <Stat
            icon={<ReportProblemOutlined />}
            value={flaggedCount}
            warning={flaggedCount > 0}
            label={`${flaggedCount.toLocaleString()} ${vi ? 'cần xử lý' : 'need attention'}`}
            onClick={onOpenIssues}
          />
          {activeCount > 0 && (
            <Stat
              icon={<FilterAltOutlined />}
              value={activeCount}
              label={`${vi ? 'Bộ lọc' : 'Filters'}: ${activeCount} ${vi ? 'đang áp dụng' : 'active'}`}
              onClick={() => setOpen(true)}
            />
          )}
        </Box>
      )}
      <Tooltip title={`${toggleLabel} (Alt+F)`}>
        <IconButton aria-label={toggleLabel} aria-expanded={!collapsed} aria-controls={regionId} onClick={toggle} sx={(theme) => glassIconButton(theme, 32)}>
          {collapsed ? <ExpandMoreRounded fontSize="small" /> : <ExpandLessRounded fontSize="small" />}
        </IconButton>
      </Tooltip>
    </Box>
  )

  return (
    <>
      <DashboardTabs lang={lang} value={tab} onChange={onChangeTab} issueCount={flaggedCount} endSlot={endSlot} />
      <Collapse in={!collapsed} timeout={reducedMotion ? 0 : 200} id={regionId}>
        <Box sx={{ display: 'grid', gap: density.tabGap, pt: density.tabGap }}>
          <SummaryCards rows={filteredRows} totalRows={rows.length} flaggedCount={flaggedCount} lang={lang} loading={loading} onOpenIssues={onOpenIssues} />
          <FilterBar lang={lang} rows={rows} filteredCount={filteredRows.length} value={filters} onChange={onChangeFilters} onReset={onReset} />
        </Box>
      </Collapse>
    </>
  )
}

export const DashboardControls = memo(DashboardControlsImpl)
