import { alpha, Box, Card, Skeleton, Stack, Typography } from '@mui/material'
import type { ReactNode } from 'react'

export type StatTone = 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral'

interface Props {
  label: ReactNode
  value: ReactNode
  secondary?: ReactNode
  icon?: ReactNode
  tone?: StatTone
  loading?: boolean
}

/** KPI tile: icon, small label, large value, optional secondary line. Tone is reserved for meaning. */
export function StatCard({ label, value, secondary, icon, tone = 'neutral', loading = false }: Props) {
  return (
    <Card sx={{ px: 1.5, py: 1.25, height: '100%', minWidth: 0 }}>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
        {icon && (
          <Box
            aria-hidden
            sx={(theme) => {
              const color = tone === 'neutral' ? theme.palette.text.secondary : theme.palette[tone].main
              return {
                width: 34,
                height: 34,
                flexShrink: 0,
                borderRadius: 1.5,
                display: 'grid',
                placeItems: 'center',
                color,
                bgcolor: alpha(color, theme.palette.mode === 'dark' ? 0.16 : 0.1),
                '& svg': { fontSize: 20 },
              }
            }}
          >
            {icon}
          </Box>
        )}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="overline" color="text.secondary" component="div" noWrap sx={{ lineHeight: 1.5 }}>{label}</Typography>
          <Typography component="div" sx={{ fontSize: '1.3125rem', fontWeight: 700, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }} noWrap>
            {loading ? <Skeleton width="60%" /> : value}
          </Typography>
          {secondary && (
            <Typography variant="caption" color="text.secondary" component="div" noWrap sx={{ lineHeight: 1.4 }}>
              {loading ? <Skeleton width="40%" /> : secondary}
            </Typography>
          )}
        </Box>
      </Stack>
    </Card>
  )
}
