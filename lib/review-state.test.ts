// lib/review-state.test.ts
import { describe, it, expect } from 'vitest'
import {
  REVIEW_STATUSES, ACTIVE_REVIEW_STATUSES, canTransition, isTerminalReview,
  isStaleReview, REVIEW_TTL_MS, type ReviewStatus,
} from './review-state'

describe('canTransition', () => {
  it('allows the happy-path chain', () => {
    expect(canTransition('requested', 'quota_reserved')).toBe(true)
    expect(canTransition('quota_reserved', 'fetching_data')).toBe(true)
    expect(canTransition('fetching_data', 'data_saved')).toBe(true)
    expect(canTransition('data_saved', 'analyzing')).toBe(true)
    expect(canTransition('analyzing', 'report_generating')).toBe(true)
    expect(canTransition('report_generating', 'completed')).toBe(true)
  })

  it('allows any active state to fail', () => {
    for (const s of ACTIVE_REVIEW_STATUSES) {
      expect(canTransition(s, 'failed')).toBe(true)
    }
  })

  it('rejects skips and backwards transitions', () => {
    expect(canTransition('requested', 'fetching_data')).toBe(false)
    expect(canTransition('fetching_data', 'completed')).toBe(false)
    expect(canTransition('analyzing', 'fetching_data')).toBe(false)
  })

  it('rejects transitions out of terminal states', () => {
    expect(canTransition('completed', 'failed')).toBe(false)
    expect(canTransition('failed', 'requested')).toBe(false)
    expect(canTransition('completed', 'completed')).toBe(false)
  })
})

describe('isStaleReview', () => {
  const TTL = REVIEW_TTL_MS.fetching_data! // 90s
  it('marks active review stale when now - entered > TTL', () => {
    const entered = new Date(Date.now() - TTL - 1000)
    expect(isStaleReview('fetching_data', entered)).toBe(true)
  })
  it('not stale within TTL', () => {
    const entered = new Date(Date.now() - TTL + 5000)
    expect(isStaleReview('fetching_data', entered)).toBe(false)
  })
  it('terminal states are never stale', () => {
    expect(isStaleReview('completed', new Date(0))).toBe(false)
    expect(isStaleReview('failed', new Date(0))).toBe(false)
  })
  it('accepts ISO string and epoch ms inputs', () => {
    const iso = new Date(Date.now() - TTL - 1).toISOString()
    expect(isStaleReview('fetching_data', iso)).toBe(true)
    expect(isStaleReview('fetching_data', Date.now() - TTL - 1)).toBe(true)
  })
  it('every active status has a TTL defined', () => {
    for (const s of ACTIVE_REVIEW_STATUSES) {
      expect(REVIEW_TTL_MS[s], `missing TTL for ${s}`).toBeTruthy()
    }
  })
})

describe('status types', () => {
  it('REVIEW_STATUSES covers 8 statuses', () => {
    expect(REVIEW_STATUSES).toHaveLength(8)
    expect(isTerminalReview('completed' as ReviewStatus)).toBe(true)
  })
})
