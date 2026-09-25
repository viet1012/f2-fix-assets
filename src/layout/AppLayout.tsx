import { alpha, Box, CssBaseline, Stack, ThemeProvider, type PaletteMode } from '@mui/material'
import { useMemo, type ReactNode } from 'react'
import { createAppTheme } from '../theme/appTheme'
import { density } from '../theme/density'

interface Props {
  mode: PaletteMode
  header: ReactNode
  children: ReactNode
}

/** Theme + page shell: sticky header, then a max-width content column. */
export function AppLayout({ mode, header, children }: Props) {
  const theme = useMemo(() => createAppTheme(mode), [mode])
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {/* overflowX 'clip' (not 'hidden'): hidden turns this box into a scroll container and silently disables position: sticky. */}
      <Box
        sx={(t) => ({
          minHeight: '100vh',
          bgcolor: 'background.default',
          // Very soft tint behind the top of the page so the floating glass has something to pick up (not fixed: no scroll repaint).
          backgroundImage: `radial-gradient(1200px 420px at 15% -80px, ${alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.14 : 0.08)}, transparent 70%)`,
          backgroundRepeat: 'no-repeat',
          overflowX: 'clip',
        })}
      >
        {header}
        <Stack component="main" spacing={density.gap} sx={{ maxWidth: 1920, mx: 'auto', px: { xs: 1.5, md: 2.5 }, py: { xs: 1.25, md: 1.5 } }}>
          {children}
        </Stack>
      </Box>
    </ThemeProvider>
  )
}
