// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RelocationRequest } from '../../types/relocation'
import { formatRequestDate, RelocationRequestsTable } from './RelocationRequestsTable'

afterEach(cleanup)

const req: RelocationRequest = {
  id: 'R0001',
  items: [{ code: 'M1', name: '', fromZone: 'A2-3', fromFloor: null, moveType: null }],
  to: { layoutId: 'floor1', zone: 'A1-1' },
  requestedBy: 'E001',
  plannedMoveDate: '2026-10-05',
  plannedDoneDate: '2026-10-31',
  reason: 'Layout',
  status: 'REQ_PENDING',
}

describe('RelocationRequestsTable', () => {
  it('requester column: "{requesterName} ({account})", placeholder when the name is unknown', () => {
    const reqs = [{ ...req, requesterName: 'Nguyễn Trọng Ngữ' }, { ...req, id: 'R0002', requesterName: null }]
    const cell = (id: string) => [...document.querySelector(`tr[data-request="${id}"]`)!.querySelectorAll('td')].map((td) => td.textContent)
    const { rerender } = render(<RelocationRequestsTable lang="vi" requests={reqs} />)
    expect(cell('R0001')).toContain('Nguyễn Trọng Ngữ (E001)')
    expect(cell('R0002')).toContain('Không rõ tên (E001)')
    rerender(<RelocationRequestsTable lang="en" requests={reqs} />)
    expect(cell('R0002')).toContain('Unknown name (E001)')
  })

  it('status labels (vi/en); an unknown status is shown as its raw code', () => {
    const statuses = ['REQ_PENDING', 'REQ_APPROVED', 'REQ_REJECTED', 'REQ_DONE', 'REQ_LEGACY_X']
    const reqs = statuses.map((s, i) => ({ ...req, id: `R000${i + 1}`, status: s as RelocationRequest['status'] }))
    const cells = () => statuses.map((_, i) => document.querySelector<HTMLElement>(`tr[data-request="R000${i + 1}"]`)!.querySelector('.MuiChip-label')!.textContent)
    const { rerender } = render(<RelocationRequestsTable lang="vi" requests={reqs} />)
    expect(cells()).toEqual(['Chờ duyệt', 'Đã duyệt', 'Từ chối', 'Hoàn tất', 'REQ_LEGACY_X'])
    rerender(<RelocationRequestsTable lang="en" requests={reqs} />)
    expect(cells()).toEqual(['Pending approval', 'Approved', 'Rejected', 'Done', 'REQ_LEGACY_X'])
  })

  it('formats yyyy-MM-dd as dd/MM/yyyy (vi) and keeps it (en), without a Date', () => {
    expect(formatRequestDate('2026-12-31', true)).toBe('31/12/2026')
    expect(formatRequestDate('2026-01-01', false)).toBe('2026-01-01')
    expect(formatRequestDate('', true)).toBe('-')
  })

  it('"Ngày dự kiến" / "Hoàn thành" columns', () => {
    const { rerender } = render(<RelocationRequestsTable lang="vi" requests={[req]} />)
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toContain('Ngày dự kiến')
    expect(headers).toContain('Hoàn thành')
    const row = within(screen.getAllByRole('row')[1])
    expect(row.getByText('05/10/2026')).toBeTruthy()
    expect(row.getByText('31/10/2026')).toBeTruthy()
    rerender(<RelocationRequestsTable lang="en" requests={[req]} />)
    expect(screen.getByText('2026-10-05')).toBeTruthy()
    expect(screen.getByText('2026-10-31')).toBeTruthy()
  })

  it('"Bản vẽ": link icon for a webUrl, file icon for a bare file name, "Tải lên lại" when none', () => {
    const onReupload = vi.fn()
    const reqs = [
      { ...req, id: 'R0001', drawingUrl: 'https://files.example/R0001.png' },
      { ...req, id: 'R0002', drawingUrl: 'R0002.png' },
      { ...req, id: 'R0003', drawingUrl: null },
    ]
    const { rerender } = render(<RelocationRequestsTable lang="vi" requests={reqs} onReupload={onReupload} />)
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toContain('Bản vẽ')
    const link = screen.getByTestId('drawing-link-R0001')
    expect(link.getAttribute('href')).toBe('https://files.example/R0001.png')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(screen.getByTestId('drawing-file-R0002')).toBeTruthy()
    const row3 = within(document.querySelector<HTMLElement>('tr[data-request="R0003"]')!)
    fireEvent.click(row3.getByRole('button', { name: 'Tải lên lại' }))
    expect(onReupload).toHaveBeenCalledWith(reqs[2])
    rerender(<RelocationRequestsTable lang="vi" requests={reqs} onReupload={onReupload} uploading={new Set(['R0003'])} />)
    const busy = row3.getByRole('button', { name: 'Đang tạo bản vẽ…' }) as HTMLButtonElement
    expect(busy.disabled).toBe(true)
    expect(row3.getByTestId('drawing-spinner-R0003')).toBeTruthy()
    fireEvent.click(busy)
    expect(onReupload).toHaveBeenCalledTimes(1)
  })
})

describe('RelocationRequestsTable - actions', () => {
  it('shows the request number verbatim; "Tạo lại Excel" only in the menu of rows I may manage', () => {
    const onRegenerateExcel = vi.fn()
    const reqs = [req, { ...req, id: 'R0002', requestedBy: 'E999' }]
    render(<RelocationRequestsTable lang="vi" requests={reqs} onRegenerateExcel={onRegenerateExcel} canManage={(r) => r.requestedBy === 'E001'} />)
    expect(screen.getByText('R0001')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Hành động R0002' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Hành động R0001' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tạo lại Excel' }))
    expect(onRegenerateExcel).toHaveBeenCalledWith(expect.objectContaining({ id: 'R0001' }))
  })

  it('no action column without onRegenerateExcel', () => {
    render(<RelocationRequestsTable lang="vi" requests={[req]} />)
    expect(screen.queryByRole('button', { name: /Hành động/ })).toBeNull()
  })
})