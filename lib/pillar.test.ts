import { describe, it, expect } from 'vitest'
import {
  pillarStatusOf, riskScoreOf, riskDiscountPct, nicheClarityOf, buildPillars,
  confidenceBandOf, rangeWidthForConfidence, valuationRangeOf, valueTierOf,
} from './pillar'
import type { DimensionScores, Metrics, Post, RiskFlag } from '../types'

const dims = (over: Partial<DimensionScores> = {}): DimensionScores => ({
  reach: 60, engagement: 55, content: 65, authenticity: 70, momentum: 50,
  stability: 45, commerce: 40, monetization: 35, health: 80, influence: 60,
  ...over,
})

const metrics = {
  engagementRate: 4.2, playGrowth: 12, cvPlays: 0.6, effectiveAvgPlays: 50000,
} as unknown as Metrics

const posts = (descs: string[]): Post[] =>
  descs.map((desc, i) => ({ id: String(i), playCount: 1000, likeCount: 10, commentCount: 1, shareCount: 1, createTime: 1700000000 + i * 86400, desc }))

const risks = (levels: ('high' | 'medium' | 'low')[]): RiskFlag[] =>
  levels.map((level, i) => ({ level, label: `risk-${i}`, detail: 'd' }))

describe('pillarStatusOf', () => {
  it('Strong >= 70, On track >= 45, Needs attention < 45', () => {
    expect(pillarStatusOf(85)).toBe('Strong')
    expect(pillarStatusOf(70)).toBe('Strong')
    expect(pillarStatusOf(69)).toBe('On track')
    expect(pillarStatusOf(45)).toBe('On track')
    expect(pillarStatusOf(44)).toBe('Needs attention')
  })
})

describe('riskScoreOf / riskDiscountPct (Spec 7.4)', () => {
  it('aggregates flag levels into 0-100 risk score', () => {
    expect(riskScoreOf(risks(['high']))).toBe(30)
    expect(riskScoreOf(risks(['medium']))).toBe(15)
    expect(riskScoreOf(risks(['low']))).toBe(6)
    expect(riskScoreOf([])).toBe(0)
  })
  it('clamps at 100', () => {
    expect(riskScoreOf(risks(['high', 'high', 'high', 'high']))).toBe(100)
  })
  it('discount = min(40%, score × 0.75%)', () => {
    expect(riskDiscountPct(24)).toBeCloseTo(18)   // Spec example: −18% (Risk Score: 24)
    expect(riskDiscountPct(100)).toBe(40)          // cap
    expect(riskDiscountPct(0)).toBe(0)
  })
})

describe('nicheClarityOf (hashtag clustering, no LLM)', () => {
  it('concentrated hashtags score high', () => {
    const p = posts(['#comedy #funny', '#comedy', '#comedy #joke', '#comedy #funny', '#funny'])
    const r = nicheClarityOf(p)
    expect(r.score).toBeGreaterThanOrEqual(70)
    expect(r.topTags.length).toBeGreaterThan(0)
  })
  it('scattered hashtags score low', () => {
    const p = posts(['#a', '#b', '#c', '#d', '#e', '#f', '#g', '#h'])
    expect(nicheClarityOf(p).score).toBeLessThan(50)
  })
  it('no hashtags → mid-low score with unclear flag', () => {
    const r = nicheClarityOf(posts(['no tags', 'plain text']))
    expect(r.score).toBeLessThanOrEqual(45)
    expect(r.unclear).toBe(true)
  })
  it('empty posts → unclear', () => {
    expect(nicheClarityOf([]).unclear).toBe(true)
  })
})

describe('buildPillars (Spec 7.1 mapping)', () => {
  it('produces 6 pillars with score + status + non-empty attribution', () => {
    const ps = buildPillars({ dims: dims(), metrics, posts: posts(['#comedy', '#comedy', '#comedy']), risks: risks(['medium']) })
    expect(ps.pillars).toHaveLength(6)
    for (const p of ps.pillars) {
      expect(p.score).toBeGreaterThanOrEqual(0)
      expect(p.score).toBeLessThanOrEqual(100)
      expect(['Strong', 'On track', 'Needs attention']).toContain(p.status)
      expect(p.attribution.length).toBeGreaterThan(10)
    }
  })
  it('Growth Momentum follows momentum dim', () => {
    const ps = buildPillars({ dims: dims({ momentum: 90 }), metrics, posts: [], risks: [] })
    const gm = ps.pillars.find(p => p.key === 'growth_momentum')!
    expect(gm.score).toBe(90)
  })
  it('Audience Quality = mean(engagement, authenticity)', () => {
    const ps = buildPillars({ dims: dims({ engagement: 60, authenticity: 80 }), metrics, posts: [], risks: [] })
    expect(ps.pillars.find(p => p.key === 'audience_quality')!.score).toBe(70)
  })
  it('Brand Readiness = 0.4 commerce + 0.3 monetization + 0.3 influence', () => {
    const ps = buildPillars({ dims: dims({ commerce: 50, monetization: 50, influence: 80 }), metrics, posts: [], risks: [] })
    expect(ps.pillars.find(p => p.key === 'brand_readiness')!.score).toBe(59)
  })
  it('Risk pillar score = riskScoreOf, status inverted (low risk = Strong)', () => {
    const ps = buildPillars({ dims: dims(), metrics, posts: [], risks: risks(['high', 'high']) })
    const risk = ps.pillars.find(p => p.key === 'risk')!
    expect(risk.score).toBe(60)
    expect(risk.status).toBe('Needs attention')
  })
})

describe('confidenceBandOf + rangeWidthForConfidence (Spec 7.4)', () => {
  it('low confidence range is visibly wider than high', () => {
    const hi = confidenceBandOf({ videoCount: 30, dataQuality: 'full' })
    const lo = confidenceBandOf({ videoCount: 3, dataQuality: 'partial' })
    expect(hi.band).toBe('medium_high')
    expect(lo.band).toBe('low')
    const width = (band: Parameters<typeof valuationRangeOf>[1]) => {
      const r = valuationRangeOf(1000, band)
      return r.high - r.low
    }
    expect(width(lo.band)).toBeGreaterThan(width(hi.band) * 1.5)
  })
  it('widths are exactly ±15/20/25/30%', () => {
    expect(rangeWidthForConfidence('medium_high')).toBe(0.15)
    expect(rangeWidthForConfidence('medium')).toBe(0.20)
    expect(rangeWidthForConfidence('medium_low')).toBe(0.25)
    expect(rangeWidthForConfidence('low')).toBe(0.30)
  })
  it('range is symmetric around mid', () => {
    const r = valuationRangeOf(10000, 'medium')
    expect(r.low).toBe(8000)
    expect(r.high).toBe(12000)
  })
})

describe('valueTierOf (Spec 7.2)', () => {
  it('maps S/A→Premium, B/C→Growth, D/E→Developing, F→Early', () => {
    expect(valueTierOf('S')).toBe('Premium Value')
    expect(valueTierOf('A')).toBe('Premium Value')
    expect(valueTierOf('B')).toBe('Growth Value')
    expect(valueTierOf('C')).toBe('Growth Value')
    expect(valueTierOf('D')).toBe('Developing Value')
    expect(valueTierOf('E')).toBe('Developing Value')
    expect(valueTierOf('F')).toBe('Early Value')
  })
})
