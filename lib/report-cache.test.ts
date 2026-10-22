import { describe, expect, it } from 'vitest'
import { isReusablePaidReport, REPORT_CACHE_HOURS } from './report-cache'

const now = Date.parse('2026-10-22T12:00:00Z')

describe('7-day paid report reuse', () => {
  it('reuses a successful partial report without requiring another upstream request', () => {
    expect(isReusablePaidReport({ computedAt: new Date(now - 6 * 24 * 3600_000).toISOString(), isFree: false, dataQuality: 'partial' }, now)).toBe(true)
    expect(REPORT_CACHE_HOURS).toBe(7 * 24)
  })

  it('rejects free, expired, future, and invalid reports', () => {
    const recent = new Date(now - 1000).toISOString()
    expect(isReusablePaidReport({ computedAt: recent, isFree: true }, now)).toBe(false)
    expect(isReusablePaidReport({ computedAt: new Date(now - 7 * 24 * 3600_000).toISOString(), isFree: false }, now)).toBe(false)
    expect(isReusablePaidReport({ computedAt: new Date(now + 1000).toISOString(), isFree: false }, now)).toBe(false)
    expect(isReusablePaidReport({ computedAt: 'invalid', isFree: false }, now)).toBe(false)
  })
})
