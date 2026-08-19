import { describe, it, expect } from 'vitest'
import { formatCountUpValue, easeOutCubic } from './CountUp'

describe('formatCountUpValue', () => {
  it('formats thousands with K suffix', () => {
    expect(formatCountUpValue(63800, 0, 1)).toBe('$0')
    expect(formatCountUpValue(63800, 0.5, 1)).toBe('$32K')
    expect(formatCountUpValue(63800, 1, 1)).toBe('$64K')
  })
  it('formats millions with M suffix', () => {
    expect(formatCountUpValue(2_500_000, 1, 1)).toBe('$2.5M')
  })
  it('rounds to step precision to avoid flicker', () => {
    expect(formatCountUpValue(100, 0.123, 1)).toBe('$12')
  })
})

describe('easeOutCubic', () => {
  it('is monotonic 0→1', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBeCloseTo(1)
    expect(easeOutCubic(0.5)).toBeGreaterThan(easeOutCubic(0.4))
    expect(easeOutCubic(0.5)).toBeLessThan(1)
  })
})
