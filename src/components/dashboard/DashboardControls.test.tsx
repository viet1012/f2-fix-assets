// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppTab, DashboardFilters, FixedAsset } from '../../types/fixedAsset'
import { emptyFilters } from '../../utils/fixedAsset'
import { COLLAPSED_STORAGE_KEY, countActiveFilters, DashboardControls } from './DashboardControls'

beforeEach(() => window.localStorage.clear())
afterEach(cleanup)

const asset = (code: string, cost: number): FixedAsset => ({
  code, name: code, group: 'G1', floor: null, position: null, cost, maker: '', pic: null, pic_approved: '', status: null, kind: null, div: null, factory: 'F1', depYears: null, dateStart: null, photoEval: null, hasPhoto: false,
})
const rows = [asset('A', 100), asset('B', 200), asset('C', 300)]

function setup({ tab = 'overview' as AppTab, filters = emptyFilters as DashboardFilters, flaggedCount = 2 } = {}) {
  const onReset = vi.fn()
  const onOpenIssues = vi.fn()
  const props = { lang: 'vi' as const, onChangeTab: vi.fn(), rows, filteredRows: rows.slice(0, 2), flaggedCount, filters, onChangeFilters: vi.fn(), onReset, onOpenIssues }
  const utils = render(<DashboardControls {...props} tab={tab} />)
  return { ...utils, onReset, onOpenIssues, rerenderTab: (t: AppTab) => utils.rerender(<DashboardControls {...props} tab={t} />) }
}

const toggleBtn = () => screen.getByRole('button', { name: /^(Thu gọn|Mở rộng) tổng quan/ })
const expanded = () => toggleBtn().getAttribute('aria-expanded') === 'true'

describe('DashboardControls', () => {
  it('no separate title row; the toggle sits in the tab row', () => {
    setup()
    expect(screen.queryByText('Tổng quan & bộ lọc')).toBeNull()
    const tablist = screen.getByRole('tablist')
    const row = screen.getByTestId('controls-toggle-row')
    // Same sticky row: the tab bar and the toggle share their closest flex container.
    expect(row.contains(toggleBtn())).toBe(true)
    expect(tablist.closest('.MuiTabs-root')!.parentElement!.contains(row)).toBe(true)
  })

  it('expanded by default (only the button); the button collapses and expands', () => {
    setup()
    expect(expanded()).toBe(true)
    expect(screen.queryByTestId('controls-summary')).toBeNull()
    const regionId = toggleBtn().getAttribute('aria-controls')!
    expect(document.getElementById(regionId)).toBeTruthy()
    fireEvent.click(toggleBtn())
    expect(expanded()).toBe(false)
    fireEvent.click(toggleBtn())
    expect(expanded()).toBe(true)
  })

  it('collapsed summary: asset count, flagged (opens issues) and active filters (expands)', () => {
    const { onOpenIssues } = setup({ filters: { ...emptyFilters, text: 'x', factory: 'F1' } })
    fireEvent.click(toggleBtn())
    const summary = within(screen.getByTestId('controls-summary'))
    expect(summary.getByRole('img', { name: '2/3 tài sản' }).textContent).toBe('2TS')
    fireEvent.click(summary.getByRole('button', { name: '2 cần xử lý' }))
    expect(onOpenIssues).toHaveBeenCalledTimes(1)
    fireEvent.click(summary.getByRole('button', { name: 'Bộ lọc: 2 đang áp dụng' }))
    expect(expanded()).toBe(true)
  })

  it('no filter stat when no filter is active', () => {
    setup()
    fireEvent.click(toggleBtn())
    expect(screen.queryByRole('button', { name: /đang áp dụng/ })).toBeNull()
    expect(countActiveFilters(emptyFilters)).toBe(0)
  })

  it('Alt+F toggles, but not while typing in an input', () => {
    setup()
    fireEvent.keyDown(window, { key: 'f', code: 'KeyF', altKey: true })
    expect(expanded()).toBe(false)
    fireEvent.keyDown(window, { key: 'f', code: 'KeyF', altKey: true })
    expect(expanded()).toBe(true)
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Tìm kiếm' }), { key: 'f', code: 'KeyF', altKey: true })
    expect(expanded()).toBe(true)
  })

  it('relocation tab auto-collapses with a note in the tab row, without touching localStorage', () => {
    const { rerenderTab } = setup()
    rerenderTab('relocation')
    expect(expanded()).toBe(false)
    expect(within(screen.getByTestId('controls-toggle-row')).getByText('Bộ lọc không áp dụng cho tab này')).toBeTruthy()
    expect(window.localStorage.getItem(COLLAPSED_STORAGE_KEY)).toBeNull()
    rerenderTab('table')
    expect(expanded()).toBe(true)
    expect(screen.queryByText('Bộ lọc không áp dụng cho tab này')).toBeNull()
  })

  it('persists the choice and reads it back', () => {
    const first = setup()
    fireEvent.click(toggleBtn())
    expect(window.localStorage.getItem(COLLAPSED_STORAGE_KEY)).toBe('1')
    first.unmount()
    setup()
    expect(expanded()).toBe(false)
  })
})
