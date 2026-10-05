import { Box, Chip, Tab, Tabs } from '@mui/material'
import AutoGraphOutlined from '@mui/icons-material/AutoGraphOutlined'
import DashboardOutlined from '@mui/icons-material/DashboardOutlined'
import MapOutlined from '@mui/icons-material/MapOutlined'
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined'
import MoveUpOutlined from '@mui/icons-material/MoveUpOutlined'
import ReportProblemOutlined from '@mui/icons-material/ReportProblemOutlined'
import TableRowsOutlined from '@mui/icons-material/TableRowsOutlined'
import type { ReactElement, ReactNode } from 'react'
import type { AppTab, Lang } from '../../types/fixedAsset'
import { glassRadius, glassTabs, HEADER_HEIGHT } from '../../theme/liquidGlass'

export const tabs: Array<{ key: AppTab; vi: string; en: string; icon: ReactElement }> = [
  { key: 'overview', vi: 'Tổng quan', en: 'Overview', icon: <DashboardOutlined fontSize="small" /> },
  { key: 'table', vi: 'Danh sách chi tiết', en: 'Details', icon: <TableRowsOutlined fontSize="small" /> },
  { key: 'map', vi: 'Sơ đồ vị trí', en: 'Location map', icon: <MapOutlined fontSize="small" /> },
  { key: 'relocation', vi: 'Di dời máy', en: 'Relocation', icon: <MoveUpOutlined fontSize="small" /> },
  { key: 'issues', vi: 'Sai lệch FI', en: 'FI Issues', icon: <ReportProblemOutlined fontSize="small" /> },
  { key: 'forecast', vi: 'Dự báo tương lai', en: 'Forecast', icon: <AutoGraphOutlined fontSize="small" /> },
  { key: 'guide', vi: 'Hướng dẫn', en: 'Guide', icon: <MenuBookOutlined fontSize="small" /> },
]

export const tabId = (key: AppTab) => `dashboard-tab-${key}`
export const tabPanelId = (key: AppTab) => `dashboard-tabpanel-${key}`

interface Props {
  lang: Lang
  value: AppTab
  onChange: (tab: AppTab) => void
  issueCount: number
  /** Right-aligned content on the same row (e.g. the collapse toggle of the summary/filters). */
  endSlot?: ReactNode
}

export function DashboardTabs({ lang, value, onChange, issueCount, endSlot }: Props) {
  const vi = lang === 'vi'
  return (
    // Sticky floating glass bar directly under the header; content scrolls beneath it.
    <Box sx={{ position: 'sticky', top: HEADER_HEIGHT + 6, zIndex: (t) => t.zIndex.appBar - 1, display: 'flex', alignItems: 'center', flexWrap: { xs: 'wrap', md: 'nowrap' }, gap: 1 }}>
      <Tabs
        sx={(theme) => ({ ...glassTabs(theme), maxWidth: '100%', width: 'fit-content', minWidth: 0 })}
        value={value}
        onChange={(_, next: AppTab) => onChange(next)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        aria-label={vi ? 'Các màn hình' : 'Dashboard sections'}
      >
        {tabs.map((item) => (
          <Tab
            key={item.key}
            value={item.key}
            id={tabId(item.key)}
            aria-controls={tabPanelId(item.key)}
            icon={item.icon}
            iconPosition="start"
            label={
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                {vi ? item.vi : item.en}
                {item.key === 'issues' && issueCount > 0 && (
                  <Chip size="small" color="warning" label={issueCount.toLocaleString()} sx={{ height: 18, fontSize: '0.6875rem', borderRadius: `${glassRadius.capsule}px`, '& .MuiChip-label': { px: 0.75 } }} />
                )}
              </Box>
            }
          />
        ))}
      </Tabs>
      {endSlot && <Box sx={{ ml: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center' }}>{endSlot}</Box>}
    </Box>
  )
}
