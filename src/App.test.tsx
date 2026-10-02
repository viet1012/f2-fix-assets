// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

const json = (body: unknown, status = 200) => Promise.resolve(new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

/** BE: /api/auth/* as given; every other /api call answers `other` (500 by default: the dashboard shows its error state). */
function mockBackend({ me = 401, loginStatus = 200, other = 500 }: { me?: 200 | 401; loginStatus?: 200 | 401; other?: number } = {}) {
  let session = me === 200
  let releaseLogin: (() => void) | null = null
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/api/auth/me')) return session ? json({ account: 'viet.ta', name: 'Tạ Văn Việt', dept: 'IT', section: null }) : json({ error: 'Unauthorized' }, 401)
    if (url.endsWith('/api/auth/login')) {
      return new Promise<Response>((resolve) => {
        releaseLogin = () => {
          if (loginStatus === 200) session = true
          void (loginStatus === 200 ? json({ account: 'viet.ta', name: 'Tạ Văn Việt', dept: 'IT', section: null }) : json({ error: 'Bad credentials' }, 401)).then(resolve)
        }
      })
    }
    if (url.endsWith('/api/auth/logout')) {
      session = false
      return json(null, 204)
    }
    if (init?.method === undefined && !session) return json({ error: 'Unauthorized' }, 401)
    return json({ error: 'Server error' }, other)
  })
  vi.stubGlobal('fetch', fn)
  return { fn, release: () => releaseLogin?.() }
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  if (!window.matchMedia) {
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia
  }
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const loginAs = (account: string, password: string) => {
  fireEvent.change(screen.getByLabelText(/Mã nhân viên/), { target: { value: account } })
  fireEvent.change(screen.getByLabelText(/Mật khẩu/), { target: { value: password } })
  // Enter in a field submits the form.
  fireEvent.submit(screen.getByRole('form', { name: 'Đăng nhập' }))
}

describe('App auth (session cookie)', () => {
  it('not logged in: GET /api/auth/me 401 -> login page, no data request', async () => {
    const { fn } = mockBackend()
    render(<App />)
    expect(await screen.findByLabelText(/Mã nhân viên/)).toBeTruthy()
    expect(screen.getByLabelText(/Mật khẩu/)).toBeTruthy()
    const urls = fn.mock.calls.map(([u]) => String(u))
    expect(urls.every((u) => u.includes('/api/auth/'))).toBe(true)
    expect(fn.mock.calls[0][1]?.credentials).toBe('include')
  })

  it('login: spinner while sending, then the app with the account in the header; the password is not stored', async () => {
    const { fn, release } = mockBackend()
    render(<App />)
    await screen.findByLabelText(/Mã nhân viên/)
    loginAs('viet.ta', 's3cret-pass')
    expect(await screen.findByTestId('login-spinner')).toBeTruthy()
    const call = fn.mock.calls.find(([u]) => String(u).endsWith('/api/auth/login'))!
    expect(call[1]?.method).toBe('POST')
    expect(call[1]?.credentials).toBe('include')
    expect(JSON.parse(String(call[1]?.body))).toEqual({ account: 'viet.ta', password: 's3cret-pass' })
    release()
    expect((await screen.findByTestId('header-account')).textContent).toBe('Tạ Văn Việt')
    expect(screen.queryByLabelText(/Mật khẩu/)).toBeNull()
    const stored = JSON.stringify({ ...window.localStorage }) + JSON.stringify({ ...window.sessionStorage }) + document.cookie
    expect(stored).not.toContain('s3cret-pass')
    // Data requests carry the session cookie.
    await waitFor(() => expect(fn.mock.calls.some(([u]) => String(u).includes('/api/assets'))).toBe(true))
    for (const [u, init] of fn.mock.calls) if (String(u).includes('/api/')) expect(init?.credentials).toBe('include')
  })

  it('wrong account or password (401): "Sai tài khoản hoặc mật khẩu", password cleared', async () => {
    const { release } = mockBackend({ loginStatus: 401 })
    render(<App />)
    await screen.findByLabelText(/Mã nhân viên/)
    loginAs('viet.ta', 'wrong')
    release()
    expect(await screen.findByText('Sai tài khoản hoặc mật khẩu')).toBeTruthy()
    expect((screen.getByLabelText(/Mật khẩu/) as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText(/Mã nhân viên/) as HTMLInputElement).value).toBe('viet.ta')
  })

  it('English error message', async () => {
    const { release } = mockBackend({ loginStatus: 401 })
    window.localStorage.setItem('lang', 'en')
    render(<App />)
    await screen.findByLabelText(/Mã nhân viên|Employee ID/)
    const en = !!screen.queryByLabelText(/Employee ID/)
    if (!en) fireEvent.click(screen.getByRole('button', { name: 'English' }))
    fireEvent.change(screen.getByLabelText(/Employee ID/), { target: { value: 'x' } })
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'y' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Sign in' }))
    release()
    expect(await screen.findByText('Incorrect account or password')).toBeTruthy()
  })

  it('password show / hide button', async () => {
    mockBackend()
    render(<App />)
    const field = (await screen.findByLabelText(/Mật khẩu/)) as HTMLInputElement
    expect(field.type).toBe('password')
    fireEvent.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }))
    expect(field.type).toBe('text')
    fireEvent.click(screen.getByRole('button', { name: 'Ẩn mật khẩu' }))
    expect(field.type).toBe('password')
  })

  it('a 401 on any /api request (session expired) goes back to the login page', async () => {
    // Logged in (me 200), but the data API answers 401.
    mockBackend({ me: 200, other: 401 })
    render(<App />)
    // Dashboard mount + 401 + login page render can exceed the 1s default in jsdom.
    expect(await screen.findByLabelText(/Mã nhân viên/, {}, { timeout: 3000 })).toBeTruthy()
    expect(screen.queryByTestId('header-account')).toBeNull()
  })

  it('logout: POST /api/auth/logout, then the login page', async () => {
    const { fn } = mockBackend({ me: 200 })
    render(<App />)
    await screen.findByTestId('header-account')
    fireEvent.click(screen.getByRole('button', { name: /^Menu tài khoản/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }))
    expect(await screen.findByLabelText(/Mã nhân viên/, {}, { timeout: 3000 })).toBeTruthy()
    const call = fn.mock.calls.find(([u]) => String(u).endsWith('/api/auth/logout'))!
    expect(call[1]?.method).toBe('POST')
    expect(call[1]?.credentials).toBe('include')
  })
})
