import { alpha, createTheme, type PaletteMode, type Theme } from '@mui/material'
import { tokens } from './palette'

const fontFamily = '"Segoe UI", "Inter", Roboto, "Helvetica Neue", Arial, sans-serif'

export function createAppTheme(mode: PaletteMode): Theme {
  const t = tokens[mode]
  const focusRing = `0 0 0 3px ${alpha(t.primary, 0.35)}`

  return createTheme({
    palette: {
      mode,
      primary: { main: t.primary, dark: t.primaryDark, contrastText: mode === 'dark' ? '#0b1220' : '#ffffff' },
      secondary: { main: t.secondary },
      success: { main: t.success },
      warning: { main: t.warning },
      error: { main: t.error },
      info: { main: t.info },
      background: { default: t.background, paper: t.paper },
      text: { primary: t.textPrimary, secondary: t.textSecondary, disabled: alpha(t.textMuted, 0.7) },
      divider: t.divider,
      action: { hover: alpha(t.primary, mode === 'dark' ? 0.08 : 0.04), selected: alpha(t.primary, mode === 'dark' ? 0.16 : 0.08) },
    },
    shape: { borderRadius: 8 },
    spacing: 8,
    typography: {
      fontFamily,
      fontSize: 13,
      h1: { fontSize: '1.125rem', fontWeight: 700, letterSpacing: '-0.01em' },
      h2: { fontSize: '1rem', fontWeight: 700 },
      h3: { fontSize: '0.9375rem', fontWeight: 650 },
      h4: { fontSize: '0.875rem', fontWeight: 650 },
      subtitle1: { fontSize: '0.875rem', fontWeight: 600 },
      subtitle2: { fontSize: '0.8125rem', fontWeight: 600 },
      body1: { fontSize: '0.875rem' },
      body2: { fontSize: '0.8125rem' },
      caption: { fontSize: '0.75rem' },
      overline: { fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.06em', lineHeight: 1.6 },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { backgroundColor: t.background },
          '*:focus-visible': { outline: `2px solid ${t.primary}`, outlineOffset: 2 },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: { backgroundImage: 'none' },
          outlined: { borderColor: t.border },
        },
      },
      MuiCard: {
        defaultProps: { variant: 'outlined' },
        styleOverrides: { root: { borderColor: t.border, boxShadow: t.shadow } },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 6, paddingInline: 14, '&.Mui-focusVisible': { boxShadow: focusRing } },
          sizeSmall: { paddingInline: 10, fontSize: '0.8125rem' },
          outlined: { borderColor: t.border },
        },
      },
      MuiIconButton: {
        styleOverrides: { root: { borderRadius: 6, '&.Mui-focusVisible': { boxShadow: focusRing } } },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
            borderColor: t.border,
            '&.Mui-selected': { backgroundColor: alpha(t.primary, 0.12), color: t.primary },
            '&.Mui-selected:hover': { backgroundColor: alpha(t.primary, 0.18) },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: t.paper,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: t.border },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: alpha(t.textMuted, 0.6) },
          },
        },
      },
      MuiTextField: { defaultProps: { size: 'small' } },
      MuiAutocomplete: { defaultProps: { size: 'small' } },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 6, fontWeight: 600 },
          sizeSmall: { height: 22, fontSize: '0.75rem' },
        },
      },
      MuiTabs: {
        styleOverrides: {
          root: { minHeight: 40 },
          indicator: { height: 2.5, borderRadius: 2 },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            minHeight: 40,
            paddingInline: 14,
            fontWeight: 600,
            color: t.textSecondary,
            '&.Mui-selected': { color: t.primary },
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: { borderColor: t.border, paddingBlock: 6, paddingInline: 12 },
          head: {
            backgroundColor: t.paperSubtle,
            color: t.textSecondary,
            fontWeight: 650,
            fontSize: '0.75rem',
            whiteSpace: 'nowrap',
          },
          stickyHeader: { backgroundColor: t.paperSubtle },
        },
      },
      MuiTableRow: {
        styleOverrides: { root: { '&.MuiTableRow-hover:hover': { backgroundColor: alpha(t.primary, mode === 'dark' ? 0.06 : 0.03) } } },
      },
      MuiTooltip: {
        defaultProps: { arrow: true },
        styleOverrides: { tooltip: { fontSize: '0.75rem' } },
      },
      MuiAlert: {
        styleOverrides: { root: { borderRadius: 8, alignItems: 'center' } },
      },
      MuiLinearProgress: {
        styleOverrides: { root: { borderRadius: 4 } },
      },
    },
  })
}
