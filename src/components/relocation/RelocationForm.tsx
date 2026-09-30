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
        <TextField size="small" required label={vi ? 'Mã nhân viên' : 'Employee ID'} value={value.requestedBy} onChange={set('requestedBy')} error={!!shown.requestedBy} helperText={msg('requestedBy')} />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <TextField
            size="small"
            required
            fullWidth
            type="date"
            label={vi ? 'Ngày dự kiến' : 'Planned date'}
            value={value.dStart}
            onChange={set('dStart')}
            error={!!shown.dStart}
            helperText={msg('dStart')}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: today } }}
          />
          <TextField
            size="small"
            required
            fullWidth
            type="date"
            label={vi ? 'Ngày hoàn thành' : 'Completion date'}
            value={value.dEnd}
            onChange={set('dEnd')}
            error={!!shown.dEnd}
            helperText={msg('dEnd')}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: value.dStart || today } }}
          />
        </Stack>
        <TextField size="small" required multiline minRows={2} label={vi ? 'Lý do' : 'Reason'} value={value.reason} onChange={set('reason')} error={!!shown.reason} helperText={msg('reason')} />
        {moverCount === 0 && <Alert severity="info" sx={{ py: 0 }}>{vi ? 'Không có máy nào cần di chuyển.' : 'No machine needs to move.'}</Alert>}
        {error && <Alert severity="error" sx={{ py: 0 }}>{error}</Alert>}
        <Box>
          <Button type="submit" variant="contained" disabled={moverCount === 0 || submitting}>
            {vi ? `Gửi yêu cầu (${moverCount} máy)` : `Submit request (${moverCount} machines)`}
          </Button>
        </Box>
      </Stack>
    </Box>
  )
}
