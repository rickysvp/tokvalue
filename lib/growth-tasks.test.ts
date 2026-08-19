import { describe, it, expect } from 'vitest'
import { buildGrowthTasks } from './growth-tasks'
import type {
  BrandPotential, ContentCadence, DimensionScores, Evaluation, Metrics,
  PillarBreakdown, PillarKey, Post, RiskFlag, TaskConfidence,
} from '../types'

const DAY = 86_400_000
const NOW = 1_760_000_000_000 // 固定基准时间，保证 mock 确定性

const PILLAR_NAMES: Record<PillarKey, string> = {
  growth_momentum: 'Growth Momentum',
  content_consistency: 'Content Consistency',
  audience_quality: 'Audience Quality',
  niche_clarity: 'Niche Clarity',
  brand_readiness: 'Brand Readiness',
  risk: 'Risk Score',
}

const pillarScores = (over: Partial<Record<PillarKey, number>> = {}): PillarBreakdown => {
  const base: Record<PillarKey, number> = {
    growth_momentum: 75, content_consistency: 75, audience_quality: 75,
    niche_clarity: 75, brand_readiness: 75, risk: 0,
  }
  const merged = { ...base, ...over }
  return {
    pillars: (Object.keys(merged) as PillarKey[]).map(key => ({
      key, name: PILLAR_NAMES[key], score: merged[key],
      status: 'On track', attribution: 'test fixture',
    })),
  }
}

const makePosts = (n: number, opts: { spanDays?: number; plays?: number; desc?: (i: number) => string } = {}): Post[] => {
  const span = opts.spanDays ?? 30
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    playCount: opts.plays ?? 10_000,
    likeCount: 500, commentCount: 50, shareCount: 20,
    createTime: NOW - Math.round((i * span * DAY) / Math.max(n - 1, 1)),
    desc: opts.desc ? opts.desc(i) : `video ${i} #topic${i % 3}`,
  }))
}

interface MockOpts {
  videoCount?: number
  posts?: Post[]
  pillars?: PillarBreakdown
  dims?: Partial<DimensionScores>
  risks?: RiskFlag[]
  baseline?: boolean
  metrics?: Record<string, number>
  cadence?: Partial<ContentCadence>
  brand?: Partial<BrandPotential>
}

// buildGrowthTasks 只读 evaluation 的这些字段；其余必填字段用 as 断言跳过（同 pillar.test.ts 风格）
const makeEvaluation = (o: MockOpts = {}): Evaluation => ({
  username: 'creator',
  nickname: 'Creator',
  score: 60,
  tier: 'C',
  dimensions: {
    reach: 60, engagement: 60, content: 60, authenticity: 60, momentum: 60,
    stability: 60, commerce: 60, monetization: 60, health: 60, influence: 60,
    ...o.dims,
  },
  metrics: {
    engagementRate: 4.0, daysSinceLastPost: 1,
    effectiveAvgPlays: 10_000, effectivePeakPlays: 30_000,
    ...o.metrics,
  } as unknown as Metrics,
  riskFlags: o.risks ?? [],
  contentCadence: {
    postingRhythm: 'weekly', avgPostsPerDay: 0.3, avgPostsPerWeek: 2,
    bestTimeSlots: [{ hour: 19, engagementRate: 6.1 }],
    bestWeekdays: [{ weekday: 'Tuesday', engagementRate: 6.4 }],
    consistencyScore: 70, cadenceAdvice: '',
    ...o.cadence,
  } as ContentCadence,
  brandPotential: {
    brandScore: 60, estimatedCPM: 18, audienceSpendingPower: 'medium',
    suitableCategories: ['Fitness', 'Nutrition'],
    collaborationTypes: [], brandReasoning: '',
    ...o.brand,
  } as unknown as BrandPotential,
  videoCount: o.videoCount ?? 30,
  posts: o.posts,
  pillars: o.pillars,
  baselineReview: o.baseline,
} as unknown as Evaluation)

// 全弱支柱 + 1 个 high 风险 → 6 条候选全触发（用于验证数量上限截断）
const WEAK = pillarScores({
  niche_clarity: 30, content_consistency: 30, audience_quality: 40,
  growth_momentum: 30, brand_readiness: 40, risk: 30,
})
const HIGH_RISK: RiskFlag[] = [{ level: 'high', label: 'Engagement anomaly', detail: 'sudden spike' }]

const ALL_PILLAR_KEYS: PillarKey[] = [
  'growth_momentum', 'content_consistency', 'audience_quality',
  'niche_clarity', 'brand_readiness', 'risk',
]
const GENERIC_ADVICE_RE = /keep posting|post more|be consistent|engage with your audience|stay active/i
const PROMISE_RE = /guarantee|will get|will earn|will make you/i

describe('buildGrowthTasks — Spec §9 数量表边界', () => {
  const cases: Array<[videoCount: number, expectedCap: number, band: TaskConfidence]> = [
    [4, 1, 'low'],
    [5, 2, 'medium_low'],
    [9, 2, 'medium_low'],
    [10, 3, 'medium'],
    [29, 3, 'medium'],
    [30, 5, 'medium_high'],
  ]
  for (const [vc, cap, band] of cases) {
    it(`videoCount ${vc} → 截断为 ${cap} 条，confidence ${band}`, () => {
      const plan = buildGrowthTasks({
        evaluation: makeEvaluation({
          videoCount: vc,
          posts: makePosts(vc, { spanDays: 30 }),
          pillars: WEAK,
          risks: HIGH_RISK,
        }),
      })
      expect(plan.tasks).toHaveLength(cap)
      for (const t of plan.tasks) expect(t.confidence).toBe(band)
    })
  }
})

describe('降档校验', () => {
  it('posts 时间覆盖 <14 天 → 上限 2 且降一档', () => {
    const plan = buildGrowthTasks({
      evaluation: makeEvaluation({
        videoCount: 30,
        posts: makePosts(10, { spanDays: 7 }),
        pillars: WEAK,
        risks: HIGH_RISK,
      }),
    })
    expect(plan.tasks).toHaveLength(2)
    for (const t of plan.tasks) expect(t.confidence).toBe('medium')
  })

  it('单条爆款 peak > 8x avg → 降一档并在 evidence 注明 outlier', () => {
    const plan = buildGrowthTasks({
      evaluation: makeEvaluation({
        videoCount: 30,
        posts: makePosts(30, { spanDays: 30 }),
        pillars: WEAK,
        risks: HIGH_RISK,
        metrics: { effectiveAvgPlays: 10_000, effectivePeakPlays: 100_000 },
      }),
    })
    for (const t of plan.tasks) {
      expect(t.confidence).toBe('medium')
      expect(t.evidence).toMatch(/outlier/i)
      expect(t.evidence).toMatch(/10\.0x/)
    }
  })

  it('时间覆盖不足 + 异常爆款 → 降两档（medium_high → medium_low）', () => {
    const plan = buildGrowthTasks({
      evaluation: makeEvaluation({
        videoCount: 30,
        posts: makePosts(10, { spanDays: 7 }),
        pillars: WEAK,
        risks: HIGH_RISK,
        metrics: { effectiveAvgPlays: 10_000, effectivePeakPlays: 100_000 },
      }),
    })
    expect(plan.tasks).toHaveLength(2)
    for (const t of plan.tasks) expect(t.confidence).toBe('medium_low')
  })

  it('降档不跌破 low', () => {
    const plan = buildGrowthTasks({
      evaluation: makeEvaluation({
        videoCount: 4,
        posts: makePosts(4, { spanDays: 5 }),
        pillars: WEAK,
        risks: HIGH_RISK,
      }),
    })
    expect(plan.tasks).toHaveLength(1)
    expect(plan.tasks[0].confidence).toBe('low')
  })
})

describe('limitedData', () => {
  it('视频 <5 → 任务 ≤1、confidence low、limitedData', () => {
    const plan = buildGrowthTasks({
      evaluation: makeEvaluation({
        videoCount: 3,
        posts: makePosts(3, { spanDays: 30 }),
        pillars: WEAK,
        risks: HIGH_RISK,
      }),
    })
    expect(plan.tasks.length).toBeLessThanOrEqual(1)
    for (const t of plan.tasks) expect(t.confidence).toBe('low')
    expect(plan.limitedData).toBe(true)
  })

  it('抓取样本 <5（账号总量大）→ limitedData', () => {
    const plan = buildGrowthTasks({
      evaluation: makeEvaluation({
        videoCount: 280,
        posts: makePosts(3, { spanDays: 30 }),
        pillars: WEAK,
        risks: HIGH_RISK,
      }),
    })
    expect(plan.limitedData).toBe(true)
  })

  it('数据充足（videoCount ≥10 且样本 ≥5）→ limitedData=false', () => {
    const plan = buildGrowthTasks({
      evaluation: makeEvaluation({
        videoCount: 30,
        posts: makePosts(30, { spanDays: 30 }),
        pillars: WEAK,
        risks: HIGH_RISK,
      }),
    })
    expect(plan.limitedData).toBe(false)
  })
})

describe('任务质量断言（证据绑定数字 / 禁泛化）', () => {
  const scenarios: Evaluation[] = [
    makeEvaluation({ videoCount: 30, posts: makePosts(30, { spanDays: 30 }), pillars: WEAK, risks: HIGH_RISK }),
    makeEvaluation({ videoCount: 4, posts: makePosts(4, { spanDays: 5 }), pillars: WEAK }),
    makeEvaluation({ videoCount: 30, posts: [], pillars: WEAK, risks: [{ level: 'medium', label: 'Follower quality', detail: 'd' }] }),
    makeEvaluation({ videoCount: 8, posts: makePosts(8, { spanDays: 20, desc: i => `clip ${i}` }), pillars: pillarScores({ niche_clarity: 20 }), baseline: true }),
  ]

  for (const [i, ev] of scenarios.entries()) {
    it(`场景 ${i}：evidence 含数字、title 不匹配黑名单、measureTarget 合法、不承诺收益`, () => {
      const plan = buildGrowthTasks({ evaluation: ev })
      for (const t of plan.tasks) {
        expect(t.evidence).toMatch(/\d/)
        expect(GENERIC_ADVICE_RE.test(t.title)).toBe(false)
        expect(PROMISE_RE.test(t.expectedImpact)).toBe(false)
        expect(t.whyThisMatters.length).toBeGreaterThan(10)
        expect(t.expectedImpact.length).toBeGreaterThan(10)
        expect(t.measureTarget.length).toBeGreaterThan(0)
        for (const k of t.measureTarget) expect(ALL_PILLAR_KEYS).toContain(k)
        expect(t.key).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*-\d+$/)
      }
    })
  }
})

describe('Baseline 标注', () => {
  it('baselineReview → 全部任务 baseline=true 且 whyThisMatters 带校准前缀', () => {
    const plan = buildGrowthTasks({
      evaluation: makeEvaluation({
        videoCount: 30,
        posts: makePosts(30, { spanDays: 30 }),
        pillars: WEAK,
        risks: HIGH_RISK,
        baseline: true,
      }),
    })
    expect(plan.tasks.length).toBeGreaterThan(0)
    for (const t of plan.tasks) {
      expect(t.baseline).toBe(true)
      expect(t.whyThisMatters).toMatch(/^Baseline calibration:/)
    }
  })

  it('非首评 → 无 baseline 标记', () => {
    const plan = buildGrowthTasks({
      evaluation: makeEvaluation({
        videoCount: 30,
        posts: makePosts(30, { spanDays: 30 }),
        pillars: WEAK,
        risks: HIGH_RISK,
      }),
    })
    for (const t of plan.tasks) expect(t.baseline).toBeUndefined()
  })
})

describe('key 幂等稳定', () => {
  it('同输入两次调用 → 输出完全一致，key 唯一', () => {
    const args = { videoCount: 30, posts: makePosts(30, { spanDays: 30 }), pillars: WEAK, risks: HIGH_RISK }
    const a = buildGrowthTasks({ evaluation: makeEvaluation(args) })
    const b = buildGrowthTasks({ evaluation: makeEvaluation(args) })
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
    expect(new Set(a.tasks.map(t => t.key)).size).toBe(a.tasks.length)
  })

  it('key = title kebab-case + 规则序号', () => {
    const plan = buildGrowthTasks({
      evaluation: makeEvaluation({
        videoCount: 10,
        posts: makePosts(10, { spanDays: 30 }),
        pillars: pillarScores({ niche_clarity: 30 }),
      }),
    })
    const niche = plan.tasks.find(t => t.measureTarget.includes('niche_clarity'))!
    expect(niche.key).toBe('focus-your-next-10-videos-on-your-top-3-hashtag-themes-1')
  })
})

describe('最弱支柱优先', () => {
  it('截断保留弱度最低的任务（momentum 10 优先于 audience 55）', () => {
    const plan = buildGrowthTasks({
      evaluation: makeEvaluation({
        videoCount: 4,
        posts: makePosts(4, { spanDays: 30 }),
        pillars: pillarScores({ growth_momentum: 10, audience_quality: 55 }),
      }),
    })
    expect(plan.tasks).toHaveLength(1)
    expect(plan.tasks[0].measureTarget).toEqual(['growth_momentum'])
  })

  it('高危 risk 支柱排在中等弱支柱之前', () => {
    const plan = buildGrowthTasks({
      evaluation: makeEvaluation({
        videoCount: 10,
        posts: makePosts(10, { spanDays: 30 }),
        pillars: pillarScores({ niche_clarity: 40, risk: 90 }),
        risks: [
          { level: 'high', label: 'Follower authenticity', detail: 'd' },
          { level: 'high', label: 'Engagement anomaly', detail: 'd' },
          { level: 'high', label: 'View source anomaly', detail: 'd' },
        ],
      }),
    })
    expect(plan.tasks[0].measureTarget).toEqual(['risk'])
  })
})

describe('全强账号', () => {
  it('无弱支柱、无风险 → 空任务且不越上限', () => {
    const plan = buildGrowthTasks({
      evaluation: makeEvaluation({
        videoCount: 30,
        posts: makePosts(30, { spanDays: 30 }),
        pillars: pillarScores(),
      }),
    })
    expect(plan.tasks).toHaveLength(0)
    expect(plan.tasks.length).toBeLessThanOrEqual(5)
    expect(plan.limitedData).toBe(false)
  })
})

describe('pillars 缺省 → buildPillars 兜底', () => {
  it('不传 pillars 时按 dimensions 重建并正常生成任务', () => {
    const plan = buildGrowthTasks({
      evaluation: makeEvaluation({
        videoCount: 30,
        posts: makePosts(30, { spanDays: 30 }),
        dims: { momentum: 30, stability: 30, engagement: 40, authenticity: 40, commerce: 40, monetization: 40, influence: 40 },
        metrics: { cvPlays: 0.6, playGrowth: 0.1 },
      }),
    })
    expect(plan.tasks.length).toBeGreaterThan(0)
    expect(plan.tasks.length).toBeLessThanOrEqual(5)
    for (const t of plan.tasks) expect(t.confidence).toBe('medium_high')
  })
})
