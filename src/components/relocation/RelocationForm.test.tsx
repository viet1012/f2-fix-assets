// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_FORM, todayIso, type RelocationFormValues } from '../../utils/relocationForm'
import { RelocationForm } from './RelocationForm'

function Harness({ onSubmit, initial = EMPTY_FORM, lang = 'vi' as const, requesterName = null }: { onSubmit: (v: RelocationFormValues) => void; initial?: RelocationFormValues; lang?: 'vi' | 'en'; requesterName?: string | null }) {
  const [value, setValue] = useState(initial)
  return <RelocationForm lang={lang} account="viet.ta" requesterName={requesterName} value={value} onChange={setValue} moverCount={2} onSubmit={onSubmit} />
}

afterEach(cleanup)

describe('RelocationForm', () => {
  it('shows every "required" error on submit and does not call onSubmit', () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu (2 máy)' }))
    expect(screen.getAllByText('Bắt buộc')).toHaveLength(3)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects a past planned date and a completion date before it; submits once valid', () => {
    const onSubmit = vi.fn()
    const today = todayIso()
    render(<Harness onSubmit={onSubmit} initial={{ plannedMoveDate: '2000-01-02', plannedDoneDate: '2000-01-01', reason: 'Re-layout' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu (2 máy)' }))
    expect(screen.getByText('Không được chọn ngày trong quá khứ')).toBeTruthy()
    expect(screen.getByText('Phải từ ngày dự kiến trở đi')).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText(/Ngày dự kiến/), { target: { value: today } })
    fireEvent.change(screen.getByLabelText(/Ngày hoàn thành/), { target: { value: today } })
    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu (2 máy)' }))
    expect(onSubmit).toHaveBeenCalledWith({ plannedMoveDate: today, plannedDoneDate: today, reason: 'Re-layout' })
  })

  it('date inputs: min = today (local) for the planned date, min = planned date for completion', () => {
    const today = todayIso()
    render(<Harness onSubmit={() => {}} />)
    const planned = screen.getByLabelText(/Ngày dự kiến/) as HTMLInputElement
    const done = screen.getByLabelText(/Ngày hoàn thành/) as HTMLInputElement
    expect(planned.type).toBe('date')
    expect(planned.required && done.required).toBe(true)
    expect(planned.min).toBe(today)
    expect(done.min).toBe(today)
    fireEvent.change(planned, { target: { value: '2099-05-10' } })
    expect(done.min).toBe('2099-05-10')
  })

  it('todayIso uses the local date, not UTC', () => {
    expect(todayIso(new Date(2026, 9, 1, 0, 30))).toBe('2026-10-01')
    expect(todayIso(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31')
  })

  it('no employee ID field: a read-only "Người yêu cầu: {account}" line instead', () => {
    render(<Harness onSubmit={() => {}} />)
    expect(screen.queryByLabelText(/Mã nhân viên/)).toBeNull()
    expect(screen.getByTestId('reloc-requester').textContent).toBe('Người yêu cầu: Không rõ tên (viet.ta)')
    expect(screen.getByTestId('reloc-requester').querySelector('input')).toBeNull()
  })

  it('requester line shows the name and the account', () => {
    render(<Harness onSubmit={() => {}} requesterName="Nguyễn Trọng Ngữ" />)
    expect(screen.getByTestId('reloc-requester').textContent).toBe('Người yêu cầu: Nguyễn Trọng Ngữ (viet.ta)')
  })

  it('English labels', () => {
    render(<Harness onSubmit={() => {}} lang="en" />)
    fireEvent.click(screen.getByRole('button', { name: 'Submit request (2 machines)' }))
    expect(screen.getAllByText('Required')).toHaveLength(3)
    expect(screen.getByTestId('reloc-requester').textContent).toBe('Requested by: Unknown name (viet.ta)')
  })
})
