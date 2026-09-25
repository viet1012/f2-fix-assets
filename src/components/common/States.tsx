import { Alert, AlertTitle, Box, Button, CircularProgress, Stack, Typography } from '@mui/material'
import InboxOutlined from '@mui/icons-material/InboxOutlined'
import type { ReactNode } from 'react'

interface EmptyProps {
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  action?: ReactNode
  compact?: boolean
}

export function EmptyState({ title, description, icon, action, compact = false }: EmptyProps) {
  return (
    <Stack spacing={1} sx={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', py: compact ? 3 : 6, px: 2, height: '100%', color: 'text.secondary' }}>
      <Box aria-hidden sx={{ color: 'text.disabled', '& svg': { fontSize: compact ? 28 : 40 } }}>{icon ?? <InboxOutlined />}</Box>
      <Typography variant="subtitle2" color="text.primary">{title}</Typography>
      {description && <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>{description}</Typography>}
      {action}
    </Stack>
  )
}

export function LoadingState({ label, compact = false }: { label: ReactNode; compact?: boolean }) {
  return (
    <Stack role="status" aria-live="polite" spacing={1.5} sx={{ alignItems: 'center', justifyContent: 'center', py: compact ? 3 : 6, color: 'text.secondary' }}>
      <CircularProgress size={compact ? 20 : 28} />
      <Typography variant="body2">{label}</Typography>
    </Stack>
  )
}

interface ErrorProps {
  title: ReactNode
  message?: ReactNode
  onRetry?: () => void
  retryLabel?: ReactNode
}

export function ErrorState({ title, message, onRetry, retryLabel = 'Retry' }: ErrorProps) {
  return (
    <Alert
      severity="error"
      variant="outlined"
      action={onRetry && <Button color="inherit" size="small" onClick={onRetry}>{retryLabel}</Button>}
    >
      <AlertTitle sx={{ mb: message ? 0.25 : 0 }}>{title}</AlertTitle>
      {message}
    </Alert>
  )
}
