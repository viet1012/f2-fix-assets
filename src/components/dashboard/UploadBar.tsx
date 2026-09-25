import {
  alpha, Alert, Box, Button, Card, CircularProgress, InputAdornment, LinearProgress, Stack, TextField, Typography,
} from '@mui/material'
import CloudUploadOutlined from '@mui/icons-material/CloudUploadOutlined'
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined'
import LinkRounded from '@mui/icons-material/LinkRounded'
import { useRef, useState, type DragEvent } from 'react'
import type { DataStatus } from '../../hooks/useFixedAssets'
import { density } from '../../theme/density'
import type { Lang, LastImport } from '../../types/fixedAsset'
import { glassButton, glassTinted } from '../../theme/liquidGlass'

const ACCEPT = '.xlsx,.xls,.xlsm'
const ACCEPTED_EXT = ACCEPT.split(',')

interface Props {
  lang: Lang
  status: DataStatus
  lastImport: LastImport | null
  rowCount: number
  busy: boolean
  onUpload: (file: File) => Promise<void>
  onLoadUrl: (url: string) => Promise<void>
}

function StatusMessage({ status, lastImport, rowCount, vi }: { status: DataStatus; lastImport: LastImport | null; rowCount: number; vi: boolean }) {
  switch (status.type) {
    case 'loading':
      return <Alert severity="info" icon={<CircularProgress size={16} />}>{vi ? 'Đang tải dữ liệu từ server...' : 'Loading data from server...'}</Alert>
    case 'processing':
      return (
        <Alert severity="info" icon={<CircularProgress size={16} />} sx={{ '& .MuiAlert-message': { minWidth: 0 } }}>
          <Typography variant="body2" noWrap>
            {status.operation === 'upload' ? (vi ? 'Đang xử lý' : 'Processing') : (vi ? 'Đang tải' : 'Loading')} <strong>{status.target}</strong>...
          </Typography>
        </Alert>
      )
    case 'error': {
      const title = status.operation === 'load'
        ? (vi ? 'Không tải được dữ liệu từ server' : 'Could not load data from the server')
        : status.operation === 'upload'
          ? (vi ? 'Import file Excel thất bại' : 'Excel file import failed')
          : (vi ? 'Import từ URL thất bại' : 'URL import failed')
      return <Alert severity="error"><strong>{title}.</strong> {status.message}</Alert>
    }
    case 'ready':
      return lastImport ? (
        <Alert severity="success" sx={{ '& .MuiAlert-message': { minWidth: 0 } }}>
          <Typography variant="body2" noWrap title={lastImport.source_name}>
            <strong>{lastImport.source_name}</strong> — {rowCount.toLocaleString()} {vi ? 'dòng' : 'rows'} · {lastImport.sheet_name}
          </Typography>
        </Alert>
      ) : (
        <Alert severity="info" variant="outlined">{vi ? 'Chưa có dữ liệu import.' : 'No imported data yet.'}</Alert>
      )
  }
}

export function UploadBar({ lang, status, lastImport, rowCount, busy, onUpload, onLoadUrl }: Props) {
  const vi = lang === 'vi'
  const inputRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState('')
  const [fileName, setFileName] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [dropError, setDropError] = useState('')
  const disabled = busy || status.type === 'loading'

  const submitFile = async (file: File) => {
    setDropError('')
    setFileName(file.name)
    await onUpload(file)
  }

  const submitUrl = () => {
    const value = url.trim()
    if (!value || disabled) return
    void onLoadUrl(value)
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    if (disabled) return
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    const lower = file.name.toLowerCase()
    if (!ACCEPTED_EXT.some((ext) => lower.endsWith(ext))) {
      setDropError(vi ? `"${file.name}" không phải file Excel (${ACCEPT}).` : `"${file.name}" is not an Excel file (${ACCEPT}).`)
      return
    }
    void submitFile(file)
  }

  return (
    <Card>
      {busy && <LinearProgress aria-label={vi ? 'Đang import' : 'Importing'} sx={{ borderRadius: 0, height: 2 }} />}
      {/* lg+: Excel | URL | status in one band; md: two columns with status below; xs: stacked. */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))', lg: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 0.9fr)' },
          '& > section': { minWidth: 0, px: density.pad, py: 1, borderColor: 'divider' },
        }}
      >
        {/* Excel upload */}
        <Box component="section">
          <Typography variant="overline" color="text.secondary" component="h2" sx={sectionLabelSx}>{vi ? 'Import file Excel' : 'Import Excel file'}</Typography>
          <Box
            onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            sx={(theme) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              flexWrap: 'wrap',
              px: 0.75,
              py: 0.5,
              border: '1px dashed',
              borderColor: dragOver ? 'primary.main' : 'divider',
              borderRadius: 1.5,
              bgcolor: dragOver ? alpha(theme.palette.primary.main, 0.06) : 'transparent',
              transition: 'border-color .15s, background-color .15s',
            })}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              hidden
              onChange={async (e) => {
                const input = e.currentTarget
                const file = input.files?.[0]
                if (file) await submitFile(file)
                input.value = ''
              }}
            />
            <Button
              size="small"
              startIcon={busy && status.type === 'processing' && status.operation === 'upload' ? <CircularProgress size={14} color="inherit" /> : <CloudUploadOutlined />}
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
              sx={(theme) => ({ ...glassTinted(theme), flexShrink: 0 })}
            >
              {vi ? 'Chọn file Excel' : 'Choose Excel file'}
            </Button>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              {fileName ? (
                <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
                  <DescriptionOutlined fontSize="small" color="action" />
                  <Typography variant="body2" noWrap title={fileName}>{fileName}</Typography>
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary" noWrap>
                  {vi ? 'hoặc kéo thả file vào đây' : 'or drag & drop a file here'}
                  <Box component="span" sx={{ color: 'text.disabled', typography: 'caption' }}> · .xlsx, .xls, .xlsm</Box>
                </Typography>
              )}
            </Box>
          </Box>
        </Box>

        {/* URL import */}
        <Box component="section" sx={{ borderTop: { xs: 1, md: 0 }, borderLeft: { md: 1 } }}>
          <Typography variant="overline" color="text.secondary" component="h2" sx={sectionLabelSx}>{vi ? 'Import từ URL' : 'Import from URL'}</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField
              fullWidth
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitUrl() }}
              disabled={disabled}
              label={vi ? 'Link Excel / SharePoint' : 'Excel / SharePoint URL'}
              placeholder={vi ? 'Dán link Excel / SharePoint...' : 'Paste Excel / SharePoint URL...'}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><LinkRounded fontSize="small" /></InputAdornment> } }}
            />
            <Button
              color="inherit"
              disabled={disabled || !url.trim()}
              onClick={submitUrl}
              startIcon={busy && status.type === 'processing' && status.operation === 'url' ? <CircularProgress size={14} color="inherit" /> : undefined}
              sx={(theme) => ({ ...glassButton(theme), flexShrink: 0, whiteSpace: 'nowrap' })}
            >
              {vi ? 'Tải dữ liệu' : 'Load'}
            </Button>
          </Stack>
        </Box>

        {/* Data / import status */}
        <Box
          component="section"
          aria-label={vi ? 'Trạng thái dữ liệu' : 'Data status'}
          sx={{ gridColumn: { md: '1 / -1', lg: 'auto' }, borderTop: { xs: 1, lg: 0 }, borderLeft: { lg: 1 }, display: 'grid', gap: 0.75, alignContent: 'start' }}
        >
          <Typography variant="overline" color="text.secondary" component="h2" sx={{ ...sectionLabelSx, mb: 0 }}>{vi ? 'Trạng thái dữ liệu' : 'Data status'}</Typography>
          <Box sx={{ display: 'grid', gap: 0.75, minWidth: 0, '& .MuiAlert-root': { py: 0.25 } }}>
            {dropError && <Alert severity="warning" onClose={() => setDropError('')}>{dropError}</Alert>}
            <StatusMessage status={status} lastImport={lastImport} rowCount={rowCount} vi={vi} />
          </Box>
        </Box>
      </Box>
    </Card>
  )
}

const sectionLabelSx = { display: 'block', lineHeight: 1.4, mb: 0.5 } as const
