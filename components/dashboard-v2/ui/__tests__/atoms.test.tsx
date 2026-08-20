/** @vitest-environment happy-dom */
import React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Pill } from '../Pill'
import { Checkbox } from '../Checkbox'
import { KpiCard } from '../KpiCard'
import { TaskRow } from '../TaskRow'

beforeEach(() => { cleanup() })
afterEach(() => { cleanup() })

describe('Pill', () => {
  it('renders p0 with danger red classes', () => {
    render(<Pill variant="p0">P0</Pill>)
    const el = screen.getByText('P0')
    expect(el.className).toMatch(/dc2626/)
  })
  it('renders p1 with blue classes', () => {
    render(<Pill variant="p1">P1</Pill>)
    expect(screen.getByText('P1').className).toMatch(/1d4ed8/)
  })
  it('renders tier premium with emerald classes', () => {
    render(<Pill variant="tier-premium">Premium</Pill>)
    expect(screen.getByText('Premium').className).toMatch(/047857/)
  })
  it('renders tier growth with blue classes', () => {
    render(<Pill variant="tier-growth">Growth</Pill>)
    expect(screen.getByText('Growth').className).toMatch(/1d4ed8/)
  })
  it('renders tier developing with amber classes', () => {
    render(<Pill variant="tier-developing">Developing</Pill>)
    expect(screen.getByText('Developing').className).toMatch(/b45309/)
  })
})

describe('Checkbox', () => {
  it('shows hollow circle unchecked', () => {
    render(<Checkbox checked={false} />)
    const input = screen.getByRole('checkbox', { hidden: true }) as HTMLInputElement
    expect(input.checked).toBe(false)
  })
  it('shows green check when completed', () => {
    const { container } = render(<Checkbox checked={true} />)
    expect(container.firstChild?.textContent).toContain('✓')
  })
  it('calls onChange on click', () => {
    const fn = vi.fn()
    render(<Checkbox checked={false} onChange={fn} />)
    const input = screen.getByRole('checkbox', { hidden: true })
    fireEvent.click(input)
    expect(fn).toHaveBeenCalledWith(true)
  })
})

describe('KpiCard', () => {
  it('renders uppercase title, numeric with tabular-nums, delta positive green', () => {
    render(<KpiCard
      title="Account Value"
      value="$75.1K"
      delta="+8.2%"
      deltaLabel="vs Aug 5"
    />)
    expect(screen.getByText('ACCOUNT VALUE')).toBeTruthy()
    const val = screen.getByText('$75.1K')
    expect(val.className).toMatch(/tabular-nums/)
    expect(screen.getByText('▲ +8.2%').className).toMatch(/047857/)
  })
  it('hides delta row if no delta', () => {
    const { container } = render(<KpiCard title="Account Value" value="$75.1K" />)
    expect(container.textContent).not.toMatch(/vs/)
  })
})

describe('TaskRow', () => {
  it('renders checkbox + title + subtext + pill', () => {
    render(<TaskRow
      title="Post weekly video"
      subtext="Pillar 1 · Consistency"
      priority="p0"
      checked={false}
    />)
    expect(screen.getByText('Post weekly video')).toBeTruthy()
    expect(screen.getByText('P0')).toBeTruthy()
    expect(screen.getByText(/Pillar 1/)).toBeTruthy()
  })
  it('crosses out + opacity when checked', () => {
    const { container } = render(<TaskRow
      title="Done" subtext="done" priority="p1" checked={true}
    />)
    expect(container.querySelector('[style*="line-through"]')).toBeTruthy()
  })
})
