import { describe, it, expect } from 'vitest'
import {
  validateListingInput, buildSnapshot, shouldAutoRemove, maskUsername,
  UNLOCK_PRICE_USD, REPORT_REMOVE_THRESHOLD,
  type ListingInput,
} from './marketplace'
import type { Evaluation } from '../types'

const baseInput: ListingInput = {
  username: 'test.creator',
  askingPriceUsd: 1500,
  description: 'Growing fitness account',
  contactEmail: 'seller@example.com',
  socialType: 'discord',
  socialHandle: 'seller#1234',
}

describe('validateListingInput', () => {
  it('accepts valid input', () => {
    expect(validateListingInput(baseInput).ok).toBe(true)
  })
  it('accepts email-only input (no social)', () => {
    expect(validateListingInput({ ...baseInput, socialType: null, socialHandle: null }).ok).toBe(true)
  })
  it('rejects price below 1', () => {
    expect(validateListingInput({ ...baseInput, askingPriceUsd: 0 }).ok).toBe(false)
  })
  it('rejects price above 10,000,000', () => {
    expect(validateListingInput({ ...baseInput, askingPriceUsd: 10_000_001 }).ok).toBe(false)
  })
  it('rejects description over 500 chars', () => {
    expect(validateListingInput({ ...baseInput, description: 'x'.repeat(501) }).ok).toBe(false)
  })
  it('rejects invalid email', () => {
    expect(validateListingInput({ ...baseInput, contactEmail: 'not-an-email' }).ok).toBe(false)
  })
  it('rejects unknown socialType', () => {
    expect(validateListingInput({ ...baseInput, socialType: 'wechat' as never }).ok).toBe(false)
  })
  it('rejects socialHandle when socialType set but handle empty', () => {
    expect(validateListingInput({ ...baseInput, socialHandle: '  ' }).ok).toBe(false)
  })
})

describe('buildSnapshot', () => {
  const evalRow = {
    tier: 'A',
    followerCount: 120000,
    computedAt: '2026-10-01T00:00:00.000Z',
    metrics: { engagementRate: 4.2 },
    businessValue: { totalValue: { low: 8000, mid: 12000, high: 18000 } },
  } as unknown as Evaluation

  it('extracts tier/valuation/followers/engagement/evaluatedAt', () => {
    const s = buildSnapshot(evalRow)
    expect(s.snapshotTier).toBe('A')
    expect(s.snapshotValuationLow).toBe(8000)
    expect(s.snapshotValuationHigh).toBe(18000)
    expect(s.snapshotValuationUsd).toBe(12000)
    expect(s.snapshotFollowers).toBe(120000)
    expect(s.snapshotEngagementRate).toBeCloseTo(4.2)
    expect(s.snapshotEvaluatedAt).toBe('2026-10-01T00:00:00.000Z')
  })

  it('tolerates missing businessValue (null snapshot fields)', () => {
    const s = buildSnapshot({ ...evalRow, businessValue: undefined } as unknown as Evaluation)
    expect(s.snapshotValuationUsd).toBeNull()
  })
})

describe('shouldAutoRemove', () => {
  it('false below threshold', () => {
    expect(shouldAutoRemove(REPORT_REMOVE_THRESHOLD - 1)).toBe(false)
  })
  it('true at threshold', () => {
    expect(shouldAutoRemove(REPORT_REMOVE_THRESHOLD)).toBe(true)
  })
})

it('UNLOCK_PRICE_USD is 3.99', () => {
  expect(UNLOCK_PRICE_USD).toBe(3.99)
})

describe('maskUsername', () => {
  it('keeps head and tail for long names', () => {
    expect(maskUsername('fitwithdana')).toBe('fit*****ana')
  })
  it('keeps 1+1 for short names', () => {
    expect(maskUsername('mike')).toBe('m**e')
  })
  it('handles 2-char names', () => {
    expect(maskUsername('ab')).toBe('a*')
  })
  it('masks the dot in usernames containing dots', () => {
    expect(maskUsername('moneymindset.mike')).toBe('mon***********ike')
  })
})
