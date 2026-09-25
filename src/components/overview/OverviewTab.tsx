import { Box, Stack, Typography } from '@mui/material'
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined'
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined'
import CategoryOutlined from '@mui/icons-material/CategoryOutlined'
import DomainOutlined from '@mui/icons-material/DomainOutlined'
import FactoryOutlined from '@mui/icons-material/FactoryOutlined'
import LayersOutlined from '@mui/icons-material/LayersOutlined'
import PaidOutlined from '@mui/icons-material/PaidOutlined'
import PersonSearchOutlined from '@mui/icons-material/PersonSearchOutlined'
import VerifiedUserOutlined from '@mui/icons-material/VerifiedUserOutlined'
import { memo, useMemo, type ReactNode } from 'react'
import type { FixedAsset, Lang } from '../../types/fixedAsset'
import { countBy, sumBy } from '../../utils/fixedAsset'
import { ChartCard } from './ChartCard'
import { density } from '../../theme/density'

function entriesSorted(map: Record<string, number>, limit = 12) {
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, limit)
}

function ChartGroup({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <Stack spacing={0.75} component="section">
      <Typography variant="overline" color="text.secondary" component="h2">{title}</Typography>
      <Box sx={{ display: 'grid', gap: density.gap, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' } }}>
        {children}
      </Box>
    </Stack>
  )
}

function OverviewTabImpl({ rows, lang }: { rows: FixedAsset[]; lang: Lang }) {
  const vi = lang === 'vi'

  const charts = useMemo(() => {
    const years: Record<string, number> = {}
    for (const r of rows) {
      const m = String(r.dateStart ?? '').match(/(19|20)\d{2}/)
      if (m) years[m[0]] = (years[m[0]] ?? 0) + 1
    }
    return {
      factory: entriesSorted(countBy(rows, 'factory')),
      div: entriesSorted(countBy(rows, 'div')),
      kind: entriesSorted(countBy(rows, 'kind')),
      pic: entriesSorted(countBy(rows, 'pic')),
      group: entriesSorted(countBy(rows, 'group')),
      floor: entriesSorted(countBy(rows, 'floor')),
      approved: entriesSorted(countBy(rows, 'pic_approved')),
      valueByKind: entriesSorted(sumBy(rows, 'kind')),
      years: Object.entries(years).sort((a, b) => a[0].localeCompare(b[0])),
    }
  }, [rows])

  const empty = vi ? 'Không có dữ liệu phù hợp bộ lọc' : 'No data for the current filters'
  const top12 = vi ? 'Top 12 theo số lượng' : 'Top 12 by quantity'

  return (
    <Stack spacing={2}>
      <ChartGroup title={vi ? 'Vị trí & tổ chức' : 'Location & organization'}>
        <ChartCard icon={<FactoryOutlined />} title={vi ? 'Theo Factory' : 'By Factory'} description={top12} type="bar" values={charts.factory} emptyLabel={empty} />
        <ChartCard icon={<DomainOutlined />} title="Div" description={top12} type="bar" values={charts.div} emptyLabel={empty} />
        <ChartCard icon={<LayersOutlined />} title="Floor" description={top12} type="doughnut" values={charts.floor} emptyLabel={empty} />
      </ChartGroup>

      <ChartGroup title={vi ? 'Phân loại tài sản' : 'Asset classification'}>
        <ChartCard icon={<CategoryOutlined />} title={vi ? 'Theo loại tài sản' : 'By asset type'} description={top12} type="doughnut" values={charts.kind} emptyLabel={empty} />
        <ChartCard icon={<PaidOutlined />} title={vi ? 'Giá trị theo loại tài sản' : 'Value by asset type'} description={vi ? 'Tổng History Cost, top 12' : 'Sum of History Cost, top 12'} type="bar" values={charts.valueByKind} money emptyLabel={empty} />
        <ChartCard icon={<CalendarMonthOutlined />} title={vi ? 'Theo năm đưa vào sử dụng' : 'By start year'} description="DateStart" type="bar" values={charts.years} emptyLabel={empty} />
      </ChartGroup>

      <ChartGroup title={vi ? 'Trách nhiệm quản lý' : 'Responsibility'}>
        <ChartCard icon={<PersonSearchOutlined />} title="PIC Checked" description={top12} type="bar" horizontal values={charts.pic} emptyLabel={empty} height={264} />
        <ChartCard icon={<VerifiedUserOutlined />} title="PIC Approved" description={top12} type="bar" horizontal values={charts.approved} emptyLabel={empty} height={264} />
        <ChartCard icon={<AccountTreeOutlined />} title={vi ? 'Theo bộ phận' : 'By group'} description={top12} type="bar" horizontal values={charts.group} emptyLabel={empty} height={264} />
      </ChartGroup>
    </Stack>
  )
}

export const OverviewTab = memo(OverviewTabImpl)
