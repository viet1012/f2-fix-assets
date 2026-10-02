import { Box, type PaletteMode } from '@mui/material'
import { lazy, memo, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/authContext'
import { LoginPage } from './components/auth/LoginPage'
import { ErrorState, LoadingState } from './components/common/States'
import { DashboardTabs, tabId, tabPanelId } from './components/dashboard/DashboardTabs'
import { Header } from './components/dashboard/Header'
import { SummaryCards } from './components/dashboard/SummaryCards'
import { UploadBar } from './components/dashboard/UploadBar'
import { FilterBar } from './components/filters/FilterBar'
import { OverviewTab } from './components/overview/OverviewTab'
import { useAssetFilters } from './hooks/useAssetFilters'
import { useFixedAssets } from './hooks/useFixedAssets'
import { useLanguage } from './hooks/useLanguage'
import { useThemeMode } from './hooks/useThemeMode'
import { AppLayout } from './layout/AppLayout'
import type { AppTab, Lang } from './types/fixedAsset'
import { issueKinds } from './utils/fixedAsset'
import { density } from './theme/density'

// Map (data/mapData + assets/maps) and Guide (data/guideData + assets/guide) are separate lazy chunks.
const MapTab = lazy(() => import('./components/map/MapTab'))
const GuideTab = lazy(() => import('./components/guide/GuideTab'))

// Non-default tabs: lazy chunks, prefetched at idle once data is ready (see prefetchTabModules).
// Overview stays eager: it is the default tab and needs Chart.js on first paint.
const loadAssetTable = () => import('./components/table/AssetTable')
const loadIssuesTab = () => import('./components/issues/IssuesTab')
const loadForecastTab = () => import('./components/forecast/ForecastTab')
const loadRelocationTab = () => import('./components/relocation/RelocationTab')
const AssetTable = lazy(() => loadAssetTable().then((m) => ({ default: m.AssetTable })))
const IssuesTab = lazy(() => loadIssuesTab().then((m) => ({ default: m.IssuesTab })))
const ForecastTab = lazy(() => loadForecastTab().then((m) => ({ default: m.ForecastTab })))
const RelocationTab = lazy(loadRelocationTab)

/**
 * Warm the browser module cache for the lazy tabs during idle time, so the first switch is instant.
 * Loads JS only: these modules have no top-level side effects (no fetch/storage) until rendered.
 * Returns a cancel function for effect cleanup.
 */
function prefetchTabModules(): () => void {
  const run = () => {
    // A failed prefetch is harmless; the real lazy() import retries when the tab is opened.
    for (const load of [loadAssetTable, loadIssuesTab, loadForecastTab, loadRelocationTab]) load().catch(() => { })
  }
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run, { timeout: 3000 })
    return () => window.cancelIdleCallback(id)
  }
  const id = globalThis.setTimeout(run, 1500)
  return () => globalThis.clearTimeout(id)
}

const DATA_TABS: AppTab[] = ['overview', 'table', 'map', 'relocation', 'issues', 'forecast']

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

interface Shell {
  lang: Lang
  setLang: (lang: Lang) => void
  mode: PaletteMode
  toggleMode: () => void
}

/** Session cookie auth: GET /api/auth/me first; the dashboard (and its /api calls) only mounts once logged in. */
export function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  )
}

function AuthGate() {
  const { mode, toggleMode } = useThemeMode()
  const { lang, setLang } = useLanguage('vi')
  const auth = useAuth()
  const shell = { lang, setLang, mode, toggleMode }
  if (auth.status === 'authenticated' && auth.account) return <Dashboard {...shell} account={auth.account} onLogout={auth.logout} />
  return (
    <AppLayout mode={mode} header={null}>
      {auth.status === 'checking' ? (
        <LoadingState label={lang === 'vi' ? 'Đang kiểm tra phiên đăng nhập...' : 'Checking your session...'} />
      ) : (
        <LoginPage lang={lang} mode={mode} onChangeLang={setLang} onToggleTheme={toggleMode} onLogin={auth.login} />
      )}
    </AppLayout>
  )
}

function Dashboard({ lang, setLang, mode, toggleMode, account, onLogout }: Shell & { account: string; onLogout: () => Promise<void> }) {
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

  // Prefetch lazy tab code only after the first data load has settled (never during first paint).
  useEffect(() => {
    if (hasLoaded) return prefetchTabModules()
  }, [hasLoaded])

  const suspenseFallback = <LoadingState label={vi ? 'Đang tải...' : 'Loading...'} />

  const renderDataTab = (key: AppTab) => {
    switch (key) {
      case 'overview': return <OverviewTab rows={tabRows} lang={lang} />
      case 'table': return <AssetTable rows={tabRows} lang={lang} />
      case 'map': return <MapTab rows={tabRows} lang={lang} />
      // Relocation loads its own data from the location API.
      case 'relocation': return <RelocationTab lang={lang} account={account} />
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
          account={account}
          onLogout={onLogout}
        />
      }
    >
      {/* <UploadBar
        lang={lang}
        status={status}
        lastImport={data.lastImport}
        rowCount={data.tableData.length}
        busy={busy}
        onUpload={upload}
        onLoadUrl={importFromUrl}
      /> */}

      <SummaryCards rows={filteredRows} totalRows={data.tableData.length} flaggedCount={flaggedCount} lang={lang} loading={initialLoading} onOpenIssues={() => changeTab('issues')} />

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
