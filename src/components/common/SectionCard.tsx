import { Box, Card, Stack, Typography, type SxProps, type Theme } from '@mui/material'
import type { ReactNode } from 'react'
import { density } from '../../theme/density'

interface Props {
  title?: ReactNode
  description?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  children: ReactNode
  /** Remove body padding (for tables / full-bleed content). */
  flush?: boolean
  sx?: SxProps<Theme>
  bodySx?: SxProps<Theme>
}

/** Standard card with an optional compact header. */
export function SectionCard({ title, description, icon, actions, children, flush = false, sx, bodySx }: Props) {
  const hasHeader = Boolean(title || actions)
  return (
    <Card sx={[{ display: 'flex', flexDirection: 'column', minWidth: 0 }, ...(Array.isArray(sx) ? sx : [sx])]}>
      {hasHeader && (
        <Stack
          direction="row"
          spacing={1.5}
          sx={{ alignItems: 'center', px: density.pad, py: 0.875, borderBottom: 1, borderColor: 'divider', minHeight: 44, flexWrap: 'wrap', rowGap: 0.75 }}
        >
          {icon && <Box sx={{ display: 'flex', color: 'text.secondary', '& svg': { fontSize: 18 } }}>{icon}</Box>}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {title && <Typography variant="subtitle1" component="h3" noWrap>{title}</Typography>}
            {description && <Typography variant="caption" color="text.secondary" component="p" sx={{ lineHeight: 1.35 }}>{description}</Typography>}
          </Box>
          {actions && <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>{actions}</Stack>}
        </Stack>
      )}
      <Box sx={[{ flex: 1, minHeight: 0, p: flush ? 0 : density.pad }, ...(Array.isArray(bodySx) ? bodySx : [bodySx])]}>{children}</Box>
    </Card>
  )
}
