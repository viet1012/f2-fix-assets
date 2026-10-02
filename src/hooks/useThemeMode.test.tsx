// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import { ThemeProvider } from '@mui/material'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppLogo } from '../components/common/AppLogo'
import { LoginLayoutPreview } from '../components/auth/LoginLayoutPreview'
import { createAppTheme } from '../theme/appTheme'
import { useThemeMode } from './useThemeMode'

/** Loose view of document to install / remove a fake startViewTransition. */
const vt = document as unknown as { startViewTransition?: unknown }

function stubMatchMedia(reduced: boolean) {
  window.matchMedia = ((q: string) => ({ matches: reduced && q.includes('reduce'), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  window.localStorage.clear()
  stubMatchMedia(false)
})
afterEach(() => {
  cleanup()
  delete vt.startViewTransition
  vi.restoreAllMocks()
})

describe('useThemeMode toggle', () => {
  it('with the View Transitions API: startViewTransition, then a circular clip-path reveal from the button centre', async () => {
    const animate = vi.fn()
    document.documentElement.animate = animate as unknown as typeof document.documentElement.animate
    const start = vi.fn((update: () => void) => {
      update()
      return { ready: Promise.resolve() }
    })
    vt.startViewTransition = start
    const button = document.createElement('button')
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 20, width: 40, height: 40, right: 140, bottom: 60, x: 100, y: 20, toJSON: () => ({}) })
    const { result } = renderHook(() => useThemeMode())
    await act(async () => result.current.toggleMode({ currentTarget: button }))
    expect(start).toHaveBeenCalledTimes(1)
    expect(result.current.mode).toBe('dark')
    const [keyframes, options] = animate.mock.calls[0]
    expect(keyframes.clipPath[0]).toBe('circle(0px at 120px 40px)')
    expect(keyframes.clipPath[1]).toMatch(/^circle\([\d.]+px at 120px 40px\)$/)
    expect(options).toMatchObject({ duration: 450, easing: 'ease-out', pseudoElement: '::view-transition-new(root)' })
    expect(document.getElementById('f2-theme-reveal')?.textContent).toContain('::view-transition-new(root)')
  })

  it('without the API: switches at once', () => {
    const { result } = renderHook(() => useThemeMode())
    act(() => result.current.toggleMode())
    expect(result.current.mode).toBe('dark')
  })

  it('reduced motion: switches at once, no view transition', () => {
    stubMatchMedia(true)
    const start = vi.fn()
    vt.startViewTransition = start
    const { result } = renderHook(() => useThemeMode())
    act(() => result.current.toggleMode())
    expect(start).not.toHaveBeenCalled()
    expect(result.current.mode).toBe('dark')
  })
})

describe('mode-dependent surfaces', () => {
  const inMode = (mode: 'light' | 'dark', ui: React.ReactElement) => render(<ThemeProvider theme={createAppTheme(mode)}>{ui}</ThemeProvider>)

  it('AppLogo (transparent favicon): white tile in light, background.paper in dark', () => {
    inMode('light', <AppLogo size={30} />)
    expect(getComputedStyle(screen.getByTestId('app-logo')).backgroundColor).toBe('rgb(255, 255, 255)')
    cleanup()
    const paper = createAppTheme('dark').palette.background.paper
    const probe = document.createElement('div')
    probe.style.backgroundColor = paper
    inMode('dark', <AppLogo size={30} />)
    expect(getComputedStyle(screen.getByTestId('app-logo')).backgroundColor).toBe(probe.style.backgroundColor)
  })

  it('preview drawing: blueprint invert filter in dark, grayscale in light', () => {
    const { container } = inMode('dark', <LoginLayoutPreview vi />)
    const style = container.querySelector('image')!.getAttribute('style')!
    expect(style).toContain('invert(1) hue-rotate(180deg) brightness(.9)')
    expect(style).not.toContain('grayscale')
    cleanup()
    const light = inMode('light', <LoginLayoutPreview vi />)
    expect(light.container.querySelector('image')!.getAttribute('style')).toContain('grayscale(1)')
  })
})
