import type { PaletteMode } from '@mui/material'

/**
 * Raw color tokens. Components should read colors from the MUI theme;
 * these tokens exist so the theme and Chart.js share one source of truth.
 */
export const tokens = {
  light: {
    background: '#f3f5f8',
    paper: '#ffffff',
    paperSubtle: '#f8fafc',
    border: '#e2e8f0',
    divider: '#e2e8f0',
    textPrimary: '#0f172a',
    textSecondary: '#475569',
    textMuted: '#64748b',
    primary: '#2563eb',
    primaryDark: '#1d4ed8',
    primaryLight: '#dbeafe',
    secondary: '#475569',
    success: '#15803d',
    warning: '#b45309',
    error: '#dc2626',
    info: '#0369a1',
    gridLine: 'rgba(15, 23, 42, 0.08)',
    shadow: '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)',
  },
  dark: {
    background: '#0b1220',
    paper: '#111a2e',
    paperSubtle: '#16213a',
    border: '#1f2b45',
    divider: '#1f2b45',
    textPrimary: '#e2e8f0',
    textSecondary: '#a3b1c6',
    textMuted: '#7c8ba3',
    primary: '#60a5fa',
    primaryDark: '#3b82f6',
    primaryLight: 'rgba(96, 165, 250, 0.16)',
    secondary: '#94a3b8',
    success: '#4ade80',
    warning: '#fbbf24',
    error: '#f87171',
    info: '#38bdf8',
    gridLine: 'rgba(148, 163, 184, 0.12)',
    shadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
  },
} as const satisfies Record<PaletteMode, Record<string, string>>

/**
 * Categorical palette for multi-category charts (doughnuts).
 * Ordered so adjacent slices stay distinguishable in both modes.
 */
export const categoricalPalette: Record<PaletteMode, string[]> = {
  light: ['#2563eb', '#0d9488', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#65a30d', '#ea580c', '#4f46e5', '#64748b', '#be123c', '#0f766e'],
  dark: ['#60a5fa', '#2dd4bf', '#fbbf24', '#a78bfa', '#f472b6', '#22d3ee', '#a3e635', '#fb923c', '#818cf8', '#94a3b8', '#fb7185', '#5eead4'],
}
