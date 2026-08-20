/** @vitest-environment happy-dom */
import React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReportsTable } from '../ReportsTable'
import { FilterChips } from '../FilterChips'

beforeEach(() => { cleanup() })
afterEach(() => { cleanup() })

const ROWS: any[] = [
  { id: 'r1', username: 'fitcoach', niche: 'Fitness', followers: 48200,
    valueRange: '$63.8K–$86.3K', tier: 'Premium', tierVariant: 'tier-premium',
    dateLabel: 'Today · 09:12', kindLabel: 'Paid · 1 credit used', paid: true,
    delta: { pct: 8.2, label: 'vs last' }, shareHref: '/share/r1', pdfAvailable: true,
  },
  { id: 'r2', username: 'foodie_jane', niche: 'Food', followers: 8100,
    valueRange: '$4.2K–$9.8K', tier: 'Developing', tierVariant: 'tier-developing',
    dateLabel: 'Yesterday', kindLabel: 'Free · 0 credits', paid: false, teaserOnly: true,
  },
]

describe('ReportsTable', () => {
  it('renders 2 rows with both @fitcoach and @foodie_jane present; Unlock button present (teaser row); 2 "Open" links present', () => {
    render(<ReportsTable rows={ROWS} />)
    expect(screen.getByText('@fitcoach')).toBeTruthy()
    expect(screen.getByText('@foodie_jane')).toBeTruthy()
    expect(screen.getByText(/Unlock/)).toBeTruthy()
    expect(screen.getAllByText('Open')).toHaveLength(2)
  })
})

describe('FilterChips', () => {
  it('click "Paid" chip -> onChange callback receives "paid"', () => {
    const fn = vi.fn()
    render(<FilterChips chips={[{value:'all',label:'All'},{value:'paid',label:'Paid'}]} value="all" onChange={fn} />)
    fireEvent.click(screen.getByText('Paid'))
    expect(fn).toHaveBeenCalledWith('paid')
  })
})
