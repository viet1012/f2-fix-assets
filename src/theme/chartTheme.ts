import { alpha, useTheme, type Theme } from '@mui/material'
import { Chart } from 'chart.js'
import { useEffect } from 'react'
import { categoricalPalette } from './palette'

let appliedKey = ''

/** Global Chart.js defaults derived from the MUI theme. Idempotent: re-applies only when the theme key changes. */
export function applyChartDefaults(theme: Theme): string {
  const key = `${theme.palette.mode}|${theme.typography.fontFamily}|${typeof window === 'undefined' ? 1 : window.devicePixelRatio}`
  if (key === appliedKey) return key
  appliedKey = key
  const d = Chart.defaults
  d.font.family = theme.typography.fontFamily as string
  d.font.size = 12
  d.font.weight = 500
  d.color = theme.palette.text.primary
  d.devicePixelRatio = Math.max(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1, 2)

  const tick = alpha(theme.palette.text.secondary, 0.85)
  const grid = alpha(theme.palette.divider, 0.5)
  d.scale.ticks.color = tick
  d.scale.ticks.font = { size: 12 }
  d.scale.grid.color = grid
  ;(d.scale as unknown as { border: { display: boolean } }).border.display = false // cartesian axis line

  d.plugins.legend.labels.color = theme.palette.text.primary
  d.plugins.legend.labels.font = { size: 13 }
  d.plugins.title.color = theme.palette.text.primary
  d.plugins.title.font = { size: 13, weight: 600 }
  return key
}

/** Applies the defaults for the current theme (synchronously, before charts mount) and refreshes live charts on theme change. */
export function useChartDefaults() {
  const theme = useTheme()
  const key = applyChartDefaults(theme)
  useEffect(() => {
    Object.values(Chart.instances).forEach((c) => c.update())
  }, [key])
}

/** Stable colour per category name (same name → same colour in every chart). */
export function colorForName(name: string, mode: 'light' | 'dark'): string {
  const pal = categoricalPalette[mode]
  let h = 5381
  for (let i = 0; i < name.length; i++) h = ((h << 5) + h + name.charCodeAt(i)) | 0
  return pal[Math.abs(h) % pal.length]
}
