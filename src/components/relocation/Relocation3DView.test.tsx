// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { lazy, Suspense } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FLOORS } from '../../data/mapData'
import { DEFAULT_CONTEXT } from '../../utils/relocation'

const renderers = vi.hoisted(() => [] as Array<{ dispose: ReturnType<typeof vi.fn>; domElement: HTMLCanvasElement }>)

// No WebGL in jsdom: a stand-in renderer that records dispose().
vi.mock('three', async (importOriginal) => {
  const three = await importOriginal<typeof import('three')>()
  class FakeRenderer {
    domElement = document.createElement('canvas')
    shadowMap = { enabled: false, type: 0 }
    dispose = vi.fn()
    setPixelRatio() {}
    setSize() {}
    render() {}
    constructor() {
      renderers.push(this)
    }
  }
  return { ...three, WebGLRenderer: FakeRenderer }
})

import Relocation3DView, { zoneHeight } from './Relocation3DView'

const props = {
  lang: 'vi' as const,
  open: true,
  onClose: () => {},
  layouts: FLOORS,
  initialLayoutId: 'floor1' as const,
  zoneCount: new Map([['A1-1', 4], ['A2-1', 16]]),
  rows: [],
  target: { layoutId: 'floor1' as const, zone: 'A2-1' },
  ctx: DEFAULT_CONTEXT,
  route: null,
  routeColors: { from: '#b7791f', to: '#047857' },
  placeOf: () => 'Toà A / 1F',
  layoutPlace: () => 'Toà A / 1F',
  isPickable: () => true,
  onPickZone: () => {},
}

const stubWebGL = (ok: boolean) =>
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => (ok ? {} : null)) as never)

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  renderers.length = 0
})

describe('Relocation3DView', () => {
  it('loads lazily as its own module (default export)', async () => {
    stubWebGL(false)
    const Lazy = lazy(() => import('./Relocation3DView'))
    render(
      <Suspense fallback={<span>loading</span>}>
        <Lazy {...props} />
      </Suspense>,
    )
    expect(await screen.findByTestId('reloc-3d-nowebgl')).toBeTruthy()
  })

  it('shows a message without WebGL (vi / en)', () => {
    stubWebGL(false)
    const { rerender } = render(<Relocation3DView {...props} />)
    expect(screen.getByTestId('reloc-3d-nowebgl').textContent).toMatch(/không hỗ trợ WebGL/)
    rerender(<Relocation3DView {...props} lang="en" />)
    expect(screen.getByTestId('reloc-3d-nowebgl').textContent).toMatch(/does not support WebGL/)
    expect(renderers).toHaveLength(0)
  })

  it('zone height = 0.3 + 2.5·sqrt(count / max)', () => {
    expect(zoneHeight(0, 10)).toBeCloseTo(0.3)
    expect(zoneHeight(10, 10)).toBeCloseTo(2.8)
    expect(zoneHeight(4, 16)).toBeCloseTo(0.3 + 2.5 * 0.5)
    expect(zoneHeight(3, 0)).toBeCloseTo(0.3)
  })

  it('disposes the renderer and removes the canvas when closed', async () => {
    stubWebGL(true)
    const { unmount } = render(<Relocation3DView {...props} />)
    await waitFor(() => expect(renderers).toHaveLength(1))
    const [r] = renderers
    expect(r.domElement.isConnected).toBe(true)
    unmount()
    expect(r.dispose).toHaveBeenCalledTimes(1)
    expect(r.domElement.isConnected).toBe(false)
  })
})
