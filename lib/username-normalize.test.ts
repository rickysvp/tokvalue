// lib/username-normalize.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeForGrantKey } from './username-normalize'

describe('normalizeForGrantKey', () => {
  it('strips leading @, lowercases, trims', () => {
    expect(normalizeForGrantKey('  @John.Doe  ')).toBe('johndoe')
  })

  it('removes dots, underscores and hyphens (variant abuse)', () => {
    expect(normalizeForGrantKey('john.doe')).toBe('johndoe')
    expect(normalizeForGrantKey('john_doe')).toBe('johndoe')
    expect(normalizeForGrantKey('john-doe')).toBe('johndoe')
    expect(normalizeForGrantKey('John.Doe_99-x')).toBe('johndoe99x')
  })

  it('preserves letters and digits including unicode', () => {
    expect(normalizeForGrantKey('张三123')).toBe('张三123')
  })

  it('collapses the same account expressed differently to one key', () => {
    const a = normalizeForGrantKey('@John.Doe')
    const b = normalizeForGrantKey('john_doe')
    const c = normalizeForGrantKey('JOHN-doe')
    expect(a).toBe(b)
    expect(b).toBe(c)
  })

  it('handles empty and garbage input safely', () => {
    expect(normalizeForGrantKey('')).toBe('')
    expect(normalizeForGrantKey('...___---')).toBe('')
    expect(normalizeForGrantKey('@@@')).toBe('')
  })
})
