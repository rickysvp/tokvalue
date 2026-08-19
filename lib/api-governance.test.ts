// lib/api-governance.test.ts
import { describe, it, expect } from 'vitest'
import { isOverBudget, nextCooldownMs, BREAKER_FAILURE_THRESHOLD, todayKey, monthStartKey } from './api-governance'

describe('isOverBudget', () => {
  const cfg = { dailyUsd: 10, monthlyUsd: 150 }
  it('allows when both under budget', () => {
    expect(isOverBudget(9.99, 149, cfg)).toBe(false)
  })
  it('pauses when daily cost reaches budget (触达即暂停)', () => {
    expect(isOverBudget(10, 0, cfg)).toBe(true)
  })
  it('pauses when monthly cost reaches budget', () => {
    expect(isOverBudget(0, 150, cfg)).toBe(true)
  })
  it('zero-cost day never paused', () => {
    expect(isOverBudget(0, 0, cfg)).toBe(false)
  })
})

describe('nextCooldownMs', () => {
  it('base cooldown 5 minutes at threshold', () => {
    expect(nextCooldownMs(BREAKER_FAILURE_THRESHOLD)).toBe(5 * 60_000)
  })
  it('doubles per extra failure', () => {
    expect(nextCooldownMs(BREAKER_FAILURE_THRESHOLD + 1)).toBe(10 * 60_000)
    expect(nextCooldownMs(BREAKER_FAILURE_THRESHOLD + 2)).toBe(20 * 60_000)
  })
  it('capped at 30 minutes', () => {
    expect(nextCooldownMs(BREAKER_FAILURE_THRESHOLD + 5)).toBe(30 * 60_000)
  })
  it('below threshold returns base (not used for opening, defensive)', () => {
    expect(nextCooldownMs(1)).toBe(5 * 60_000)
  })
})

describe('date keys', () => {
  it('todayKey is YYYY-MM-DD (UTC)', () => {
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
  it('monthStartKey is YYYY-MM-01 (UTC)', () => {
    expect(monthStartKey()).toMatch(/^\d{4}-\d{2}-01$/)
  })
})
