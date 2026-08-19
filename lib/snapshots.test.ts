// lib/snapshots.test.ts
import { describe, it, expect } from 'vitest'
import { snapshotAgeHours, isSnapshotFresh, SNAPSHOT_TTL_HOURS } from './snapshots'

describe('snapshotAgeHours', () => {
  it('computes hours since fetch', () => {
    const now = Date.now()
    expect(snapshotAgeHours(new Date(now - 2 * 3600_000), now)).toBeCloseTo(2)
  })
  it('invalid date → Infinity (treated stale)', () => {
    expect(snapshotAgeHours('garbage')).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('isSnapshotFresh', () => {
  it('fresh within TTL', () => {
    expect(isSnapshotFresh(0)).toBe(true)
    expect(isSnapshotFresh(SNAPSHOT_TTL_HOURS - 0.01)).toBe(true)
  })
  it('stale at/after TTL, negative or infinite', () => {
    expect(isSnapshotFresh(SNAPSHOT_TTL_HOURS)).toBe(false)
    expect(isSnapshotFresh(48)).toBe(false)
    expect(isSnapshotFresh(-1)).toBe(false)
    expect(isSnapshotFresh(Number.POSITIVE_INFINITY)).toBe(false)
  })
})
