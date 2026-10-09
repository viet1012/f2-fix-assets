import { alpha, Box, IconButton, Tooltip, useMediaQuery, useTheme } from '@mui/material'
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined'
import { Chart, type Plugin } from 'chart.js'
import { useMemo, useRef, type ReactNode, type RefObject } from 'react'
import { Bar, Doughnut } from 'react-chartjs-2'
import { formatMoney } from '../../utils/fixedAsset'
import { useChartTheme } from '../charts/chartTheme'
import { colorForName, useChartDefaults } from '../../theme/chartTheme'
import { SectionCard } from '../common/SectionCard'
import { isMeaningless, mergeSmall, sortDesc, truncate, type Pairs } from './chartData'

interface Props {
  title: ReactNode
  icon?: ReactNode
  /** horizontal-bar: sorted bars with "qty (x%)" labels; bar: vertical bars in given order; doughnut: % on slices ≥ 6%. */
  type: 'horizontal-bar' | 'bar' | 'doughnut'
  values: Pairs
  /** Plotted value is money (History Cost). */
  money?: boolean
  /** Colour bars by category name (fixed per name across charts) instead of the single primary colour. */
  categorical?: boolean
  /** Extra tooltip line: total value per label (count charts). */
  valueMap?: Record<string, number>
  labels: { qty: string; value: string; download: string }
  /** Label of the merged bucket ("Khác" / "Others"). */
  othersLabel: string
  /** One-line message shown when the field has no meaningful data. */
  emptyLabel: ReactNode
  /** Base filename of the PNG download. */
  fileName: string
}

interface LabelCfg { color: string; font: string; format: (v: number, total: number) => string; mode: Props['type'] }

const ROW_PX = 28
const LABEL_FONT = (family: string) => `600 12px ${family}`

let measureCtx: CanvasRenderingContext2D | null = null
function textWidth(text: string, font: string): number {
  measureCtx ??= document.createElement('canvas').getContext('2d')
  if (!measureCtx) return text.length * 7
  measureCtx.font = font
  return measureCtx.measureText(text).width
}

/** Draws value labels on bars / doughnut slices (the legacy page used chartjs-plugin-datalabels). */
function valueLabels(cfgRef: RefObject<LabelCfg>): Plugin {
  return {
  id: 'ovValueLabels',
  afterDatasetsDraw(chart) {
    const cfg = cfgRef.current
    const meta = chart.getDatasetMeta(0)
    if (!cfg || !meta?.data.length) return
    const data = chart.data.datasets[0].data as number[]
    const total = data.reduce((a, v) => a + v, 0) || 1
    const { ctx } = chart
    ctx.save()
    meta.data.forEach((el, i) => {
      const v = data[i]
      if (!v || !chart.getDataVisibility(i)) return
      const p = el as unknown as { x: number; y: number; getCenterPoint: () => { x: number; y: number } }
      if (cfg.mode === 'doughnut') {
        if (v / total < 0.06) return
        const c = p.getCenterPoint()
        ctx.font = cfg.font.replace(/^600/, '700')
        ctx.fillStyle = '#fff'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(`${((v / total) * 100).toFixed(0)}%`, c.x, c.y)
      } else if (cfg.mode === 'horizontal-bar') {
        ctx.font = cfg.font
        ctx.fillStyle = cfg.color
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText(cfg.format(v, total), p.x + 6, p.y)
      } else if (data.length <= 25) {
        ctx.font = cfg.font
        ctx.fillStyle = cfg.color
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        ctx.fillText(cfg.format(v, total), p.x, p.y - 3)
      }
    })
    ctx.restore()
  },
  }
}

export function ChartCard({ title, icon, type, values: raw, money = false, categorical = false, valueMap, labels, othersLabel, emptyLabel, fileName }: Props) {
  useChartDefaults()
  const theme = useTheme()
  const ct = useChartTheme()
  const lgUp = useMediaQuery(theme.breakpoints.up('lg'))
  const boxRef = useRef<HTMLDivElement>(null)
  const fmt = (v: number) => (money ? formatMoney(v) : v.toLocaleString())
  const family = theme.typography.fontFamily as string
  const font = LABEL_FONT(family)
  const format = (v: number, total: number) => (type === 'bar' ? v.toLocaleString() : `${fmt(v)} (${((v / total) * 100).toFixed(0)}%)`)

  const cfgRef = useRef<LabelCfg>(null!)
  cfgRef.current = { color: theme.palette.text.primary, font, mode: type, format }
  const plugins = useMemo(() => [valueLabels(cfgRef)], [])

  const values = useMemo(
    () => (type === 'doughnut' ? mergeSmall(raw, othersLabel) : type === 'horizontal-bar' ? sortDesc(raw, othersLabel) : raw),
    [raw, type, othersLabel],
  )
  const total = values.reduce((a, [, v]) => a + v, 0) || 1
  const empty = isMeaningless(raw)

  const titleNode = <Box component="span" sx={{ fontSize: 14, fontWeight: 600 }}>{title}</Box>

  if (empty) {
    return (
      <SectionCard title={titleNode} icon={icon} description={emptyLabel} sx={{ alignSelf: 'start' }} bodySx={{ display: 'none' }}>
        {null}
      </SectionCard>
    )
  }

  const download = () => {
    const canvas = boxRef.current?.querySelector('canvas')
    if (!canvas) return
    const tmp = document.createElement('canvas')
    tmp.width = canvas.width
    tmp.height = canvas.height
    const tctx = tmp.getContext('2d')
    if (!tctx) return
    tctx.fillStyle = ct.border // card background of the current mode
    tctx.fillRect(0, 0, tmp.width, tmp.height)
    tctx.drawImage(canvas, 0, 0)
    const a = document.createElement('a')
    a.href = tmp.toDataURL('image/png', 1)
    a.download = `${fileName}.png`
    a.click()
  }

  const names = values.map(([k]) => k)
  const othersColor = alpha(theme.palette.text.secondary, 0.45)
  const maxIdx = values.reduce((best, [k, v], i) => (k !== othersLabel && v > values[best][1] ? i : best), 0)
  const colors = names.map((k, i) => {
    if (k === othersLabel) return othersColor
    if (type === 'doughnut' || categorical) return colorForName(k, ct.mode)
    return i === maxIdx || type === 'bar' ? ct.primary : alpha(ct.primary, 0.75)
  })

  const data = {
    labels: names,
    datasets: [{
      label: money ? labels.value : labels.qty,
      data: values.map(([, v]) => v),
      backgroundColor: colors,
      borderColor: type === 'doughnut' ? ct.border : undefined,
      borderWidth: type === 'doughnut' ? 2 : 0,
      borderRadius: type === 'horizontal-bar' ? 4 : type === 'bar' ? 3 : undefined,
      maxBarThickness: 22,
    }],
  }

  const tooltip = {
    ...ct.tooltip,
    callbacks: {
      label: (ctx: { label: string; raw: unknown }) => ` ${type === 'doughnut' ? ctx.label : money ? labels.value : labels.qty}: ${format(Number(ctx.raw), total)}`,
      afterLabel: (ctx: { label: string }) => (valueMap?.[ctx.label] != null ? ` ${labels.value}: ${formatMoney(valueMap[ctx.label])}` : ''),
    },
  }

  const actions = (
    <Tooltip title={labels.download}>
      <IconButton size="small" onClick={download} aria-label={labels.download} sx={{ my: -0.5 }}>
        <FileDownloadOutlined fontSize="small" />
      </IconButton>
    </Tooltip>
  )

  const rowsNeed = type === 'horizontal-bar' ? values.length * ROW_PX + 32 : 0
  const height = { xs: Math.max(260, rowsNeed), lg: Math.max(300, rowsNeed) }
  const padRight = type === 'horizontal-bar' ? Math.ceil(Math.max(...values.map(([, v]) => textWidth(format(v, total), font)))) + 12 : 0
  const valueTick = (v: string | number) => (money ? `$${(Number(v) / 1000).toFixed(0)}k` : Number(v).toLocaleString())

  return (
    <SectionCard title={titleNode} icon={icon} actions={actions} bodySx={{ px: 1.5, py: 1 }}>
      <Box ref={boxRef} sx={{ position: 'relative', height }}>
        {type === 'doughnut' ? (
          <Doughnut
            data={data}
            plugins={plugins}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              cutout: '62%',
              plugins: {
                legend: {
                  display: true,
                  position: lgUp ? 'right' : 'bottom',
                  labels: {
                    boxWidth: 10,
                    boxHeight: 10,
                    padding: 8,
                    font: { size: 13 },
                    generateLabels: (chart) =>
                      Chart.overrides.doughnut.plugins.legend.labels.generateLabels(chart).map((item, i) => ({
                        ...item,
                        text: `${truncate(names[i] ?? '')}  ${values[i] ? format(values[i][1], total) : ''}`,
                      })),
                  },
                },
                tooltip,
              },
            }}
          />
        ) : (
          <Bar
            data={data}
            plugins={plugins}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              indexAxis: type === 'horizontal-bar' ? 'y' : 'x',
              layout: { padding: type === 'horizontal-bar' ? { right: padRight } : { top: 20 } },
              plugins: { legend: { display: false }, tooltip },
              scales: type === 'horizontal-bar'
                ? {
                    x: { beginAtZero: true, grace: '10%', ticks: { callback: valueTick } },
                    y: { grid: { display: false }, ticks: { autoSkip: false, callback: (v) => truncate(names[Number(v)] ?? '') } },
                  }
                : {
                    x: { grid: { display: false }, ticks: { maxRotation: 45 } },
                    y: { beginAtZero: true, grace: '10%', ticks: { callback: valueTick } },
                  },
            }}
          />
        )}
      </Box>
    </SectionCard>
  )
}
