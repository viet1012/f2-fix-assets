import {
  alpha, AppBar, Avatar, Box, ButtonBase, CircularProgress, Divider, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Stack, ToggleButton, ToggleButtonGroup, Toolbar, Tooltip, Typography,
} from '@mui/material'
import CloudOffRounded from '@mui/icons-material/CloudOffRounded'
import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined'
import KeyboardArrowDownRounded from '@mui/icons-material/KeyboardArrowDownRounded'
import LightModeOutlined from '@mui/icons-material/LightModeOutlined'
import LogoutRounded from '@mui/icons-material/LogoutRounded'
import { useEffect, useId, useState } from 'react'
import RefreshRounded from '@mui/icons-material/RefreshRounded'
import type { PaletteMode } from '@mui/material'
import { displayName, type CurrentUser } from '../../api/authApi'
import { useCurrentUser } from '../../auth/authContext'
import type { ThemeToggleEvent } from '../../hooks/useThemeMode'
import type { DataStatus } from '../../hooks/useFixedAssets'
import type { Lang } from '../../types/fixedAsset'
import { glassFloating, glassIconButton, glassSegmented, HEADER_HEIGHT, px } from '../../theme/liquidGlass'
import { AppLogo } from '../common/AppLogo'
import { density } from '../../theme/density'

interface Props {
  lang: Lang
  mode: PaletteMode
  rowCount: number
  updatedAt?: string
  status: DataStatus
  onRefresh: () => void
  onChangeLang: (lang: Lang) => void
  /** Receives the click so the theme change can reveal from the button (see useThemeMode). */
  onToggleTheme: (event?: ThemeToggleEvent) => void
  /** Logged-in account (session) and sign-out. */
  account?: string
  onLogout?: () => Promise<void> | void
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
const REDUCED = '@media (prefers-reduced-motion: reduce)'

/** Sun / moon of the theme button: the outgoing icon turns 90deg and fades (200ms); static under reduced motion. */
export function ThemeModeIcon({ mode }: { mode: PaletteMode }) {
  const layer = (shown: boolean) => ({
    position: 'absolute' as const,
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    opacity: shown ? 1 : 0,
    transform: shown ? 'rotate(0deg)' : 'rotate(90deg)',
    transition: 'opacity 200ms ease, transform 200ms ease',
    [REDUCED]: { transition: 'none' },
  })
  return (
    <Box component="span" aria-hidden sx={{ position: 'relative', display: 'inline-block', width: 20, height: 20 }}>
      <Box component="span" data-icon="light" sx={layer(mode === 'dark')}><LightModeOutlined fontSize="small" /></Box>
      <Box component="span" data-icon="dark" sx={layer(mode !== 'dark')}><DarkModeOutlined fontSize="small" /></Box>
    </Box>
  )
}

/** Avatar letters: first letter of the first + last word of the name ("Nguyễn Trọng Ngữ" -> "NN"); else the account's first 2 characters. */
export function initialsOf(name: string | null | undefined, account: string): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return account.slice(0, 2).toUpperCase()
  const first = Array.from(words[0])[0]
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] : ''
  return (first + last).toLocaleUpperCase()
}

/** Account chip + menu (account, sign-in time, sign out). MUI Menu closes on Esc and returns focus to the chip. */
function AccountMenu({ account, user, vi, onLogout }: { account: string; user: CurrentUser | null; vi: boolean; onLogout?: () => Promise<void> | void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [signingOut, setSigningOut] = useState(false)
  // Sign-in time = when this account first appears in the header (the header mounts after login).
  const [signedInAt, setSignedInAt] = useState<Date | null>(null)
  useEffect(() => setSignedInAt(new Date()), [account])
  const menuId = useId()
  const name = displayName(user?.name, vi ? 'vi' : 'en')
  const org = [account, [user?.dept, user?.section].filter((s): s is string => !!s?.trim()).join(' / ')].filter(Boolean).join(' · ')
  const open = anchor !== null
  const signOut = async () => {
    if (!onLogout) return
    setSigningOut(true)
    try {
      await onLogout()
    } finally {
      setSigningOut(false)
      setAnchor(null)
    }
  }
  return (
    <>
      <ButtonBase
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`${vi ? 'Menu tài khoản' : 'Account menu'}: ${name} (${account})`}
        sx={(theme) => ({
          gap: 0.75,
          height: 34,
          pl: 0.5,
          pr: { xs: 0.5, sm: 0.75 },
          ml: 0.25,
          borderRadius: '17px',
          transition: 'background-color 160ms ease',
          bgcolor: open ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
          '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.08) },
          '&.Mui-focusVisible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 1 },
        })}
      >
        <Avatar
          aria-hidden
          data-testid="header-avatar"
          sx={(theme) => ({ width: 26, height: 26, fontSize: 11, fontWeight: 700, bgcolor: alpha(theme.palette.primary.main, 0.14), color: 'primary.main' })}
        >
          {initialsOf(user?.name, account)}
        </Avatar>
        <Tooltip title={`${name} (${account})`}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600, maxWidth: 180, display: { xs: 'none', sm: 'block' } }} data-testid="header-account">
            {name}
          </Typography>
        </Tooltip>
        <KeyboardArrowDownRounded
          fontSize="small"
          aria-hidden
          sx={{ display: { xs: 'none', sm: 'block' }, color: 'text.secondary', transition: 'transform 160ms ease', transform: open ? 'rotate(180deg)' : 'none' }}
        />
      </ButtonBase>
      <Menu
        id={menuId}
        anchorEl={anchor}
        open={open}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { mt: 0.75, minWidth: 220, borderRadius: '10px' } } }}
      >
        <Box sx={{ px: 2, pt: 1, pb: 1.25 }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 700 }}>{name}</Typography>
          <Typography variant="caption" color="text.secondary" component="div" noWrap data-testid="header-account-org">{org}</Typography>
          {signedInAt && (
            <Typography variant="caption" color="text.secondary" component="div">
              {vi ? 'Đăng nhập lúc' : 'Signed in at'} {hhmm(signedInAt)}
            </Typography>
          )}
        </Box>
        <Divider />
        {onLogout && (
          <MenuItem onClick={signOut} disabled={signingOut} sx={{ color: 'error.main', mt: 0.5 }}>
            <ListItemIcon sx={{ color: 'inherit' }}>
              {signingOut ? <CircularProgress size={16} color="inherit" /> : <LogoutRounded fontSize="small" />}
            </ListItemIcon>
            <ListItemText>{vi ? 'Đăng xuất' : 'Sign out'}</ListItemText>
          </MenuItem>
        )}
      </Menu>
    </>
  )
}

export function Header({ lang, mode, rowCount, updatedAt, status, onRefresh, onChangeLang, onToggleTheme, account, onLogout }: Props) {
  const vi = lang === 'vi'
  const user = useCurrentUser()
  const loading = status.type === 'loading'
  const busy = loading || status.type === 'processing'
  const offline = status.type === 'error' && status.operation === 'load'
  const reloadLabel = vi ? 'Tải lại dữ liệu' : 'Reload data'
  const reloadTip = [reloadLabel, vi ? 'Đã kết nối' : 'Connected', ...(updatedAt ? [`${vi ? 'Cập nhật' : 'Updated'} ${hhmm(new Date(updatedAt))}`] : [])].join(' · ')
  return (
    // Transparent sticky shell holding a 44px floating glass bar aligned with the content column.
    // 4px above the bar; below it exactly density.gap (the content column has no top padding), like every other section gap.
    <AppBar position="sticky" color="transparent" elevation={0} sx={{ px: { xs: 1.5, md: 2.5 }, pt: px(4), pb: density.gap, bgcolor: 'transparent', boxShadow: 'none', backgroundImage: 'none', pointerEvents: 'none', '& > *': { pointerEvents: 'auto' } }}>
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
        <AppLogo size={30} />
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

        <Stack direction="row" spacing={0.75} role="group" aria-label={vi ? 'Điều khiển' : 'Controls'} sx={{ alignItems: 'center' }}>
        {/* Connection state lives on the reload control: dot (OK / syncing) or a retry pill (load failed). */}
        <Typography variant="caption" color="text.secondary" noWrap role="status" aria-live="polite" sx={{ display: { xs: 'none', md: 'block' } }}>
          {busy ? (vi ? 'Đang đồng bộ…' : 'Syncing…') : ''}
        </Typography>
        {offline ? (
          <ButtonBase
            onClick={onRefresh}
            sx={(theme) => ({
              gap: 0.75,
              height: 30,
              px: 1.25,
              borderRadius: '15px',
              fontSize: 12,
              fontWeight: 600,
              color: 'error.main',
              bgcolor: alpha(theme.palette.error.main, theme.palette.mode === 'dark' ? 0.16 : 0.08),
              border: `1px solid ${alpha(theme.palette.error.main, 0.3)}`,
              transition: 'background-color 160ms ease',
              '&:hover': { bgcolor: alpha(theme.palette.error.main, theme.palette.mode === 'dark' ? 0.24 : 0.14) },
              '&.Mui-focusVisible': { outline: `2px solid ${theme.palette.error.main}`, outlineOffset: 1 },
            })}
          >
            <CloudOffRounded sx={{ fontSize: 16 }} aria-hidden />
            <Box component="span" role="status" aria-live="polite">{vi ? 'Mất kết nối · Thử lại' : 'Offline · Retry'}</Box>
          </ButtonBase>
        ) : (
          <Tooltip title={reloadTip}>
            <Box component="span" sx={{ position: 'relative', display: 'inline-flex' }}>
              <IconButton size="small" onClick={onRefresh} disabled={busy} aria-label={reloadLabel} sx={(theme) => glassIconButton(theme)}>
                {loading ? <CircularProgress size={18} /> : <RefreshRounded fontSize="small" />}
              </IconButton>
              <Box
                aria-hidden
                data-testid="connection-dot"
                sx={(theme) => ({
                  position: 'absolute',
                  top: 3,
                  right: 3,
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  bgcolor: busy ? 'warning.main' : 'success.main',
                  boxShadow: `0 0 0 1.5px ${theme.palette.background.paper}`,
                  pointerEvents: 'none',
                  '@keyframes f2HeaderPulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.35 } },
                  animation: busy ? 'f2HeaderPulse 1.4s ease-in-out infinite' : 'none',
                  [REDUCED]: { animation: 'none' },
                })}
              />
            </Box>
          </Tooltip>
        )}

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
          <IconButton size="small" onClick={(e) => onToggleTheme(e)} sx={(theme) => glassIconButton(theme)} aria-label={mode === 'dark' ? (vi ? 'Chuyển sang chế độ sáng' : 'Switch to light mode') : (vi ? 'Chuyển sang chế độ tối' : 'Switch to dark mode')}>
            <ThemeModeIcon mode={mode} />
          </IconButton>
        </Tooltip>

        {account && <AccountMenu account={account} user={user?.account === account ? user : null} vi={vi} onLogout={onLogout} />}
        </Stack>
      </Toolbar>
    </AppBar>
  )
}
