// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DashboardFilters, FixedAsset } from '../../types/fixedAsset'
import { emptyFilters } from '../../utils/fixedAsset'
import { FilterBar, secondary } from './FilterBar'

afterEach(cleanup)

const asset = (code: string, floor: string): FixedAsset => ({
  code, name: code, group: 'G1', floor, position: null, cost: 1, maker: '', pic: null, pic_approved: '', status: null, kind: null, div: null, factory: 'F1', depYears: null, dateStart: null, photoEval: null, hasPhoto: false,
})
const rows = [asset('A', '1F'), asset('B', '2F')]

function setup(value: DashboardFilters = emptyFilters) {
  const onChange = vi.fn()
  render(<FilterBar lang="vi" rows={rows} filteredCount={1} value={value} onChange={onChange} onReset={vi.fn()} />)
  return { onChange }
}

describe('FilterBar', () => {
  it('one row: search + Factory, Div, Loại tài sản; count and clear on the right', () => {
    setup()
    expect(screen.getByRole('textbox', { name: 'Tìm kiếm' })).toBeTruthy()
    for (const label of ['Factory (Fac)', 'Div', 'Loại tài sản']) expect(screen.getByLabelText(label)).toBeTruthy()
    for (const label of ['Bộ phận (Group)', 'Floor']) expect(screen.queryByLabelText(label)).toBeNull()
    expect(screen.getByText(/\/2 tài sản/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Xóa lọc/ })).toBeTruthy()
  })

  it('"+ Thêm bộ lọc (N)": N = hidden fields; the popover holds all 5', () => {
    setup()
    expect(secondary).toHaveLength(5)
    fireEvent.click(screen.getByRole('button', { name: 'Thêm bộ lọc (5)' }))
    const pop = within(screen.getByTestId('more-filters'))
    for (const label of ['Bộ phận (Group)', 'PIC Checked', 'PIC Approved', 'Floor', 'Trạng thái']) expect(pop.getByLabelText(label)).toBeTruthy()
  })

  it('chip row only for active popover filters; ✕ removes exactly that one', () => {
    setup({ ...emptyFilters, text: 'x', factory: 'F1' })
    expect(screen.queryByText(/Floor:/)).toBeNull()
    cleanup()
    const { onChange } = setup({ ...emptyFilters, factory: 'F1', floor: '1F', status: 'S' })
    expect(screen.queryByText(/Factory \(Fac\):/)).toBeNull()
    const chip = screen.getByText('Floor: 1F').closest('.MuiChip-root') as HTMLElement
    expect(screen.getByText('Trạng thái: S')).toBeTruthy()
    fireEvent.click(chip.querySelector('.MuiChip-deleteIcon')!)
    expect(onChange).toHaveBeenCalledWith({ ...emptyFilters, factory: 'F1', floor: '', status: 'S' })
  })
})
