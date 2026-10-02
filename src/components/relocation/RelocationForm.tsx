import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material'
import { useState, type FormEvent, type Ref } from 'react'
import { displayName } from '../../api/authApi'
import type { Lang } from '../../types/fixedAsset'
import { glassFilterControls } from '../../theme/liquidGlass'
import { todayIso, validateRelocationForm, type RelocationFormErrorCode, type RelocationFormValues } from '../../utils/relocationForm'

interface Props {
  lang: Lang
  /** Logged-in account: shown read-only, the server takes it from the session. */
  account: string
  /** Requester's name (logged-in user); null = unknown. */
  requesterName?: string | null
  value: RelocationFormValues
  onChange: (value: RelocationFormValues) => void
  /** Machines that actually move; the submit button is disabled when 0. */
  moverCount: number
  submitting?: boolean
  error?: string | null
  onSubmit: (value: RelocationFormValues) => void
  /** "Planned date" input: focused once the destination zone is picked. */
  plannedDateRef?: Ref<HTMLInputElement>
}

const MESSAGES: Record<RelocationFormErrorCode, { vi: string; en: string }> = {
  required: { vi: 'Bắt buộc', en: 'Required' },
  past: { vi: 'Không được chọn ngày trong quá khứ', en: 'Date cannot be in the past' },
  beforeStart: { vi: 'Phải từ ngày dự kiến trở đi', en: 'Must be on or after the planned date' },
}

export function RelocationForm({ lang, account, requesterName = null, value, onChange, moverCount, submitting = false, error, onSubmit, plannedDateRef }: Props) {
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
        <Typography variant="body2" color="text.secondary" data-testid="reloc-requester">
          {vi ? 'Người yêu cầu: ' : 'Requested by: '}
          <Box component="strong" sx={{ color: 'text.primary' }}>{displayName(requesterName, lang)}</Box> ({account})
        </Typography>
        {/* Row 1: planned · completion (one per line on narrow screens). */}
        <Box sx={{ display: 'grid', gap: 1.5, alignItems: 'start', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' } }}>
          <TextField
            size="small"
            required
            fullWidth
            type="date"
            label={vi ? 'Ngày dự kiến' : 'Planned date'}
            value={value.plannedMoveDate}
            inputRef={plannedDateRef}
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
