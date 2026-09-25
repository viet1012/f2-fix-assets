import { Box, CssBaseline, Stack, ThemeProvider, type PaletteMode } from '@mui/material'
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
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', overflowX: 'hidden' }}>
        {header}
        <Stack component="main" spacing={density.gap} sx={{ maxWidth: 1920, mx: 'auto', px: { xs: 1.5, md: 2.5 }, py: { xs: 1.5, md: 2 } }}>
          {children}
        </Stack>
      </Box>
    </ThemeProvider>
  )
}
