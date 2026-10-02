// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataStatus } from '../../hooks/useFixedAssets'
import type { CurrentUser } from '../../api/authApi'
import { AuthContext, type AuthState } from '../../auth/authContext'
import { Header, initialsOf } from '../dashboard/Header'
import { AppLogo } from './AppLogo'

afterEach(cleanup)

const authWith = (user: CurrentUser): AuthState => ({ status: 'authenticated', account: user.account, user, error: null, login: async () => {}, logout: async () => {}, recheck: () => {} })

const renderHeader = (status: DataStatus, extra: { onRefresh?: () => void; onLogout?: () => void; user?: CurrentUser } = {}) => {
  const header = (
    <Header
      lang="vi"
      mode="light"
      rowCount={3}
      status={status}
      onRefresh={extra.onRefresh ?? (() => {})}
      onChangeLang={() => {}}
      onToggleTheme={() => {}}
      account={extra.user?.account ?? 'viet.ta'}
      onLogout={extra.onLogout}
    />
  )
  return render(extra.user ? <AuthContext.Provider value={authWith(extra.user)}>{header}</AuthContext.Provider> : header)
}

describe('AppLogo', () => {
  it('renders /favicon.png, hidden from assistive tech', () => {
    const { container } = render(<AppLogo size={30} />)
    expect(screen.getByTestId('app-logo').getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/favicon.png')
  })
})

describe('initialsOf', () => {
  it('first letter of the first + last word; one word -> one letter; no name -> 2 account characters', () => {
    expect(initialsOf('Nguyễn Trọng Ngữ', 'x')).toBe('NN')
    expect(initialsOf('  Đặng   Thị  Ánh ', 'x')).toBe('ĐÁ')
    expect(initialsOf('Việt', 'x')).toBe('V')
    expect(initialsOf(null, 'viet.ta')).toBe('VI')
    expect(initialsOf('  ', 'viet.ta')).toBe('VI')
  })
})

describe('Header', () => {
  it('with a user: name on the chip, initials, "account · Dept / Section" in the menu (nulls dropped)', () => {
    renderHeader({ type: 'ready' }, { user: { account: '22847', name: 'Nguyễn Trọng Ngữ', dept: 'IT', section: null }, onLogout: () => {} })
    expect(screen.getByTestId('header-account').textContent).toBe('Nguyễn Trọng Ngữ')
    expect(screen.getByTestId('header-avatar').textContent).toBe('NN')
    fireEvent.click(screen.getByRole('button', { name: 'Menu tài khoản: Nguyễn Trọng Ngữ (22847)' }))
    expect(screen.getByTestId('header-account-org').textContent).toBe('22847 · IT')
  })

  it('name null: "Không rõ tên" / "Unknown name"', () => {
    renderHeader({ type: 'ready' }, { user: { account: 'viet.ta', name: null, dept: null, section: null } })
    expect(screen.getByTestId('header-account').textContent).toBe('Không rõ tên')
  })

  it('uses AppLogo (no FactoryOutlined icon)', () => {
    const { container } = renderHeader({ type: 'ready' })
    expect(screen.getByTestId('app-logo')).toBeTruthy()
    expect(container.querySelector('[data-testid="FactoryOutlinedIcon"]')).toBeNull()
  })

  it('OK: a dot only, no "đã kết nối" text', () => {
    renderHeader({ type: 'ready' })
    expect(screen.getByTestId('connection-dot')).toBeTruthy()
    expect(screen.queryByText(/đã kết nối/i)).toBeNull()
  })

  it('load error: retry pill calls onRefresh', () => {
    const onRefresh = vi.fn()
    renderHeader({ type: 'error', operation: 'load', message: 'x' } as unknown as DataStatus, { onRefresh })
    fireEvent.click(screen.getByText('Mất kết nối · Thử lại'))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('account chip: avatar shows the first 2 characters; the menu signs out', async () => {
    const onLogout = vi.fn()
    renderHeader({ type: 'ready' }, { onLogout })
    expect(screen.getByTestId('header-avatar').textContent).toBe('VI')
    const chip = screen.getByRole('button', { name: 'Menu tài khoản: Không rõ tên (viet.ta)' })
    expect(chip.getAttribute('aria-haspopup')).toBe('menu')
    fireEvent.click(chip)
    expect(chip.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText(/Đăng nhập lúc \d\d:\d\d/)).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }))
    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1))
  })
})
