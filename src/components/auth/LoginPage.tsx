import { alpha, Alert, Box, Button, Checkbox, CircularProgress, Divider, FormControlLabel, IconButton, InputAdornment, Link, Popover, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useMediaQuery } from '@mui/material'
import type { PaletteMode, SxProps, Theme } from '@mui/material'
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded'
import KeyboardCapslockRounded from '@mui/icons-material/KeyboardCapslockRounded'
import LockOutlined from '@mui/icons-material/LockOutlined'
import PersonOutlineRounded from '@mui/icons-material/PersonOutlineRounded'
import ShieldOutlined from '@mui/icons-material/ShieldOutlined'
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined'
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined'
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { AuthError } from '../../api/authApi'
import type { Lang } from '../../types/fixedAsset'
import { glassIconButton, glassSegmented } from '../../theme/liquidGlass'
import { AppLogo } from '../common/AppLogo'
import { ThemeModeIcon } from '../dashboard/Header'
import type { ThemeToggleEvent } from '../../hooks/useThemeMode'
import { LoginLayoutPreview } from './LoginLayoutPreview'

interface Props {
  lang: Lang
  mode: PaletteMode
  onChangeLang: (lang: Lang) => void
  /** Receives the click so the theme change can reveal from the button (see useThemeMode). */
  onToggleTheme: (event?: ThemeToggleEvent) => void
  /** Rejects with AuthError (401 = wrong account or password). */
  onLogin: (account: string, password: string) => Promise<void>
}

/** Motion tokens (ms): entrance and interaction; all decorative motion is off under prefers-reduced-motion. */
const MOTION = { enter: 640, stagger: 90, hover: 160 } as const
const EASE = 'cubic-bezier(.2,.7,.2,1)'
const REDUCED = '@media (prefers-reduced-motion: reduce)'
/** Short desktop screens: drop the feature list and tighten the preview. */
const SHORT = '@media (max-height: 820px)'

/** Login panel width (px). */
const PANEL_W = 420
/** Shown by "Forgot password?". TODO: put the real IT helpdesk contact (extension / email) here. */
export const IT_CONTACT = {
  vi: 'Liên hệ bộ phận IT Pro để đặt lại mật khẩu tài khoản S-Patrol.',
  en: 'Contact the IT department to reset your S-Patrol password.',
} as const
/** Build version for the footer (VITE_APP_VERSION); the version part is omitted when unset. */
const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined)?.trim() || ''

/** Only the account name is remembered (never the password). */
const REMEMBER_KEY = 'f2.rememberAccount'

function readRemembered(): string {
  try {
    return window.localStorage.getItem(REMEMBER_KEY) ?? ''
  } catch {
    return ''
  }
}

function writeRemembered(account: string | null) {
  try {
    if (account) window.localStorage.setItem(REMEMBER_KEY, account)
    else window.localStorage.removeItem(REMEMBER_KEY)
  } catch {
    // Storage unavailable (private mode / blocked): remembering is a convenience only.
  }
}

/** Entrance (fade + 12px slide) of one block, `step` staggers it. Scoped to elements with this class only. */
const enter = (step: number): { animation: string } => ({
  animation: `f2LoginEnter ${MOTION.enter}ms ${EASE} ${step * MOTION.stagger}ms both`,
})

/** Login form (session cookie set by the BE). The password lives only in this component's state while typing. */
export function LoginPage({ lang, mode, onChangeLang, onToggleTheme, onLogin }: Props) {
  const vi = lang === 'vi'
  const [remembered] = useState(readRemembered)
  const [account, setAccount] = useState(remembered)
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(remembered !== '')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [capsLock, setCapsLock] = useState(false)
  const canSubmit = account.trim() !== '' && password !== '' && !busy
  const desktop = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'), { noSsr: true })

  const passwordRef = useRef<HTMLInputElement>(null)
  const accountId = useId()
  const passwordId = useId()
  const [forgotAnchor, setForgotAnchor] = useState<HTMLElement | null>(null)
  /** Set on a 401; the password field is focused once it is enabled again. */
  const focusPassword = useRef(false)
  useEffect(() => {
    if (!busy && focusPassword.current) {
      focusPassword.current = false
      passwordRef.current?.focus()
    }
  }, [busy])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    writeRemembered(remember ? account.trim() : null)
    try {
      await onLogin(account.trim(), password)
    } catch (err) {
      setPassword('')
      if (err instanceof AuthError && err.status === 401) {
        setError(vi ? 'Sai tài khoản hoặc mật khẩu' : 'Incorrect account or password')
        focusPassword.current = true
      } else setError(`${vi ? 'Không đăng nhập được' : 'Could not sign in'}: ${err instanceof Error ? err.message : String(err)}`)
      setBusy(false)
    }
  }

  const onRememberChange = (checked: boolean) => {
    setRemember(checked)
    if (!checked) writeRemembered(null)
  }
  const onPasswordKey = (e: KeyboardEvent<HTMLElement>) => setCapsLock(e.getModifierState('CapsLock'))

  const features = vi
    ? ['Theo dõi vị trí tài sản trên bản vẽ nhà máy', 'Yêu cầu di dời máy', 'Bản vẽ Trước / Sau cho từng yêu cầu']
    : ['Track asset locations on the plant drawings', 'Machine relocation requests', 'Before / After drawings for every request']

  /** Static field label above the input (no floating label, no asterisk; the input keeps required / aria-required). */
  const labelSx: SxProps<Theme> = { display: 'block', mb: 0.75, fontSize: 13, fontWeight: 600, color: 'text.primary' }
  /** Field look: 46px, leading icon, soft focus ring in the primary colour. */
  const fieldSx: SxProps<Theme> = (theme) => ({
    '& .MuiOutlinedInput-root': {
      minHeight: 46,
      borderRadius: '10px',
      bgcolor: theme.palette.mode === 'dark' ? alpha(theme.palette.common.white, 0.03) : theme.palette.background.paper,
      transition: `box-shadow ${MOTION.hover}ms ease, background-color ${MOTION.hover}ms ease`,
      '& fieldset': { transition: `border-color ${MOTION.hover}ms ease`, borderColor: theme.palette.mode === 'dark' ? alpha(theme.palette.common.white, 0.14) : alpha('#0f172a', 0.14) },
      '&:hover:not(.Mui-disabled):not(.Mui-focused) fieldset': { borderColor: alpha(theme.palette.primary.main, 0.45) },
      '&.Mui-focused': { boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.28 : 0.16)}` },
      '&.Mui-focused fieldset': { borderWidth: 1, borderColor: theme.palette.primary.main },
    },
    '& .MuiInputAdornment-positionStart': { color: 'text.secondary', transition: `color ${MOTION.hover}ms ease` },
    '& .Mui-focused .MuiInputAdornment-positionStart': { color: 'primary.main' },
  })

  return (
    <Box
      // Full-viewport layer: independent of the app layout container around it.
      sx={(theme) => ({
        position: 'fixed',
        inset: 0,
        zIndex: theme.zIndex.appBar + 1,
        overflowY: 'auto',
        bgcolor: 'background.default',
        color: 'text.primary',
        '@keyframes f2LoginEnter': { from: { opacity: 0, transform: 'translateY(12px)' }, to: { opacity: 1, transform: 'none' } },
        '@keyframes f2LoginFade': { from: { opacity: 0 }, to: { opacity: 1 } },
        [REDUCED]: {
          '& .f2-login-anim': { animation: 'none !important' },
          '& .f2-login-motion': { transition: 'none !important', transform: 'none !important' },
        },
      })}
    >
      {/* Background: ambient light blobs, technical grid fading out from the centre, faint survey lines. */}
      <Box
        aria-hidden
        className="f2-login-anim"
        sx={(theme) => {
          const dark = theme.palette.mode === 'dark'
          const primary = theme.palette.primary.main
          const grid = dark ? alpha(theme.palette.common.white, 0.04) : alpha('#0f172a', 0.045)
          const gridMajor = dark ? alpha(theme.palette.common.white, 0.06) : alpha('#0f172a', 0.07)
          return {
            position: 'fixed',
            inset: 0,
            pointerEvents: 'none',
            overflow: 'hidden',
            animation: `f2LoginFade ${MOTION.enter + 200}ms ease both`,
            backgroundImage: [
              `radial-gradient(900px 560px at 10% 15%, ${alpha(primary, dark ? 0.15 : 0.09)}, transparent 70%)`,
              `radial-gradient(720px 520px at 95% 90%, ${alpha(theme.palette.info?.main ?? primary, dark ? 0.1 : 0.06)}, transparent 70%)`,
              `radial-gradient(520px 360px at 70% 8%, ${alpha(primary, dark ? 0.06 : 0.04)}, transparent 70%)`,
            ].join(', '),
            // Fine 40px grid + major 200px grid, faded towards the edges.
            '&::before': {
              content: '""',
              position: 'absolute',
              inset: 0,
              backgroundImage: [
                `linear-gradient(${gridMajor} 1px, transparent 1px)`,
                `linear-gradient(90deg, ${gridMajor} 1px, transparent 1px)`,
                `linear-gradient(${grid} 1px, transparent 1px)`,
                `linear-gradient(90deg, ${grid} 1px, transparent 1px)`,
              ].join(', '),
              backgroundSize: '200px 200px, 200px 200px, 40px 40px, 40px 40px',
              maskImage: 'radial-gradient(ellipse 75% 70% at 45% 45%, #000 25%, transparent 85%)',
              WebkitMaskImage: 'radial-gradient(ellipse 75% 70% at 45% 45%, #000 25%, transparent 85%)',
            },
            // Two faint diagonal survey lines.
            '&::after': {
              content: '""',
              position: 'absolute',
              inset: 0,
              backgroundImage: `linear-gradient(115deg, transparent 49.9%, ${alpha(primary, dark ? 0.09 : 0.06)} 50%, transparent 50.1%), linear-gradient(115deg, transparent 71.9%, ${alpha(primary, dark ? 0.06 : 0.04)} 72%, transparent 72.1%)`,
            },
          }
        }}
      />

      {/* Top-right: language + theme. */}
      <Stack direction="row" spacing={0.75} sx={{
        position: 'absolute',
        // At least 16px from the corner (20/24px from sm), and clear of notches / rounded corners (safe area).
        top: { xs: 'max(16px, env(safe-area-inset-top))', sm: 'max(20px, env(safe-area-inset-top))' },
        right: { xs: 'max(16px, env(safe-area-inset-right))', sm: 'max(24px, env(safe-area-inset-right))' },
        zIndex: 1,
        alignItems: 'center',
      }}
      >
        <ToggleButtonGroup size="small" exclusive value={lang} onChange={(_, next: Lang | null) => next && onChangeLang(next)} aria-label={vi ? 'Ngôn ngữ' : 'Language'} sx={(theme) => glassSegmented(theme, lang === 'en' ? 1 : 0, 2)}>
          <ToggleButton value="vi" aria-label="Tiếng Việt">VI</ToggleButton>
          <ToggleButton value="en" aria-label="English">EN</ToggleButton>
        </ToggleButtonGroup>
        <Tooltip title={mode === 'dark' ? (vi ? 'Chế độ sáng' : 'Light mode') : (vi ? 'Chế độ tối' : 'Dark mode')}>
          <IconButton size="small" onClick={(e) => onToggleTheme(e)} sx={(theme) => glassIconButton(theme)} aria-label={mode === 'dark' ? (vi ? 'Chuyển sang chế độ sáng' : 'Switch to light mode') : (vi ? 'Chuyển sang chế độ tối' : 'Switch to dark mode')}>
            <ThemeModeIcon mode={mode} />
          </IconButton>
        </Tooltip>
      </Stack>

      <Box
        sx={{
          position: 'relative',
          minHeight: '100%',
          maxWidth: 1240,
          mx: 'auto',
          px: { xs: 2, sm: 4, md: 6 },
          py: { xs: 9, sm: 10, md: 6 },
          display: 'grid',
          alignItems: 'center',
          justifyItems: { xs: 'stretch', md: 'normal' },
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: `minmax(0, 1fr) ${PANEL_W}px` },
          gap: { xs: 4, md: 8, lg: 12 },
        }}
      >
        {/* Brand / product: full on desktop, a compact row on tablet, hidden on mobile (the panel carries the logo). */}
        <Box sx={{ display: { xs: 'none', sm: 'block' }, justifySelf: { sm: 'center', md: 'stretch' }, width: { sm: '100%' }, maxWidth: { sm: 440, md: 'none' }, minWidth: 0 }}>
          <Stack className="f2-login-anim" direction="row" spacing={2} sx={{ alignItems: 'center', ...enter(1) }}>
            <AppLogo size={56} />
            <Box sx={{ minWidth: 0 }}>
              <Typography component="p" sx={{ fontSize: { sm: 22, md: 28 }, fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.15 }}>
                <Box component="span" sx={{ color: 'primary.main' }}>F2</Box> Fixed Asset
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, letterSpacing: '0.02em' }}>
                Fixed Asset Management System
              </Typography>
            </Box>
          </Stack>
          <Box sx={{ display: { xs: 'none', md: 'block' } }}>
            <Box
              component="ul"
              className="f2-login-anim"
              sx={{ listStyle: 'none', p: 0, m: 0, mt: 3.5, display: 'grid', gap: 1.25, ...enter(2), [SHORT]: { display: 'none' } }}
            >
              {features.map((f) => (
                <Box component="li" key={f} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: 'text.secondary', fontSize: 14 }}>
                  <Box aria-hidden sx={(theme) => ({ width: 6, height: 6, borderRadius: '1px', bgcolor: 'primary.main', boxShadow: `0 0 0 4px ${alpha(theme.palette.primary.main, 0.12)}`, flexShrink: 0 })} />
                  {f}
                </Box>
              ))}
            </Box>
            {desktop && (
              <Box className="f2-login-anim" sx={{ mt: 5, ...enter(3), [SHORT]: { mt: 3 } }}>
                <LoginLayoutPreview vi={vi} />
              </Box>
            )}
          </Box>
        </Box>

        {/* Login panel. */}
        <Box
          component="form"
          noValidate
          onSubmit={submit}
          aria-label={vi ? 'Đăng nhập' : 'Sign in'}
          className="f2-login-anim"
          sx={(theme) => {
            const dark = theme.palette.mode === 'dark'
            return {
              ...enter(2),
              position: 'relative',
              justifySelf: 'center',
              width: '100%',
              maxWidth: PANEL_W,
              pt: '36px',
              px: { xs: '24px', sm: '32px' },
              pb: '24px',
              bgcolor: 'background.paper',
              border: `1px solid ${dark ? alpha(theme.palette.common.white, 0.08) : theme.palette.divider}`,
              // Accent: the card's own top border, so it follows the 16px corners.
              borderTop: `3px solid ${theme.palette.primary.main}`,
              borderRadius: '16px',
              boxShadow: dark
                ? `0 28px 56px -28px ${alpha(theme.palette.common.black, 0.75)}`
                : `0 1px 2px ${alpha(theme.palette.text.primary, 0.04)}, 0 28px 56px -32px ${alpha(theme.palette.text.primary, 0.3)}`,
            }
          }}
        >
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 3.5 }}>
            <AppLogo size={40} />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h1" component="h1" sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.01em' }}>
                {vi ? 'Chào mừng trở lại' : 'Welcome back'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {vi ? 'Dùng tài khoản S-Patrol để đăng nhập' : 'Sign in with your S-Patrol account'}
              </Typography>
            </Box>
          </Stack>

          <Stack spacing={2}>
            <Box>
              <Box component="label" htmlFor={accountId} sx={labelSx}>
                {vi ? 'Mã nhân viên' : 'Employee ID'}
              </Box>
              <TextField
                id={accountId}
                value={account}
                onChange={(e) => {
                  setAccount(e.target.value)
                  setError(null)
                }}
                placeholder={vi ? 'VD: 22847' : 'e.g. 22847'}
                autoComplete="username"
                autoFocus={remembered === ''}
                required
                fullWidth
                disabled={busy}
                sx={fieldSx}
                slotProps={{
                  htmlInput: { 'aria-required': true },
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <PersonOutlineRounded fontSize="small" />
                      </InputAdornment>
                    ),
                  },
                }}
              />
            </Box>
            <Box>
              {/* Label row: the Caps Lock warning sits on its right, so it never pushes the layout down. */}
              <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
                <Box component="label" htmlFor={passwordId} sx={labelSx}>
                  {vi ? 'Mật khẩu' : 'Password'}
                </Box>
                <Box component="span" aria-live="polite" sx={{ minHeight: 18 }}>
                  {capsLock && (
                    <Typography variant="caption" component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'warning.main', fontWeight: 600 }}>
                      <KeyboardCapslockRounded sx={{ fontSize: 16 }} aria-hidden />
                      {vi ? 'Caps Lock đang bật' : 'Caps Lock is on'}
                    </Typography>
                  )}
                </Box>
              </Box>
              <TextField
                id={passwordId}
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError(null)
                }}
                onKeyDown={onPasswordKey}
                onKeyUp={onPasswordKey}
                onBlur={() => setCapsLock(false)}
                inputRef={passwordRef}
                autoComplete="current-password"
                autoFocus={remembered !== ''}
                required
                fullWidth
                disabled={busy}
                sx={fieldSx}
                slotProps={{
                  htmlInput: { 'aria-required': true },
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <LockOutlined fontSize="small" />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          edge="end"
                          size="small"
                          onClick={() => setShow((s) => !s)}
                          aria-label={show ? (vi ? 'Ẩn mật khẩu' : 'Hide password') : (vi ? 'Hiện mật khẩu' : 'Show password')}
                          aria-pressed={show}
                        >
                          {show ? <VisibilityOffOutlined fontSize="small" /> : <VisibilityOutlined fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
            </Box>

            {/* Remember account (left) · Forgot password (right). */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mt: '4px !important' }}>
              <FormControlLabel
                control={<Checkbox size="small" checked={remember} onChange={(e) => onRememberChange(e.target.checked)} disabled={busy} />}
                label={vi ? 'Ghi nhớ tài khoản' : 'Remember account'}
                sx={{ ml: -0.75, mr: 0, '& .MuiFormControlLabel-label': { fontSize: 14, color: 'text.secondary' } }}
              />
              <Link
                component="button"
                type="button"
                underline="hover"
                onClick={(e: MouseEvent<HTMLButtonElement>) => setForgotAnchor(e.currentTarget)}
                aria-haspopup="dialog"
                aria-expanded={forgotAnchor !== null}
                sx={{ fontSize: 14, fontWeight: 600 }}
              >
                {vi ? 'Quên mật khẩu?' : 'Forgot password?'}
              </Link>
              <Popover
                open={forgotAnchor !== null}
                anchorEl={forgotAnchor}
                onClose={() => setForgotAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                slotProps={{ paper: { role: 'dialog', 'aria-label': vi ? 'Quên mật khẩu' : 'Forgot password', sx: { mt: 0.75, p: 1.5, maxWidth: 280, borderRadius: '10px' } } }}
              >
                <Typography variant="body2" data-testid="it-contact">{vi ? IT_CONTACT.vi : IT_CONTACT.en}</Typography>
              </Popover>
            </Box>

            {error && (
              <Alert severity="error" role="alert" sx={{ borderRadius: '10px', alignItems: 'center' }}>
                {error}
              </Alert>
            )}
            <Button
              type="submit"
              variant="contained"
              color="primary"
              size="large"
              fullWidth
              disabled={!canSubmit}
              startIcon={busy ? <CircularProgress size={18} color="inherit" data-testid="login-spinner" /> : undefined}
              endIcon={busy ? undefined : <ArrowForwardRounded />}
              className="f2-login-motion"
              sx={(theme) => ({
                minHeight: 46,
                borderRadius: '10px',
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: '0.01em',
                textTransform: 'none',
                boxShadow: `0 1px 2px ${alpha(theme.palette.text.primary, 0.12)}`,
                transition: `transform ${MOTION.hover}ms ease, box-shadow ${MOTION.hover}ms ease, background-color ${MOTION.hover}ms ease, opacity ${MOTION.hover}ms ease`,
                '&:hover': { transform: 'translateY(-1px)', boxShadow: `0 8px 20px -8px ${alpha(theme.palette.primary.main, 0.6)}` },
                '&:active': { transform: 'translateY(0) scale(0.985)', boxShadow: `0 1px 2px ${alpha(theme.palette.text.primary, 0.12)}` },
                '&.Mui-focusVisible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
                // Not ready: keep the primary colour, just faded (MUI would turn it grey); still disabled.
                '&.Mui-disabled': {
                  bgcolor: theme.palette.primary.main,
                  color: theme.palette.primary.contrastText,
                  opacity: busy ? 0.85 : 0.55,
                  boxShadow: 'none',
                },
              })}
            >
              {busy ? (vi ? 'Đang đăng nhập...' : 'Signing in...') : vi ? 'Đăng nhập' : 'Sign in'}
            </Button>
          </Stack>

          <Divider sx={{ mt: 3, mb: 1.5 }} />
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }} data-testid="login-session">
              <ShieldOutlined sx={{ fontSize: 14 }} aria-hidden />
              {vi ? 'Phiên đăng nhập 8 giờ' : '8-hour session'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              F2 Fixed Asset{APP_VERSION ? ` · v${APP_VERSION}` : ''}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
