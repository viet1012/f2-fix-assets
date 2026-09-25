import { Box } from '@mui/material'
import BarChartOutlined from '@mui/icons-material/BarChartOutlined'
import type { ReactNode } from 'react'
import { Bar, Doughnut } from 'react-chartjs-2'
import { formatMoney } from '../../utils/fixedAsset'
import { cartesianScales, useChartTheme } from '../charts/chartTheme'
import { SectionCard } from '../common/SectionCard'
import { EmptyState } from '../common/States'

interface Props {
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  type: 'bar' | 'doughnut'
  values: Array<[string, number]>
  money?: boolean
  /** Horizontal bars for long category labels (names). */
  horizontal?: boolean
  emptyLabel: ReactNode
  height?: number
}

export function ChartCard({ title, description, icon, type, values, money = false, horizontal = false, emptyLabel, height = 216 }: Props) {
  const ct = useChartTheme()
  const format = (v: number) => (money ? formatMoney(v) : v.toLocaleString())

  const data = {
    labels: values.map(([k]) => k),
    datasets: [{
      label: money ? 'Value' : 'Qty',
      data: values.map(([, v]) => v),
      backgroundColor: type === 'doughnut' ? values.map((_, i) => ct.categorical[i % ct.categorical.length]) : ct.primary,
      borderColor: type === 'doughnut' ? ct.border : undefined,
      borderWidth: type === 'doughnut' ? 2 : 0,
      borderRadius: type === 'bar' ? 3 : undefined,
      maxBarThickness: 28,
    }],
  }

  const tooltip = {
    ...ct.tooltip,
    callbacks: { label: (ctx: { label: string; raw: unknown }) => ` ${ctx.label}: ${format(Number(ctx.raw))}` },
  }

  return (
    <SectionCard title={title} description={description} icon={icon} bodySx={{ px: 1.5, py: 1.25 }}>
      <Box sx={{ position: 'relative', height }}>
        {values.length === 0 ? (
          <EmptyState compact icon={<BarChartOutlined />} title={emptyLabel} />
        ) : type === 'doughnut' ? (
          <Doughnut
            data={data}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              cutout: '62%',
              plugins: {
                legend: { display: true, position: 'right', labels: { color: ct.text, font: ct.font, boxWidth: 10, boxHeight: 10, padding: 8 } },
                tooltip,
              },
            }}
          />
        ) : (
          <Bar
            data={data}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              indexAxis: horizontal ? 'y' : 'x',
              plugins: { legend: { display: false }, tooltip },
              scales: cartesianScales(ct, { horizontal, formatValue: money ? formatMoney : undefined }),
            }}
          />
        )}
      </Box>
    </SectionCard>
  )
}
