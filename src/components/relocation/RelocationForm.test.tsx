// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_FORM, todayIso, type RelocationFormValues } from '../../utils/relocationForm'
import { RelocationForm } from './RelocationForm'

function Harness({ onSubmit, initial = EMPTY_FORM, lang = 'vi' as const }: { onSubmit: (v: RelocationFormValues) => void; initial?: RelocationFormValues; lang?: 'vi' | 'en' }) {
  const [value, setValue] = useState(initial)
  return <RelocationForm lang={lang} value={value} onChange={setValue} moverCount={2} onSubmit={onSubmit} />
}

afterEach(cleanup)

describe('RelocationForm', () => {
  it('shows every "required" error on submit and does not call onSubmit', () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu (2 máy)' }))
    expect(screen.getAllByText('Bắt buộc')).toHaveLength(4)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects a past planned date and a completion date before it; submits once valid', () => {
    const onSubmit = vi.fn()
    const today = todayIso()
    render(<Harness onSubmit={onSubmit} initial={{ requestedBy: 'E001', dStart: '2000-01-02', dEnd: '2000-01-01', reason: 'Re-layout' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu (2 máy)' }))
    expect(screen.getByText('Không được chọn ngày trong quá khứ')).toBeTruthy()
    expect(screen.getByText('Phải từ ngày dự kiến trở đi')).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText(/Ngày dự kiến/), { target: { value: today } })
    fireEvent.change(screen.getByLabelText(/Ngày hoàn thành/), { target: { value: today } })
    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu (2 máy)' }))
    expect(onSubmit).toHaveBeenCalledWith({ requestedBy: 'E001', dStart: today, dEnd: today, reason: 'Re-layout' })
  })

  it('English labels', () => {
    render(<Harness onSubmit={() => {}} lang="en" />)
    fireEvent.click(screen.getByRole('button', { name: 'Submit request (2 machines)' }))
    expect(screen.getAllByText('Required')).toHaveLength(4)
    expect(screen.getByLabelText(/Employee ID/)).toBeTruthy()
  })
})
