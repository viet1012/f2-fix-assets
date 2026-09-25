import {
  AppBar, Box, CircularProgress, IconButton, Stack, ToggleButton, ToggleButtonGroup, Toolbar, Tooltip, Typography,
} from '@mui/material'
import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined'
import FactoryOutlined from '@mui/icons-material/FactoryOutlined'
import LightModeOutlined from '@mui/icons-material/LightModeOutlined'
import RefreshRounded from '@mui/icons-material/RefreshRounded'
import type { PaletteMode } from '@mui/material'
import type { DataStatus } from '../../hooks/useFixedAssets'
import type { Lang } from '../../types/fixedAsset'
import { glassFloating, glassIconButton, glassRadius, glassSegmented, glassTinted, HEADER_HEIGHT, px } from '../../theme/liquidGlass'

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
    // Transparent sticky shell (6px inset) holding a 44px floating glass bar aligned with the content column.
    <AppBar position="sticky" color="transparent" elevation={0} sx={{ px: { xs: 1.5, md: 2.5 }, py: px(6), bgcolor: 'transparent', boxShadow: 'none', backgroundImage: 'none' }}>
      <Toolbar
        disableGutters
        sx={(theme) => ({
          ...glassFloating(theme),
          gap: 1.25,
          minHeight: `${px(HEADER_HEIGHT - 12)} !important`,
          px: { xs: 1, md: 1.25 },
          maxWidth: 1920 - 40,
          width: '100%',
          mx: 'auto',
        })}
      >
        <Box
          aria-hidden
          sx={(theme) => ({ ...glassTinted(theme), minHeight: 0, width: 28, height: 28, paddingInline: 0, paddingBlock: 0, display: 'grid', placeItems: 'center', flexShrink: 0, '&:hover': {} })}
        >
          <FactoryOutlined sx={{ fontSize: 17 }} />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="h1" component="h1" noWrap sx={{ lineHeight: 1.25 }}>
            <Box component="span" sx={{ color: 'primary.main', mr: 0.75 }}>F2</Box>
            Fixed Asset Controlling Map
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div" noWrap sx={{ lineHeight: 1.3, fontSize: '0.6875rem' }}>
            {vi ? `Đang quản lý ${rowCount.toLocaleString()} tài sản` : `Managing ${rowCount.toLocaleString()} assets`}
            {updatedAt ? ` · ${vi ? 'Cập nhật' : 'Updated'}: ${new Date(updatedAt).toLocaleString()}` : ''}
          </Typography>
        </Box>

        <ConnectionIndicator status={status} vi={vi} />

        <Stack direction="row" spacing={0.75} role="group" aria-label={vi ? 'Điều khiển' : 'Controls'} sx={{ alignItems: 'center' }}>
        <Tooltip title={vi ? 'Tải lại dữ liệu' : 'Reload data'}>
          <span>
            <IconButton size="small" onClick={onRefresh} disabled={busy} aria-label={vi ? 'Tải lại dữ liệu' : 'Reload data'} sx={(theme) => glassIconButton(theme)}>
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
          sx={(theme) => glassSegmented(theme, lang === 'en' ? 1 : 0, 2)}
        >
          <ToggleButton value="vi" aria-label="Tiếng Việt">VI</ToggleButton>
          <ToggleButton value="en" aria-label="English">EN</ToggleButton>
        </ToggleButtonGroup>

        <Tooltip title={mode === 'dark' ? (vi ? 'Chế độ sáng' : 'Light mode') : (vi ? 'Chế độ tối' : 'Dark mode')}>
          <IconButton size="small" onClick={onToggleTheme} sx={(theme) => glassIconButton(theme)} aria-label={mode === 'dark' ? (vi ? 'Chuyển sang chế độ sáng' : 'Switch to light mode') : (vi ? 'Chuyển sang chế độ tối' : 'Switch to dark mode')}>
            {mode === 'dark' ? <LightModeOutlined fontSize="small" /> : <DarkModeOutlined fontSize="small" />}
          </IconButton>
        </Tooltip>
        </Stack>
      </Toolbar>
    </AppBar>
  )
}
