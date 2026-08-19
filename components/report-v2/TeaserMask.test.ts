import { describe, it, expect } from 'vitest'
import { shouldMaskSection } from './TeaserMask'

describe('shouldMaskSection', () => {
  it('masks free tier with data', () => expect(shouldMaskSection(false, true)).toBe(true))
  it('never masks premium', () => expect(shouldMaskSection(true, true)).toBe(false))
  it('hides section entirely when no data', () => expect(shouldMaskSection(false, false)).toBe(false))
})
