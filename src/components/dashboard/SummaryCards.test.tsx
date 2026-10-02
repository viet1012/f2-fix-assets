// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FixedAsset } from '../../types/fixedAsset'
import { SummaryCards } from './SummaryCards'

afterEach(cleanup)

const asset = (code: string, factory: string, group: string, cost: number): FixedAsset => ({
  code, name: code, group, floor: null, position: null, cost, maker: '', pic: null, pic_approved: '', status: null, kind: null, div: null, factory, depYears: null, dateStart: null, photoEval: null, hasPhoto: false,
})
const rows = [asset('A', 'F1', 'G1', 100), asset('B', 'F2', 'G1', 200), asset('C', 'F2', 'G2', 300)]
const section = () => screen.getByRole('region', { name: 'Chỉ số tổng quan' })

describe('SummaryCards', () => {
  it('one card with the 5 metrics', () => {
    render(<SummaryCards rows={rows} totalRows={3} flaggedCount={0} lang="vi" />)
    const s = within(section())
    for (const label of ['Tổng tài sản', 'Tổng giá trị', 'Factory', 'Bộ phận', 'Cần xử lý (FI)']) expect(s.getByText(label)).toBeTruthy()
    expect(s.getAllByTestId('metric-value').map((v) => v.textContent)).toEqual(['3', expect.any(String), '2', '2', '0'])
  })

  it('the "/ total" hint only when filtered; no more "Đã lọc từ" / "FI" sub-lines', () => {
    const { rerender } = render(<SummaryCards rows={rows} totalRows={3} flaggedCount={0} lang="vi" />)
    expect(screen.queryByTestId('metric-hint')).toBeNull()
    rerender(<SummaryCards rows={rows.slice(0, 2)} totalRows={2474} flaggedCount={0} lang="vi" />)
    expect(screen.getByTestId('metric-hint').textContent).toBe(`/ ${(2474).toLocaleString()}`)
    expect(screen.queryByText(/Đã lọc từ/)).toBeNull()
    expect(screen.queryByText('FI')).toBeNull()
  })

  it('"Cần xử lý" is a button calling onOpenIssues when given', () => {
    const onOpenIssues = vi.fn()
    render(<SummaryCards rows={rows} totalRows={3} flaggedCount={5} lang="vi" onOpenIssues={onOpenIssues} />)
    fireEvent.click(screen.getByRole('button', { name: /Cần xử lý/ }))
    expect(onOpenIssues).toHaveBeenCalledTimes(1)
  })

  it('without onOpenIssues there is no button', () => {
    render(<SummaryCards rows={rows} totalRows={3} flaggedCount={5} lang="en" />)
    expect(screen.getByRole('region', { name: 'Key metrics' })).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('loading: skeletons instead of values', () => {
    render(<SummaryCards rows={rows} totalRows={3} flaggedCount={0} lang="vi" loading />)
    expect(screen.queryAllByTestId('metric-value')).toHaveLength(0)
    expect(section().querySelectorAll('.MuiSkeleton-root')).toHaveLength(5)
  })
})
