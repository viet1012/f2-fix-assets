import { Alert, Box, Button, Stack, TextField } from '@mui/material'
import { useState, type FormEvent } from 'react'
import type { Lang } from '../../types/fixedAsset'
import { glassFilterControls } from '../../theme/liquidGlass'
import { todayIso, validateRelocationForm, type RelocationFormErrorCode, type RelocationFormValues } from '../../utils/relocationForm'

interface Props {
  lang: Lang
  value: RelocationFormValues
  onChange: (value: RelocationFormValues) => void
  /** Machines that actually move; the submit button is disabled when 0. */
  moverCount: number
  submitting?: boolean
  error?: string | null
  onSubmit: (value: RelocationFormValues) => void
}

const MESSAGES: Record<RelocationFormErrorCode, { vi: string; en: string }> = {
  required: { vi: 'Bắt buộc', en: 'Required' },
  past: { vi: 'Không được chọn ngày trong quá khứ', en: 'Date cannot be in the past' },
  beforeStart: { vi: 'Phải từ ngày dự kiến trở đi', en: 'Must be on or after the planned date' },
}

export function RelocationForm({ lang, value, onChange, moverCount, submitting = false, error, onSubmit }: Props) {
  const vi = lang === 'vi'
  const [touched, setTouched] = useState(false)
  const today = todayIso()
  const errors = validateRelocationForm(value, today)
  const shown = touched ? errors : {}
  const msg = (k: keyof RelocationFormValues) => (shown[k] ? (vi ? MESSAGES[shown[k]].vi : MESSAGES[shown[k]].en) : undefined)
  const set = (k: keyof RelocationFormValues) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (Object.keys(errors).length || moverCount === 0) return
    onSubmit(value)
    setTouched(false)
  }

  return (
    <Box component="form" noValidate onSubmit={submit} aria-label={vi ? 'Thông tin yêu cầu' : 'Request details'}>
      <Stack spacing={1.5} sx={(theme) => ({ ...glassFilterControls(theme), '& .MuiInputBase-multiline.MuiOutlinedInput-root': { height: 'auto' } })}>
        {/* Row 1: employee · planned · completion (one per line on narrow screens). */}
        <Box sx={{ display: 'grid', gap: 1.5, alignItems: 'start', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(3, minmax(0, 1fr))' } }}>
          <TextField size="small" required fullWidth label={vi ? 'Mã nhân viên' : 'Employee ID'} value={value.requestedBy} onChange={set('requestedBy')} error={!!shown.requestedBy} helperText={msg('requestedBy')} />
          <TextField
            size="small"
            required
            fullWidth
            type="date"
            label={vi ? 'Ngày dự kiến' : 'Planned date'}
            value={value.plannedMoveDate}
            onChange={set('plannedMoveDate')}
            error={!!shown.plannedMoveDate}
            helperText={msg('plannedMoveDate')}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: today } }}
          />
          <TextField
            size="small"
            required
            fullWidth
            type="date"
            label={vi ? 'Ngày hoàn thành' : 'Completion date'}
            value={value.plannedDoneDate}
            onChange={set('plannedDoneDate')}
            error={!!shown.plannedDoneDate}
            helperText={msg('plannedDoneDate')}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: value.plannedMoveDate || today } }}
          />
        </Box>
        {/* Row 2: reason (grows) + submit on the right; stacked with a full-width button on narrow screens. */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { xs: 'stretch', sm: 'flex-start' } }}>
          <TextField
            size="small"
            required
            multiline
            minRows={1}
            maxRows={3}
            sx={{ flex: 1 }}
            label={vi ? 'Lý do' : 'Reason'}
            value={value.reason}
            onChange={set('reason')}
            error={!!shown.reason}
            helperText={msg('reason')}
          />
          <Button type="submit" variant="contained" disabled={moverCount === 0 || submitting} sx={{ minHeight: 40, flexShrink: 0, whiteSpace: 'nowrap', width: { xs: '100%', sm: 'auto' } }}>
            {vi ? `Gửi yêu cầu (${moverCount} máy)` : `Submit request (${moverCount} machines)`}
          </Button>
        </Stack>
        {moverCount === 0 && <Alert severity="info" sx={{ py: 0 }}>{vi ? 'Không có máy nào cần di chuyển.' : 'No machine needs to move.'}</Alert>}
        {error && <Alert severity="error" sx={{ py: 0 }}>{error}</Alert>}
      </Stack>
    </Box>
  )
}
