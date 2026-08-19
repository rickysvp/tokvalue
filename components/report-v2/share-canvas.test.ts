import { describe, it, expect } from 'vitest'
import { layoutShareCard } from './share-canvas'

describe('layoutShareCard', () => {
  it('returns fixed canvas size and element boxes', () => {
    const l = layoutShareCard()
    expect(l.width).toBe(1200)
    expect(l.height).toBe(630)
    expect(l.username.x).toBeGreaterThan(0)
    expect(l.value.y).toBeGreaterThan(l.username.y)
    expect(l.watermark.y).toBeGreaterThan(l.value.y)
  })
})
