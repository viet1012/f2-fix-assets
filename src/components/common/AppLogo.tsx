import { alpha, Box } from '@mui/material'

/**
 * App logo tile: rounded, subtle shadow. /favicon.png has a transparent background (alpha channel), so the tile takes
 * the surface of the mode: white in light, background.paper in dark, with a mode-dependent hairline border.
 */
export function AppLogo({ size }: { size: number }) {
  return (
    <Box
      aria-hidden
      data-testid="app-logo"
      sx={(theme) => ({
        width: size,
        height: size,
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
        bgcolor: theme.palette.mode === 'dark' ? theme.palette.background.paper : '#ffffff',
        borderRadius: `${Math.round(size * 0.24)}px`,
        border: `1px solid ${theme.palette.mode === 'dark' ? alpha(theme.palette.common.white, 0.12) : alpha(theme.palette.common.black, 0.06)}`,
        boxShadow: `0 1px 2px ${alpha('#0f172a', 0.08)}, 0 6px 16px -8px ${alpha('#0f172a', theme.palette.mode === 'dark' ? 0.6 : 0.25)}`,
        overflow: 'hidden',
      })}
    >
      <Box component="img" src="/favicon.png" alt="" sx={{ width: '78%', height: '78%', objectFit: 'contain', display: 'block' }} />
    </Box>
  )
}
