/** @vitest-environment happy-dom */
import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ProgressStrip } from '../ProgressStrip'
import { PillarScorecard } from '../PillarScorecard'
import { KPIRow } from '../KPIRow'

beforeEach(() => { cleanup() })
afterEach(() => { cleanup() })

describe('ProgressStrip', () => {
  it('returns null when history < 2', () => {
    const { container } = render(<ProgressStrip history={[]} />)
    expect(container.firstChild).toBeNull()
  })
  it('renders 3 nodes when history >=2', () => {
    const hist = [
      { dateLabel: 'Aug 5', valueLabel: '$69.5K', tier: 'Growth Value' },
      { dateLabel: 'Aug 19', valueLabel: '$75.1K', tier: 'Premium Value', isCurrent: true },
    ] as any
    render(<ProgressStrip history={hist} />)
    expect(screen.getByText('Aug 5')).toBeTruthy()
    expect(screen.getByText('Aug 19')).toBeTruthy()
    expect(screen.getByText('Next')).toBeTruthy()
  })
})

describe('PillarScorecard', () => {
  it('renders 6 bars with scores', () => {
    const pillars = [
      { name: 'Growth', score: 86, status: 'strong' },
      { name: 'Consistency', score: 82, status: 'strong' },
      { name: 'Audience Quality', score: 71, status: 'on-track' },
      { name: 'Niche Clarity', score: 78, status: 'on-track' },
      { name: 'Brand Readiness', score: 54, status: 'needs-attention' },
      { name: 'Risk', score: 90, status: 'strong' },
    ] as any
    render(<PillarScorecard pillars={pillars} reportHref="#pillars" username="fitcoach" />)
    expect(screen.getByText('Growth')).toBeTruthy()
    expect(screen.getByText('86')).toBeTruthy()
  })
})

describe('KPIRow', () => {
  it('shows delta only when provided', () => {
    render(<KPIRow value={{ mid: 75100, deltaPct: 8.2, deltaLabel: 'vs Aug 5' }} rank={{ percentile: 74, tierWord: 'Premium Value' }} credits={{ remaining: 6, packLabel: '$29 pack · 1 used' }} date="Aug 19" />)
    expect(screen.getByText('ACCOUNT VALUE')).toBeTruthy()
    expect(screen.getByText(/\$75\.1K/)).toBeTruthy()
    expect(screen.getByText('▲ +8.2%')).toBeTruthy()
    expect(screen.getByText('Top 26%')).toBeTruthy()
    expect(screen.getByText('6')).toBeTruthy()
  })
  it('omits delta when not present', () => {
    const { container } = render(<KPIRow value={{ mid: 75100 }} rank={{ percentile: 74, tierWord: 'Premium Value' }} credits={{ remaining: 6, packLabel: '' }} date="Aug 19" />)
    expect(container.textContent).not.toMatch(/vs/)
  })
})
