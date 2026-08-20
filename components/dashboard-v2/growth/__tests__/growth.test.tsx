/** @vitest-environment happy-dom */
import React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ProgressHeader } from '../ProgressHeader'
import { WeekAccordion } from '../WeekAccordion'

beforeEach(() => { cleanup() })
afterEach(() => { cleanup() })

describe('ProgressHeader', () => {
  it('renders "3 / 14 done · 21%" + [data-bar-fill] element width exactly "21%"', () => {
    const { container } = render(<ProgressHeader completed={3} total={14} />)
    expect(screen.getByText('3 / 14 done · 21%')).toBeTruthy()
    const bar = container.querySelector('[data-bar-fill]') as HTMLElement
    expect(bar).toBeTruthy()
    expect(bar.style.width).toBe('21%')
  })
})

describe('WeekAccordion', () => {
  it('defaultOpen=true -> task T visible in body; click header collapses it -> T disappears from DOM', () => {
    const tasks = [
      { id: 'T', title: 'Task T', priority: 'p0' as const },
    ]
    const completed = new Set<string>()
    render(
      <WeekAccordion
        weekNo={1}
        focus="Week focus"
        tasks={tasks}
        completed={completed}
        defaultOpen={true}
      />
    )
    expect(screen.getByText('Task T')).toBeTruthy()
    const header = screen.getByRole('button')
    fireEvent.click(header)
    expect(screen.queryByText('Task T')).toBeNull()
  })
})
