import { Box } from '@mui/material'
import { lazy, memo, Suspense, useCallback, useDeferredValue, useMemo, useState, type ReactNode } from 'react'
import { ErrorState, LoadingState } from './components/common/States'
import { DashboardTabs, tabId, tabPanelId } from './components/dashboard/DashboardTabs'
import { Header } from './components/dashboard/Header'
import { SummaryCards } from './components/dashboard/SummaryCards'
import { UploadBar } from './components/dashboard/UploadBar'
import { FilterBar } from './components/filters/FilterBar'
import { ForecastTab } from './components/forecast/ForecastTab'
import { IssuesTab } from './components/issues/IssuesTab'
import { OverviewTab } from './components/overview/OverviewTab'
import { AssetTable } from './components/table/AssetTable'
import { useAssetFilters } from './hooks/useAssetFilters'
import { useFixedAssets } from './hooks/useFixedAssets'
import { useLanguage } from './hooks/useLanguage'
import { useThemeMode } from './hooks/useThemeMode'
import { AppLayout } from './layout/AppLayout'
import type { AppTab } from './types/fixedAsset'
import { issueKinds } from './utils/fixedAsset'
import { density } from './theme/density'

// Map (layout images in src/assets/maps) and Guide (base64 guide images in legacyData.ts) load on demand.
const MapTab = lazy(() => import('./components/map/MapTab'))
const GuideTab = lazy(() => import('./components/guide/GuideTab'))

const DATA_TABS: AppTab[] = ['overview', 'table', 'map', 'issues', 'forecast']

interface PanelProps {
  tab: AppTab
  active: boolean
  fallback: ReactNode
  children: ReactNode
}

/**
 * Tab panel that stays mounted after its first visit (hidden via the `hidden` attribute),
 * so returning to a tab keeps its DOM and state instead of rebuilding it.
 * While hidden it skips re-rendering entirely; it catches up with the latest props when shown again.
 */
const TabPanel = memo(
  function TabPanel({ tab, active, fallback, children }: PanelProps) {
    return (
      <Box role="tabpanel" id={tabPanelId(tab)} aria-labelledby={tabId(tab)} hidden={!active} sx={{ pt: density.tabGap }}>
        <Suspense fallback={fallback}>{children}</Suspense>
      </Box>
    )
  },
  (prev, next) => !prev.active && !next.active,
)

export function App() {
  const { mode, toggleMode } = useThemeMode()
  const { lang, setLang } = useLanguage('vi')
  const { data, status, busy, hasLoaded, reload, upload, importFromUrl } = useFixedAssets()
  const { filters, setFilters, filteredRows, resetFilters } = useAssetFilters(data.tableData)
  const [tab, setTab] = useState<AppTab>('overview')
  const [visited, setVisited] = useState<ReadonlySet<AppTab>>(() => new Set<AppTab>(['overview']))
  const vi = lang === 'vi'
  // Tab content may lag a frame behind typing; the filter bar and summary stay immediate.
  const tabRows = useDeferredValue(filteredRows)

  const changeTab = useCallback((next: AppTab) => {
    setTab(next)
    setVisited((prev) => (prev.has(next) ? prev : new Set(prev).add(next)))
  }, [])

  const flaggedCount = useMemo(() => filteredRows.filter((r) => issueKinds(r).length > 0).length, [filteredRows])
  const initialLoading = !hasLoaded && status.type === 'loading'
  const initialError = !hasLoaded && status.type === 'error' && status.operation === 'load'

  const dataReady = !initialLoading && !initialError
  const suspenseFallback = <LoadingState label={vi ? 'Đang tải...' : 'Loading...'} />

  const renderDataTab = (key: AppTab) => {
    switch (key) {
      case 'overview': return <OverviewTab rows={tabRows} lang={lang} />
      case 'table': return <AssetTable rows={tabRows} lang={lang} />
      case 'map': return <MapTab rows={tabRows} lang={lang} />
      case 'issues': return <IssuesTab rows={tabRows} lang={lang} />
      case 'forecast': return <ForecastTab rows={tabRows} lang={lang} />
      default: return null
    }
  }

  return (
    <AppLayout
      mode={mode}
      header={
        <Header
          lang={lang}
          mode={mode}
          rowCount={data.tableData.length}
          updatedAt={data.lastImport?.imported_at}
          status={status}
          onRefresh={reload}
          onChangeLang={setLang}
          onToggleTheme={toggleMode}
        />
      }
    >
      <UploadBar
        lang={lang}
        status={status}
        lastImport={data.lastImport}
        rowCount={data.tableData.length}
        busy={busy}
        onUpload={upload}
        onLoadUrl={importFromUrl}
      />

      <SummaryCards rows={filteredRows} totalRows={data.tableData.length} flaggedCount={flaggedCount} lang={lang} loading={initialLoading} />

      <FilterBar
        lang={lang}
        rows={data.tableData}
        filteredCount={filteredRows.length}
        value={filters}
        onChange={setFilters}
        onReset={resetFilters}
      />

      <Box>
        <DashboardTabs lang={lang} value={tab} onChange={changeTab} issueCount={flaggedCount} />
        {!dataReady && tab !== 'guide' && (
          <Box role="tabpanel" id={tabPanelId(tab)} aria-labelledby={tabId(tab)} sx={{ pt: density.tabGap }}>
            {initialError ? (
              <ErrorState
                title={vi ? 'Không tải được dữ liệu tài sản' : 'Could not load asset data'}
                message={`${vi ? 'Không kết nối được tới GET /api/assets' : 'Request to GET /api/assets failed'}: ${status.type === 'error' ? status.message : ''}`}
                onRetry={reload}
                retryLabel={vi ? 'Thử lại' : 'Retry'}
              />
            ) : (
              <LoadingState label={vi ? 'Đang tải dữ liệu từ server...' : 'Loading data from server...'} />
            )}
          </Box>
        )}
        {dataReady && DATA_TABS.filter((key) => visited.has(key)).map((key) => (
          <TabPanel key={key} tab={key} active={tab === key} fallback={suspenseFallback}>
            {renderDataTab(key)}
          </TabPanel>
        ))}
        {visited.has('guide') && (
          <TabPanel tab="guide" active={tab === 'guide'} fallback={suspenseFallback}>
            <GuideTab lang={lang} />
          </TabPanel>
        )}
      </Box>
    </AppLayout>
  )
}
