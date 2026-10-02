// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ThemeProvider } from '@mui/material'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppTheme } from '../../theme/appTheme'
import { AuthError } from '../../api/authApi'
import { IT_CONTACT, LoginPage } from './LoginPage'
import { LoginLayoutPreview } from './LoginLayoutPreview'

/** Renders inside the app's real theme (LoginPage reads breakpoints from it via useMediaQuery). */
const renderWithTheme = (ui: ReactElement) => {
  const theme = createAppTheme('light')
  const view = render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>)
  return { ...view, rerender: (next: ReactElement) => view.rerender(<ThemeProvider theme={theme}>{next}</ThemeProvider>) }
}

/** matchMedia stub: `matching` lists the queries that match (MUI passes them without the "@media "). */
function stubMatchMedia(matching: (q: string) => boolean = () => false) {
  window.matchMedia = ((q: string) => ({ matches: matching(q), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  window.localStorage.clear()
  stubMatchMedia()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const renderLogin = (onLogin: (a: string, p: string) => Promise<void> = async () => {}) =>
  renderWithTheme(<LoginPage lang="vi" mode="light" onChangeLang={() => {}} onToggleTheme={() => {}} onLogin={onLogin} />)
const accountField = () => screen.getByLabelText(/Mã nhân viên/) as HTMLInputElement
const passwordField = () => screen.getByLabelText(/Mật khẩu/) as HTMLInputElement
const fill = (account: string, password: string) => {
  fireEvent.change(accountField(), { target: { value: account } })
  fireEvent.change(passwordField(), { target: { value: password } })
}
const submit = () => fireEvent.submit(screen.getByRole('form', { name: 'Đăng nhập' }))

describe('LoginPage', () => {
  it('Caps Lock warning follows the modifier state of key events in the password field', () => {
    renderLogin()
    expect(screen.queryByText('Caps Lock đang bật')).toBeNull()
    fireEvent.keyDown(passwordField(), { key: 'A', modifierCapsLock: true })
    expect(screen.getByText('Caps Lock đang bật')).toBeTruthy()
    fireEvent.keyUp(passwordField(), { key: 'CapsLock', modifierCapsLock: false })
    expect(screen.queryByText('Caps Lock đang bật')).toBeNull()
  })

  it('remember account: stores only the account, pre-fills it and focuses the password next time; unchecking clears it', async () => {
    const view = renderLogin()
    fill('viet.ta', 's3cret')
    fireEvent.click(screen.getByLabelText('Ghi nhớ tài khoản'))
    submit()
    await waitFor(() => expect(window.localStorage.getItem('f2.rememberAccount')).toBe('viet.ta'))
    expect(JSON.stringify({ ...window.localStorage })).not.toContain('s3cret')
    view.unmount()

    renderLogin()
    expect(accountField().value).toBe('viet.ta')
    expect((screen.getByLabelText('Ghi nhớ tài khoản') as HTMLInputElement).checked).toBe(true)
    expect(document.activeElement).toBe(passwordField())
    fireEvent.click(screen.getByLabelText('Ghi nhớ tài khoản'))
    expect(window.localStorage.getItem('f2.rememberAccount')).toBeNull()
  })

  it('not remembered by default', async () => {
    const onLogin = vi.fn(async () => {})
    renderLogin(onLogin)
    expect(document.activeElement).toBe(accountField())
    fill('viet.ta', 'x')
    submit()
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith('viet.ta', 'x'))
    expect(window.localStorage.getItem('f2.rememberAccount')).toBeNull()
  })

  it('401: message, password cleared and focused; typing clears the error', async () => {
    renderLogin(() => Promise.reject(new AuthError(401, 'Bad credentials')))
    fill('viet.ta', 'wrong')
    submit()
    expect(await screen.findByText('Sai tài khoản hoặc mật khẩu')).toBeTruthy()
    expect(passwordField().value).toBe('')
    await waitFor(() => expect(document.activeElement).toBe(passwordField()))
    fireEvent.change(passwordField(), { target: { value: 'a' } })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('generic error keeps the message format', async () => {
    renderLogin(() => Promise.reject(new Error('Network down')))
    fill('viet.ta', 'x')
    submit()
    expect(await screen.findByText('Không đăng nhập được: Network down')).toBeTruthy()
  })

  it('the layout preview is mounted only from md up', () => {
    renderLogin()
    expect(screen.queryByRole('tablist')).toBeNull()
    cleanup()
    stubMatchMedia((q) => q.includes('min-width'))
    renderLogin()
    expect(screen.getByRole('tablist')).toBeTruthy()
  })
})

describe('LoginPage panel', () => {
  it('static labels without a visible "*", inputs still required / aria-required; placeholder on the employee ID', () => {
    const { container } = renderLogin()
    expect(container.querySelector('.MuiFormLabel-asterisk')).toBeNull()
    expect(container.textContent).not.toContain('*')
    for (const input of [accountField(), passwordField()]) {
      expect(input.required).toBe(true)
      expect(input.getAttribute('aria-required')).toBe('true')
    }
    expect(accountField().placeholder).toBe('VD: 22847')
    expect(screen.getByRole('heading', { name: 'Chào mừng trở lại' })).toBeTruthy()
    expect(screen.queryByText('Đăng nhập để tiếp tục')).toBeNull()
  })

  it('"Quên mật khẩu?" opens a popover with IT_CONTACT, Esc closes it', async () => {
    renderLogin()
    fireEvent.click(screen.getByRole('button', { name: 'Quên mật khẩu?' }))
    expect(screen.getByTestId('it-contact').textContent).toBe(IT_CONTACT.vi)
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Quên mật khẩu' }), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('it-contact')).toBeNull())
  })

  it('submit not ready: disabled, faded (opacity 0.55) but still the primary colour, not grey', () => {
    renderLogin()
    const button = screen.getByRole('button', { name: 'Đăng nhập' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    const style = getComputedStyle(button)
    expect(style.opacity).toBe('0.55')
    const probe = document.createElement('div')
    probe.style.backgroundColor = createAppTheme('light').palette.primary.main
    expect(style.backgroundColor).toBe(probe.style.backgroundColor)
  })

  it('footer: 8-hour session', () => {
    renderLogin()
    expect(screen.getByTestId('login-session').textContent).toBe('Phiên đăng nhập 8 giờ')
  })
})

describe('LoginLayoutPreview', () => {
  const selected = () => screen.getAllByRole('tab').find((t) => t.getAttribute('aria-selected') === 'true')?.textContent

  it('autoplays Press -> Mold -> Guide every 6s and a click switches immediately and resets the timer', () => {
    vi.useFakeTimers()
    renderWithTheme(<LoginLayoutPreview vi />)
    expect(selected()).toBe('Press')
    act(() => vi.advanceTimersByTime(6000))
    expect(selected()).toBe('Mold')
    act(() => vi.advanceTimersByTime(6000))
    expect(selected()).toBe('Guide')
    act(() => vi.advanceTimersByTime(4000))
    fireEvent.click(screen.getByRole('tab', { name: 'Mold' }))
    expect(selected()).toBe('Mold')
    act(() => vi.advanceTimersByTime(4000))
    expect(selected()).toBe('Mold')
    act(() => vi.advanceTimersByTime(2000))
    expect(selected()).toBe('Guide')
  })

  it('pauses while hovered', () => {
    vi.useFakeTimers()
    renderWithTheme(<LoginLayoutPreview vi />)
    const card = screen.getByRole('tablist').closest('div')!.parentElement!
    fireEvent.mouseEnter(card)
    act(() => vi.advanceTimersByTime(20000))
    expect(selected()).toBe('Press')
    fireEvent.mouseLeave(card)
    act(() => vi.advanceTimersByTime(6000))
    expect(selected()).toBe('Mold')
  })

  it('reduced motion: static Press view, no autoplay, tabs still work; only the active drawing is mounted', () => {
    stubMatchMedia((q) => q.includes('prefers-reduced-motion'))
    vi.useFakeTimers()
    const { container } = renderWithTheme(<LoginLayoutPreview vi={false} />)
    act(() => vi.advanceTimersByTime(20000))
    expect(selected()).toBe('Press')
    expect(container.querySelectorAll('image')).toHaveLength(1)
    fireEvent.click(screen.getByRole('tab', { name: 'Guide' }))
    expect(selected()).toBe('Guide')
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(screen.getByRole('tab', { name: 'Guide' }).id)
  })

  it('autoplay mounts the active and the next drawing only', () => {
    const { container } = renderWithTheme(<LoginLayoutPreview vi />)
    expect(container.querySelectorAll('image')).toHaveLength(2)
  })
})
