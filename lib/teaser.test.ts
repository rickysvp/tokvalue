// lib/teaser.test.ts
import { describe, it, expect } from 'vitest'
import { stripForTeaser, topPostsByPlays } from './teaser'
import type { Evaluation, Post } from '../types'

const post = (id: string, playCount: number): Post => ({
  id, playCount, likeCount: 10, commentCount: 1, shareCount: 1,
  createTime: 1700000000, desc: `video ${id}`,
})

const baseEvaluation = {
  username: 'demo', nickname: 'Demo', score: 72, tier: 'B',
  followerCount: 10000, followingCount: 100, totalLikes: 500000, videoCount: 40,
  region: 'US', verified: false,
  summary: { headline: 'x' }, verdict: 'v', advice: 'a', priceAdvice: 'p',
  metrics: { engagementRate: 1, avgPlays: 2, playGrowth: 3 },
  riskFlags: [
    { level: 'low', label: 'minor', detail: 'd' },
    { level: 'high', label: 'serious', detail: 'd2' },
  ],
  accountProfile: { categories: ['Beauty'], personaType: 'p', postingRhythm: 'r' },
  businessValue: {
    totalValue: { low: 18400, mid: 22000, high: 26700 },
    components: [{ label: 'Brand Deal Potential', icon: 'i', amount: { low: 1, mid: 2, high: 3 }, percentage: 40, detail: 'd' }],
    summary: 's',
  },
  commercialSnapshot: {
    readinessScore: 66,
    readinessBand: 'Growth Value',
    positioning: 'pos',
    suggestedRateRange: { low: 1, mid: 2, high: 3 },
    strongestLever: { label: 'l', detail: 'd' },
    primaryRateBlocker: { label: 'blocker', detail: 'why', impact: 'i' },
    nextMove: { title: 't', detail: 'd', effortHours: 1 },
    dataConfidence: 'medium',
  },
  peerBenchmark: { percentile: 50 },
  posts: [post('a', 100), post('b', 500), post('c', 300), post('d', 50), post('e', 400)],
  computedAt: '2026-08-19T00:00:00Z',
} as unknown as Evaluation

describe('topPostsByPlays', () => {
  it('returns top N posts sorted by playCount desc', () => {
    expect(topPostsByPlays(baseEvaluation.posts, 3).map(p => p.id)).toEqual(['b', 'e', 'c'])
  })
  it('handles undefined posts', () => {
    expect(topPostsByPlays(undefined, 3)).toEqual([])
  })
})

describe('stripForTeaser', () => {
  const t = stripForTeaser(baseEvaluation)

  it('marks teaser access level', () => {
    expect(t.isFree).toBe(true)
    expect(t.access_level).toBe('teaser')
  })

  it('keeps basic public account info', () => {
    expect(t.username).toBe('demo')
    expect(t.followerCount).toBe(10000)
    expect(t.accountProfile).toBeDefined()
    expect(t.computedAt).toBeDefined()
  })

  it('keeps score + tier (header gauge) and top3 posts', () => {
    expect(t.score).toBe(72)
    expect(t.tier).toBe('B')
    expect(t.posts).toHaveLength(3)
    expect(t.posts![0].id).toBe('b')
  })

  it('keeps value RANGE but strips components/summary', () => {
    const bv = t.businessValue as unknown as Record<string, unknown>
    expect(bv?.totalValue).toEqual({ low: 18400, mid: 22000, high: 26700 })
    expect(bv?.components).toBeUndefined()
    expect(bv?.summary).toBeUndefined()
  })

  it('legacy report without valuationV2 keeps original range untouched', () => {
    // baseEvaluation has no valuationV2（旧缓存报告）→ 原样透传
    expect((t.businessValue as { totalValue: { low: number } })?.totalValue.low).toBe(18400)
  })

  it('keeps commercialSnapshot SUBSET (band/confidence/blocker only)', () => {
    const c = t.commercialSnapshot as unknown as Record<string, unknown>
    expect(c.readinessBand).toBe('Growth Value')
    expect(c.dataConfidence).toBe('medium')
    expect(c.primaryRateBlocker).toBeDefined()
    expect(c.readinessScore).toBeUndefined()
    expect(c.positioning).toBeUndefined()
    expect(c.suggestedRateRange).toBeUndefined()
    expect(c.strongestLever).toBeUndefined()
    expect(c.nextMove).toBeUndefined()
  })

  it('keeps exactly ONE risk flag (the primary blocker)', () => {
    expect(t.riskFlags).toHaveLength(1)
    expect(t.riskFlags![0].level).toBe('high')
  })

  it('strips locked analysis fields entirely', () => {
    const locked = t as unknown as Record<string, unknown>
    for (const key of ['dimensions', 'metrics', 'peerBenchmark', 'summary', 'verdict', 'advice', 'priceAdvice']) {
      expect(locked[key]).toBeUndefined()
    }
  })
})

describe('stripForTeaser valuation v2 range (Spec §7.3 band width)', () => {
  const withBand = (band: 'medium_high' | 'medium' | 'medium_low' | 'low') =>
    stripForTeaser({
      ...baseEvaluation,
      valuationV2: { band, riskScore: 10, riskDiscountPct: 8, range: { low: 1, mid: 22000, high: 999999 } },
    } as Evaluation)

  it('recomputes low/high from mid by band width (low confidence ±30%)', () => {
    const total = withBand('low').businessValue!.totalValue
    expect(total).toEqual({ low: 15400, mid: 22000, high: 28600 })
  })

  it('low-confidence range is visibly wider than medium_high', () => {
    const lo = withBand('low').businessValue!.totalValue
    const hi = withBand('medium_high').businessValue!.totalValue
    expect(lo.high - lo.low).toBeGreaterThan((hi.high - hi.low) * 1.5)
  })
})
