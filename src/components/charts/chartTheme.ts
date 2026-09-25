import {
  ArcElement, BarElement, CategoryScale, Chart as ChartJS, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip,
} from 'chart.js'
import { useTheme } from '@mui/material'
import { categoricalPalette, tokens } from '../../theme/palette'

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

/** Colors/fonts for Chart.js derived from the active MUI theme, so charts follow light/dark mode. */
export function useChartTheme() {
  const theme = useTheme()
  const mode = theme.palette.mode
  const t = tokens[mode]
  return {
    mode,
    primary: theme.palette.primary.main,
    warning: theme.palette.warning.main,
    text: t.textSecondary,
    grid: t.gridLine,
    border: theme.palette.background.paper,
    categorical: categoricalPalette[mode],
    font: { family: theme.typography.fontFamily as string, size: 11 },
    tooltip: {
      backgroundColor: mode === 'dark' ? '#1e293b' : '#0f172a',
      titleColor: '#f8fafc',
      bodyColor: '#e2e8f0',
      borderColor: mode === 'dark' ? t.border : 'transparent',
      borderWidth: 1,
      padding: 8,
      cornerRadius: 6,
    },
  }
}

export type ChartTheme = ReturnType<typeof useChartTheme>

/** Base axis config for cartesian charts. */
export function cartesianScales(ct: ChartTheme, opts: { horizontal?: boolean; formatValue?: (v: number) => string } = {}) {
  const valueAxis = {
    beginAtZero: true,
    grid: { color: ct.grid },
    border: { display: false },
    ticks: {
      color: ct.text,
      font: ct.font,
      callback: (v: string | number) => (opts.formatValue ? opts.formatValue(Number(v)) : Number(v).toLocaleString()),
    },
  }
  const categoryAxis = {
    grid: { display: false },
    border: { color: ct.grid },
    ticks: { color: ct.text, font: ct.font, autoSkip: true, maxRotation: 45 },
  }
  return opts.horizontal ? { x: valueAxis, y: categoryAxis } : { x: categoryAxis, y: valueAxis }
}
