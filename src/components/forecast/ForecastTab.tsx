import { Alert, alpha, Box, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material'
import AccountBalanceWalletOutlined from '@mui/icons-material/AccountBalanceWalletOutlined'
import BuildOutlined from '@mui/icons-material/BuildOutlined'
import EventBusyOutlined from '@mui/icons-material/EventBusyOutlined'
import HistoryOutlined from '@mui/icons-material/HistoryOutlined'
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined'
import TableChartOutlined from '@mui/icons-material/TableChartOutlined'
import TrendingDownOutlined from '@mui/icons-material/TrendingDownOutlined'
import { Bar, Line } from 'react-chartjs-2'
import type { FixedAsset, Lang } from '../../types/fixedAsset'
import { formatMoney, parseDate } from '../../utils/fixedAsset'
import { cartesianScales, useChartTheme } from '../charts/chartTheme'
import { SectionCard } from '../common/SectionCard'
import { StatCard } from '../common/StatCard'
import { EmptyState } from '../common/States'
import { density } from '../../theme/density'

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000

interface ForecastItem {
  row: FixedAsset
  start: Date
  end: Date
  ageYears: number
  currentValue: number
}

export function ForecastTab({ rows, lang }: { rows: FixedAsset[]; lang: Lang }) {
  const vi = lang === 'vi'
  const ct = useChartTheme()

  // --- Forecast calculations (unchanged from the legacy implementation) ---
  const today = new Date()
  const items: ForecastItem[] = rows.flatMap((row) => {
    const start = parseDate(row.dateStart)
    if (!start || !row.depYears || row.depYears <= 0) return []
    const ageYears = Math.max(0, (today.getTime() - start.getTime()) / YEAR_MS)
    const end = new Date(start.getTime() + row.depYears * YEAR_MS)
    const currentValue = Math.max(0, row.cost * (1 - ageYears / row.depYears))
    return [{ row, start, end, ageYears, currentValue }]
  })
  const avgAge = items.length ? items.reduce((s, x) => s + x.ageYears, 0) / items.length : 0
  const soon = items.filter((x) => { const rem = (x.end.getTime() - today.getTime()) / YEAR_MS; return rem > 0 && rem <= 1 }).length
  const overdue = items.filter((x) => x.end <= today).length
  const bookValue = items.reduce((s, x) => s + x.currentValue, 0)
  const startYear = today.getFullYear()
  const years = Array.from({ length: 7 }, (_, i) => startYear + i)
  const remaining = years.map((year) => {
    const at = new Date(year, 0, 1)
    return items.reduce((sum, x) => {
      const age = Math.max(0, (at.getTime() - x.start.getTime()) / YEAR_MS)
      return sum + Math.max(0, x.row.cost * (1 - age / (x.row.depYears || 1)))
    }, 0)
  })
  const eolCounts = years.map((y) => items.filter((x) => x.end.getFullYear() === y).length)
  // --- end calculations ---

  const tooltip = ct.tooltip

  return (
    <Stack spacing={density.gap}>
      <Alert severity="info" icon={<ScheduleOutlined />}>
        {vi ? 'Dự báo dựa trên khấu hao đường thẳng từ DateStart.' : 'Forecast based on straight-line depreciation from DateStart.'}
        {' '}
        {vi
          ? `${items.length.toLocaleString()} / ${rows.length.toLocaleString()} tài sản có DateStart và số năm khấu hao hợp lệ.`
          : `${items.length.toLocaleString()} of ${rows.length.toLocaleString()} assets have a valid DateStart and depreciation years.`}
      </Alert>

      <Box sx={{ display: 'grid', gap: density.gap, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' } }}>
        <StatCard icon={<HistoryOutlined />} label={vi ? 'Tuổi trung bình' : 'Average age'} value={`${avgAge.toFixed(1)} ${vi ? 'năm' : 'yrs'}`} />
        <StatCard icon={<ScheduleOutlined />} tone="warning" label={vi ? 'Sắp hết KH ≤12 tháng' : 'EOL ≤12 months'} value={soon.toLocaleString()} />
        <StatCard icon={<EventBusyOutlined />} tone="error" label={vi ? 'Đã hết khấu hao' : 'Depreciated'} value={overdue.toLocaleString()} />
        <StatCard icon={<AccountBalanceWalletOutlined />} tone="primary" label={vi ? 'Giá trị còn lại' : 'Estimated book value'} value={formatMoney(bookValue)} />
      </Box>

      {items.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={<TrendingDownOutlined />}
            title={vi ? 'Không có dữ liệu để dự báo' : 'No data to forecast'}
            description={vi ? 'Không có tài sản nào (theo bộ lọc hiện tại) có DateStart và số năm khấu hao > 0.' : 'No assets in the current filter have both a DateStart and depreciation years > 0.'}
          />
        </SectionCard>
      ) : (
        <>
          <Box sx={{ display: 'grid', gap: density.gap, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: '1.3fr 1fr' } }}>
            <SectionCard icon={<TrendingDownOutlined />} title={vi ? 'Dự báo tổng giá trị còn lại' : 'Remaining value forecast'} description={vi ? 'Giá trị ước tính tại ngày 01/01 mỗi năm' : 'Estimated value on Jan 1 of each year'} bodySx={{ p: 1.5 }}>
              <Box sx={{ position: 'relative', height: 256 }}>
                <Line
                  data={{ labels: years.map(String), datasets: [{ label: 'Value', data: remaining, borderColor: ct.primary, backgroundColor: alpha(ct.primary, 0.12), pointBackgroundColor: ct.primary, fill: true, tension: 0.3 }] }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: { ...tooltip, callbacks: { label: (c) => ` ${formatMoney(Number(c.raw))}` } } },
                    scales: cartesianScales(ct, { formatValue: formatMoney }),
                  }}
                />
              </Box>
            </SectionCard>
            <SectionCard icon={<BuildOutlined />} title={vi ? 'Tài sản hết khấu hao theo năm' : 'Assets reaching EOL by year'} bodySx={{ p: 1.5 }}>
              <Box sx={{ position: 'relative', height: 256 }}>
                <Bar
                  data={{ labels: years.map(String), datasets: [{ label: 'Assets', data: eolCounts, backgroundColor: ct.warning, borderRadius: 3, maxBarThickness: 36 }] }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip },
                    scales: cartesianScales(ct),
                  }}
                />
              </Box>
            </SectionCard>
          </Box>

          <SectionCard flush icon={<TableChartOutlined />} title={vi ? 'Chi tiết theo năm' : 'Yearly detail'}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{vi ? 'Năm' : 'Year'}</TableCell>
                    <TableCell align="right">{vi ? 'Giá trị còn lại (01/01)' : 'Remaining value (Jan 1)'}</TableCell>
                    <TableCell align="right">{vi ? 'Tài sản hết khấu hao trong năm' : 'Assets reaching EOL in year'}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {years.map((y, i) => (
                    <TableRow hover key={y}>
                      <TableCell sx={{ fontWeight: 600 }}>{y}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(remaining[i])}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{eolCounts[i].toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </SectionCard>
        </>
      )}
    </Stack>
  )
}
