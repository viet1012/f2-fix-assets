// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useMemo, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MachinePicker } from './MachinePicker'

type R = { code: string; name: string; kind: string; currentZone: string; floor: string | null; mapFloor: string | null; floorMismatch: boolean; fac: string }
const row = (code: string, name: string, fac: string, zone: string, kind = 'Machinery'): R => ({ code, name, kind, currentZone: zone, floor: null, mapFloor: null, floorMismatch: false, fac })
const ROWS: R[] = [
  row('A-001', 'Máy tiện CNC', 'Fac_A', 'A2-3'),
  row('A-002', 'Máy phay đứng', 'Fac_A', 'A2-3'),
  row('A-003', 'Máy tiện cũ', 'Fac_A', 'A2-3'), // PENDING
  row('A-004', 'Xe nâng', 'Fac_A', 'A2-3', 'Vehicle'), // wrong kind
  row('A-005', 'Máy khoan', 'Fac_A', 'A1-1'),
  row('B-001', 'Máy tiện nhỏ', 'Fac_B', 'B1-1'),
]

function Harness({ onNext }: { onNext?: () => void }) {
  const [selected, setSelected] = useState<string[]>([])
  const byCode = useMemo(() => new Map(ROWS.map((r) => [r.code, r])), [])
  return (
    <MachinePicker
      lang="vi"
      rows={ROWS}
      byCode={byCode}
      selected={selected}
      selectedRows={selected.map((c) => byCode.get(c)!)}
      pendingCodes={new Set(['A-003'])}
      facOf={(r) => r.fac}
      onAdd={(codes) => setSelected((s) => [...s, ...codes])}
      onRemove={(code) => setSelected((s) => s.filter((c) => c !== code))}
      onClear={() => setSelected([])}
      onNext={onNext}
    />
  )
}

afterEach(cleanup)

const input = () => screen.getByRole('combobox', { name: 'Chọn máy' }) as HTMLInputElement
const open = () => fireEvent.mouseDown(input())
const type = (v: string) => fireEvent.change(input(), { target: { value: v } })
const picked = () => screen.queryAllByTestId(/^name-/)
const toggle = (group: string) => fireEvent.click(document.querySelector(`[data-group="${group}"]`)!)
const optionCodes = () => screen.queryAllByRole('option').map((o) => o.querySelector('strong')?.textContent)

describe('MachinePicker', () => {
  it('"next" signals: never on a pick (focus stays), on Esc and on Enter in the empty input', () => {
    const onNext = vi.fn()
    render(<Harness onNext={onNext} />)
    input().focus()
    open()
    type('A-001')
    fireEvent.click(screen.getByRole('option', { name: /A-001/ }))
    expect(onNext).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(input())
    fireEvent.keyDown(input(), { key: 'Escape' })
    expect(onNext).toHaveBeenCalledTimes(1)
    type('')
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(onNext).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp: Chọn vị trí đích →' }))
    expect(onNext).toHaveBeenCalledTimes(3)
  })

  it('building chips show eligible counts and filter the options', () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: 'Tất cả (4)' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Toà C (0)' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Toà B (1)' }))
    open()
    expect(optionCodes()).toEqual([]) // groups start collapsed
    toggle('Toà B · B1-1')
    expect(optionCodes()).toEqual(['B-001'])
    expect(screen.getByTestId('picker-count').textContent).toBe('Hiển thị 1 / 1 máy')
    fireEvent.click(screen.getByRole('button', { name: 'Toà A (3)' }))
    toggle('Toà A · A1-1')
    toggle('Toà A · A2-3')
    expect(optionCodes()).toEqual(['A-005', 'A-001', 'A-002'])
  })

  it('"Chọn cả zone" adds only eligible machines of the filtered group, then toggles to "Bỏ cả zone"', () => {
    render(<Harness />)
    open()
    const header = screen.getByText('Toà A · A2-3 (2)').closest('[data-group]') as HTMLElement
    fireEvent.click(within(header).getByRole('button', { name: 'Chọn cả zone' }))
    expect(picked()).toHaveLength(2)
    expect(screen.getByTestId('added-note').textContent).toContain('Đã thêm 2 máy')
    expect(screen.queryByTestId('name-A-003')).toBeNull()
    expect(screen.queryByTestId('name-A-004')).toBeNull()
    fireEvent.click(within(header).getByRole('button', { name: 'Bỏ cả zone' }))
    expect(picked()).toHaveLength(0)
  })

  it('search matches all words (AND), ignoring case and accents, and highlights matches', () => {
    render(<Harness />)
    open()
    type('may TIEN')
    expect(optionCodes()).toEqual(['A-001', 'B-001'])
    type('tien a2-3')
    expect(optionCodes()).toEqual(['A-001'])
    expect(screen.getByTestId('picker-count').textContent).toBe('Hiển thị 1 / 4 máy')
    expect([...screen.getByRole('option').querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['tiện'])
  })

  it('stays open and keeps the typed text after picking; clicking a group header collapses it', () => {
    render(<Harness />)
    open()
    type('máy')
    fireEvent.click(screen.getAllByRole('option')[0])
    expect(screen.getByRole('listbox')).toBeTruthy()
    expect(input().value).toBe('máy')
    expect(picked()).toHaveLength(1)
    expect(screen.getAllByRole('option')[0].getAttribute('aria-selected')).toBe('true')

    // During a search a header click collapses its group.
    toggle('Toà A · A1-1')
    expect(optionCodes()).not.toContain('A-005')
    expect(optionCodes()).toContain('A-001')
  })

  it('collapsed groups render only their header; an open/closed choice by the user is kept', () => {
    render(<Harness />)
    open()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect([...document.querySelectorAll('[data-group]')].map((h) => h.textContent?.replace(/Chọn cả zone$/, ''))).toEqual(['Toà A · A1-1 (1)', 'Toà A · A2-3 (2)', 'Toà B · B1-1 (1)'])
    toggle('Toà A · A2-3')
    expect(optionCodes()).toEqual(['A-001', 'A-002'])
    type('khoan')
    type('')
    expect(optionCodes()).toEqual(['A-001', 'A-002']) // still open after the search is cleared
    toggle('Toà A · A2-3')
    expect(optionCodes()).toEqual([])
  })

  it('searching opens every group with results', () => {
    render(<Harness />)
    open()
    type('tien')
    expect(optionCodes()).toEqual(['A-001', 'B-001'])
    expect(document.querySelector('[data-group="Toà A · A2-3"]')?.getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelector('[data-group="Toà A · A1-1"]')).toBeNull()
  })

  it('an open group shows 30 rows, then "Xem thêm N máy" adds more', () => {
    const many = Array.from({ length: 45 }, (_, i) => row(`Z-${String(i).padStart(3, '0')}`, `Máy ${i}`, 'Fac_C', 'C1-1'))
    function Big() {
      const [selected, setSelected] = useState<string[]>([])
      const byCode = useMemo(() => new Map(many.map((r) => [r.code, r])), [])
      return <MachinePicker lang="vi" rows={many} byCode={byCode} selected={selected} selectedRows={selected.map((c) => byCode.get(c)!)} pendingCodes={new Set()} facOf={(r) => r.fac} onAdd={(c) => setSelected((s) => [...s, ...c])} onRemove={() => {}} onClear={() => {}} />
    }
    render(<Big />)
    open()
    toggle('Toà C · C1-1')
    expect(screen.getAllByRole('option')).toHaveLength(30)
    fireEvent.click(screen.getByRole('button', { name: 'Xem thêm 15 máy' }))
    expect(screen.getAllByRole('option')).toHaveLength(45)
    expect(screen.queryByRole('button', { name: /Xem thêm/ })).toBeNull()
    // "Chọn cả zone" still covers every row of the group, not just the rendered ones.
    fireEvent.click(screen.getByRole('button', { name: 'Chọn cả zone' }))
    expect(picked()).toHaveLength(45)
  })
})
