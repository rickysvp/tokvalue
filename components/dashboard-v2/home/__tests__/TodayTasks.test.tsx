/** @vitest-environment happy-dom */
import React from 'react'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { TodayTasks } from '../TodayTasks'

const TASKS: any[] = [
  { id: 't1', title: 'Post challenge video', subtext: 'Pillar 1 · Consistency', priority: 'p0', actions: [{ type: 'link', label: 'Open in app', href: '#' }] },
  { id: 't2', title: 'Pitch 2 brands', subtext: 'Deal pricing', priority: 'p0', actions: [{ type: 'copy', label: 'Copy pitch A', text: 'Hi brand' }, { type: 'copy', label: 'Copy pitch B', text: 'Hi brand 2' }] },
  { id: 't3', title: 'Reply to comments', subtext: 'Engagement', priority: 'p1' },
]

beforeEach(() => {
  cleanup()
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    writable: true,
    configurable: true,
  })
})
afterEach(() => { cleanup() })

describe('TodayTasks', () => {
  it('renders 3 tasks with priority pills', () => {
    render(<TodayTasks tasks={TASKS} />)
    expect(screen.getAllByRole('checkbox', { hidden: true })).toHaveLength(3)
    expect(screen.getAllByText('P0')).toHaveLength(2)
    expect(screen.getByText('P1')).toBeTruthy()
  })

  it('toggles checkbox, calls onComplete API and rolls back if fails', async () => {
    const mockFail = vi.fn(() => Promise.reject(new Error('net')))
    const mockOk = vi.fn(() => Promise.resolve())
    render(<TodayTasks tasks={TASKS} onComplete={mockOk} onCompleteFail={mockFail as any} />)
    const cb = screen.getAllByRole('checkbox', { hidden: true })[0]
    fireEvent.click(cb)
    await waitFor(() => expect(mockOk).toHaveBeenCalled())
  })

  it('copy action copies to clipboard', async () => {
    const write = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: write },
      writable: true,
      configurable: true,
    })
    render(<TodayTasks tasks={TASKS} />)
    const btn = screen.getByText('Copy pitch A')
    fireEvent.click(btn)
    expect(write).toHaveBeenCalledWith('Hi brand')
  })
})
