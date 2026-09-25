import {
  AppBar, Box, CircularProgress, Divider, IconButton, Stack, ToggleButton, ToggleButtonGroup, Toolbar, Tooltip, Typography,
} from '@mui/material'
import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined'
import FactoryOutlined from '@mui/icons-material/FactoryOutlined'
import LightModeOutlined from '@mui/icons-material/LightModeOutlined'
import RefreshRounded from '@mui/icons-material/RefreshRounded'
import type { PaletteMode } from '@mui/material'
import type { DataStatus } from '../../hooks/useFixedAssets'
import type { Lang } from '../../types/fixedAsset'

interface Props {
  lang: Lang
  mode: PaletteMode
  rowCount: number
  updatedAt?: string
  status: DataStatus
  onRefresh: () => void
  onChangeLang: (lang: Lang) => void
  onToggleTheme: () => void
}

function ConnectionIndicator({ status, vi }: { status: DataStatus; vi: boolean }) {
  const isError = status.type === 'error' && status.operation === 'load'
  const isLoading = status.type === 'loading' || status.type === 'processing'
  const label = isError
    ? (vi ? 'Lỗi kết nối API' : 'API unavailable')
    : isLoading ? (vi ? 'Đang đồng bộ' : 'Syncing') : (vi ? 'API đã kết nối' : 'API connected')
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', display: { xs: 'none', md: 'flex' } }} role="status" aria-live="polite">
      <Box
        aria-hidden
        sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: isError ? 'error.main' : isLoading ? 'warning.main' : 'success.main' }}
      />
      <Typography variant="caption" color="text.secondary" noWrap>{label}</Typography>
    </Stack>
  )
}

export function Header({ lang, mode, rowCount, updatedAt, status, onRefresh, onChangeLang, onToggleTheme }: Props) {
  const vi = lang === 'vi'
  const loading = status.type === 'loading'
  const busy = loading || status.type === 'processing'
  return (
    <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
      <Toolbar variant="dense" sx={{ gap: 1.25, minHeight: 48, px: { xs: 1.5, md: 2.5 } }}>
        <Box
          aria-hidden
          sx={{ width: 30, height: 30, borderRadius: 1.5, display: 'grid', placeItems: 'center', bgcolor: 'primary.main', color: 'primary.contrastText', flexShrink: 0 }}
        >
          <FactoryOutlined sx={{ fontSize: 18 }} />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="h1" component="h1" noWrap sx={{ lineHeight: 1.3 }}>
            <Box component="span" sx={{ color: 'primary.main', mr: 0.75 }}>F2</Box>
            Fixed Asset Controlling Map
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div" noWrap sx={{ lineHeight: 1.35 }}>
            {vi ? `Đang quản lý ${rowCount.toLocaleString()} tài sản` : `Managing ${rowCount.toLocaleString()} assets`}
            {updatedAt ? ` · ${vi ? 'Cập nhật' : 'Updated'}: ${new Date(updatedAt).toLocaleString()}` : ''}
          </Typography>
        </Box>

        <ConnectionIndicator status={status} vi={vi} />
        <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', md: 'block' }, my: 1.25 }} />

        <Tooltip title={vi ? 'Tải lại dữ liệu' : 'Reload data'}>
          <span>
            <IconButton size="small" onClick={onRefresh} disabled={busy} aria-label={vi ? 'Tải lại dữ liệu' : 'Reload data'}>
              {loading ? <CircularProgress size={18} /> : <RefreshRounded fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>

        <ToggleButtonGroup
          size="small"
          exclusive
          value={lang}
          onChange={(_, next: Lang | null) => next && onChangeLang(next)}
          aria-label={vi ? 'Ngôn ngữ' : 'Language'}
          sx={{ '& .MuiToggleButton-root': { px: 1.25, py: 0.4, fontSize: '0.75rem' } }}
        >
          <ToggleButton value="vi" aria-label="Tiếng Việt">VI</ToggleButton>
          <ToggleButton value="en" aria-label="English">EN</ToggleButton>
        </ToggleButtonGroup>

        <Tooltip title={mode === 'dark' ? (vi ? 'Chế độ sáng' : 'Light mode') : (vi ? 'Chế độ tối' : 'Dark mode')}>
          <IconButton size="small" onClick={onToggleTheme} aria-label={mode === 'dark' ? (vi ? 'Chuyển sang chế độ sáng' : 'Switch to light mode') : (vi ? 'Chuyển sang chế độ tối' : 'Switch to dark mode')}>
            {mode === 'dark' ? <LightModeOutlined fontSize="small" /> : <DarkModeOutlined fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Toolbar>
    </AppBar>
  )
}
