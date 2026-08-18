// ─── Commercial Growth PMF 派生引擎 ───
// 定位：将"估值"降为输入，输出创作者商业决策数据：
//   1. CommercialSnapshot — 免费首屏（readiness/宽报价/杠杆/阻碍/next move）
//   2. DealPricing       — 付费谈判报价（开价/区间/底价/假设/不含条件）
//   3. ThirtyDayPlan     — 付费四周商业成长任务
// 所有函数仅在服务端 scoreProfile 内调用；客户端不得基于可篡改数值重算报价。

import {
  DimensionScores, RiskFlag, Metrics, ContentCadence,
  GrowthPlan, ContentStrategy, BrandMatching,
  CommercialSnapshot, DealPricing, ThirtyDayPlan, ThirtyDayTask,
  Evaluation, CalculationMetadata,
} from '@/types'
import { TIER_ER_BENCHMARK, RISK_DISCOUNT, getMinBrandDealPrice, clamp } from './config'
import { getFollowerTier, type BrandDealResult } from './valuation'

/** 报价取整到 $10（谈判报价用整数更自然） */
function roundRate(v: number): number {
  return Math.max(10, Math.round(v / 10) * 10)
}

// ── Commercial Readiness ──

/** 商业相关维度（用于商业准备度加权与杠杆/阻碍选择） */
const COMMERCIAL_DIMS: (keyof DimensionScores)[] = ['commerce', 'engagement', 'stability', 'monetization', 'health']

/** 杠杆候选（排序即优先级：同等分数下更商业的维度胜出） */
const LEVER_DIMS: (keyof DimensionScores)[] = ['commerce', 'engagement', 'content', 'reach', 'momentum', 'stability', 'influence']

const DIMENSION_LABELS: Record<keyof DimensionScores, string> = {
  reach: 'audience reach',
  engagement: 'engagement quality',
  content: 'repeatable content formats',
  authenticity: 'audience authenticity',
  momentum: 'growth momentum',
  stability: 'delivery consistency',
  commerce: 'brand-friendly content',
  monetization: 'monetization readiness',
  health: 'account standing',
  influence: 'market position',
}

const DIMENSION_BLOCKER_FIX: Record<keyof DimensionScores, string> = {
  reach: 'Publish in proven formats that reach beyond your follower base to lift effective views.',
  engagement: 'Add clear calls-to-action and reply to early comments to strengthen engagement signals.',
  content: 'Double down on your best-performing format instead of exploring new ones.',
  authenticity: 'Audit follower sources; authentic engagement supports stronger rates.',
  momentum: 'Re-establish a consistent posting rhythm to rebuild algorithmic momentum.',
  stability: 'Fix a weekly posting schedule — brands pay premiums for predictable delivery.',
  commerce: 'Weave natural product mentions into your existing format to build brand-fit proof.',
  monetization: 'Meet platform monetization thresholds to add a baseline income floor.',
  health: 'Resolve account health signals first — brands discount risky accounts heavily.',
  influence: 'Collaborate with nearby-tier creators to strengthen market position.',
}

function readinessBandOf(score: number): CommercialSnapshot['readinessBand'] {
  if (score >= 80) return 'Premium Value'
  if (score >= 65) return 'Strong Value'
  if (score >= 45) return 'Growth Value'
  return 'Early Value'
}

const TIER_POSITIONING: Record<string, string> = {
  nano: 'Emerging',
  micro: 'Rising',
  mid: 'Established',
  macro: 'Leading',
  mega: 'Top-tier',
}

function buildPositioning(categories: string[], followerCount: number, engagementRate: number): string {
  const tier = getFollowerTier(followerCount)
  const bench = TIER_ER_BENCHMARK[tier] || 3
  const qualifier = engagementRate >= bench * 1.25 ? 'above-average engagement'
    : engagementRate >= bench * 0.75 ? 'steady engagement'
    : 'developing engagement'
  const niche = (categories[0] || 'lifestyle').toLowerCase()
  const stage = TIER_POSITIONING[tier] || 'Emerging'
  return `${stage} ${niche} creator with ${qualifier}`
}

function pickStrongestLever(dims: DimensionScores, metrics: Metrics): CommercialSnapshot['strongestLever'] {
  let best = LEVER_DIMS[0]
  let bestScore = -1
  for (const d of LEVER_DIMS) {
    if (dims[d] > bestScore) { bestScore = dims[d]; best = d }
  }
  const detailByDim: Record<string, string> = {
    reach: `~${Math.round(metrics.effectiveAvgPlays).toLocaleString()} effective views per video support charging on reach, not follower count.`,
    engagement: `${metrics.engagementRate.toFixed(1)}% engagement rate signals high-intent viewers brands pay premiums for.`,
    content: metrics.effectivePeakPlays > 0 ? `Peak videos hit ~${Math.round(metrics.effectivePeakPlays).toLocaleString()} plays — proof you can repeat strong formats.` : 'Proven repeatable formats reduce brand delivery risk.',
    momentum: `${metrics.playGrowth > 0 ? '+' : ''}${metrics.playGrowth.toFixed(0)}% recent play growth strengthens your negotiating position.`,
    stability: metrics.cvPlays < 60 ? `Play consistency (CV ${metrics.cvPlays.toFixed(0)}) lets you promise brands predictable delivery.` : 'Predictable delivery supports premium terms.',
    commerce: 'Content already shows brand-friendly signals — natural fit for paid integrations.',
    influence: 'Market position above similar creators supports above-peer rates.',
  }
  return { label: `Strong ${DIMENSION_LABELS[best]}`, detail: detailByDim[best] || `Your ${DIMENSION_LABELS[best]} is your strongest commercial asset.` }
}

function pickPrimaryBlocker(risks: RiskFlag[], dims: DimensionScores): CommercialSnapshot['primaryRateBlocker'] {
  const rank = { high: 0, medium: 1, low: 2 }
  const sorted = [...risks].sort((a, b) => rank[a.level] - rank[b.level])
  if (sorted.length > 0) {
    const top = sorted[0]
    const impact = top.level === 'high'
      ? 'Brands typically discount rates 30–50% until this is resolved.'
      : top.level === 'medium'
        ? 'Expect negotiations to open 10–20% lower until this improves.'
        : 'Minor impact — worth monitoring before big deals.'
    return { label: top.label, detail: top.detail, impact }
  }
  // 无风险信号时：商业维度最低项即为最大报价阻碍
  let worst = COMMERCIAL_DIMS[0]
  let worstScore = 101
  for (const d of COMMERCIAL_DIMS) {
    if (dims[d] < worstScore) { worstScore = dims[d]; worst = d }
  }
  return {
    label: `Limited ${DIMENSION_LABELS[worst]}`,
    detail: DIMENSION_BLOCKER_FIX[worst],
    impact: 'Improving this is your fastest path to a higher rate.',
  }
}

export interface CommercialSnapshotInput {
  score: number
  dims: DimensionScores
  metrics: Metrics
  risks: RiskFlag[]
  brand: Pick<BrandDealResult, 'perVideoLow' | 'perVideoMid' | 'perVideoHigh'>
  categories: string[]
  followerCount: number
  growthPlan: GrowthPlan
  dataQuality?: 'full' | 'partial' | 'minimal'
  playsSource: Metrics['effectivePlaysSource']
}

export function buildCommercialSnapshot(input: CommercialSnapshotInput): CommercialSnapshot {
  const { score, dims, metrics, risks, brand, categories, followerCount, growthPlan, dataQuality, playsSource } = input

  // 商业准备度 = 综合分 60% + 商业维度均值 40%
  const commercialAvg = COMMERCIAL_DIMS.reduce((s, d) => s + dims[d], 0) / COMMERCIAL_DIMS.length
  const readinessScore = Math.round(clamp(score * 0.6 + commercialAvg * 0.4, 0, 100))

  // 宽报价区间（比付费精确区间更宽；免费只到这一层）
  const suggestedRateRange = {
    low: roundRate(brand.perVideoLow * 0.8),
    mid: roundRate(brand.perVideoMid),
    high: roundRate(brand.perVideoHigh * 1.2),
  }

  // Next move：优先取 growthPlan 高优先级动作
  const priorityRank = { high: 0, medium: 1, low: 2 }
  const topGrowth = [...growthPlan.items].sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority])[0]
  const nextMove = topGrowth
    ? {
      title: topGrowth.area,
      detail: `${topGrowth.action} ${topGrowth.expectedImpact}`,
      effortHours: topGrowth.priority === 'high' ? 2 : 4,
    }
    : {
      title: 'Publish three videos in your strongest format',
      detail: 'Stable, high-intent performance proof is the foundation of every rate conversation.',
      effortHours: 4,
    }

  const dataConfidence: CommercialSnapshot['dataConfidence'] =
    playsSource === 'fallback' || dataQuality === 'partial' || dataQuality === 'minimal'
      ? 'low'
      : dataQuality === 'full' && metrics.effectiveAvgPlays > 0
        ? 'high'
        : 'medium'

  return {
    readinessScore,
    readinessBand: readinessBandOf(readinessScore),
    positioning: buildPositioning(categories, followerCount, metrics.engagementRate),
    suggestedRateRange,
    strongestLever: pickStrongestLever(dims, metrics),
    primaryRateBlocker: pickPrimaryBlocker(risks, dims),
    nextMove,
    dataConfidence,
  }
}

// ── Deal Pricing（付费谈判报价） ──

export interface DealPricingInput {
  brand: Pick<BrandDealResult, 'perVideoLow' | 'perVideoMid' | 'perVideoHigh' | 'detail'>
  followerCount: number
  videoCount: number
  metrics: Metrics
  risks: RiskFlag[]
  categoryLabel: string
  regionLabel: string
}

export function buildDealPricing(input: DealPricingInput): DealPricing {
  const { brand, followerCount, videoCount, metrics, risks, categoryLabel, regionLabel } = input
  const tier = getFollowerTier(followerCount)

  // 开价略高于中值留谈判空间；底价 = 可接受下限的 75%（不低于品类最低保护价）
  const openingRate = roundRate(brand.perVideoMid * 1.1)
  const acceptableRange = {
    low: roundRate(brand.perVideoLow),
    high: roundRate(brand.perVideoHigh),
  }
  const privateMinimum = roundRate(Math.max(brand.perVideoLow * 0.75, getMinBrandDealPrice(tier)))

  const riskNote = risks.length > 0
    ? `${risks.length} rate blocker${risks.length > 1 ? 's' : ''} detected — risk discount ${(1 - brand.detail.riskDiscount).toFixed(0) ? `${Math.round((1 - brand.detail.riskDiscount) * 100)}%` : 'already'} applied to estimates`
    : 'No rate blockers detected — clean accounts support top-of-range rates'

  const factors: DealPricing['factors'] = [
    { label: 'Account performance', note: `${followerCount.toLocaleString()} followers · ${videoCount.toLocaleString()} lifetime videos` },
    { label: 'Effective views', note: `~${Math.round(metrics.effectiveAvgPlays).toLocaleString()} estimated plays per video (mature-video weighted)` },
    { label: 'Engagement quality', note: `${metrics.engagementRate.toFixed(1)}% engagement rate × ${brand.detail.engagementMult}x rate multiplier` },
    { label: 'Content niche', note: `${categoryLabel} category CPM $${brand.detail.cpm}` },
    { label: 'Region', note: `${regionLabel} market × ${brand.detail.regionMult}x regional factor` },
    { label: 'Growth trend', note: `${metrics.playGrowth > 0 ? '+' : ''}${metrics.playGrowth.toFixed(0)}% recent play growth ${metrics.playGrowth > 20 ? '(rising accounts justify firmer opening rates)' : ''}`.trim() },
    { label: 'Risk signals', note: riskNote },
    { label: 'Data confidence', note: metrics.effectivePlaysSource === 'fallback' ? 'Limited post data — treat as directional guidance only' : `Estimate based on ${metrics.matureWeightedAvgPlays > 0 ? 'mature-video' : 'recent'} play history` },
  ]

  return {
    openingRate,
    acceptableRange,
    privateMinimum,
    assumptions: 'One TikTok video · organic use only · no exclusivity · standard delivery (7–14 days).',
    notIncluded: [
      'UGC packages or ad creatives',
      'Paid usage / whitelisting rights',
      'Exclusivity clauses',
      'Cross-platform rights (Reels, YouTube)',
      'Additional revision rounds',
      'Rush delivery (72 hours)',
      'LIVE sessions',
      'Long-term ambassadorships',
    ],
    factors,
  }
}

// ── 30-Day Plan（付费四周任务） ──

export interface ThirtyDayPlanInput {
  snapshot: CommercialSnapshot
  metrics: Metrics
  cadence: ContentCadence
  contentStrategy: ContentStrategy
  brandMatching: BrandMatching
  followerCount: number
  risks: RiskFlag[]
}

export function buildThirtyDayPlan(input: ThirtyDayPlanInput): ThirtyDayPlan {
  const { snapshot, metrics, cadence, contentStrategy, brandMatching, risks } = input

  const pillar = contentStrategy.pillars[0]
  const bestSlot = cadence.bestTimeSlots[0]
  const matchedCategories = brandMatching.matches.slice(0, 3).map(m => m.category)
  const postingPerWeek = cadence.avgPostsPerWeek > 0 ? cadence.avgPostsPerWeek.toFixed(1) : '2'

  const tasks: ThirtyDayTask[] = [
    {
      week: 1,
      goal: `Fix your biggest rate blocker: ${snapshot.primaryRateBlocker.label}`,
      actions: [snapshot.primaryRateBlocker.detail],
      impacts: 'Removes the single largest discount brands apply to your rate.',
      doneWhen: snapshot.primaryRateBlocker.impact,
      effortHours: 3,
    },
    {
      week: 2,
      goal: 'Build performance proof',
      actions: [
        `Publish 3 videos in your strongest repeatable format${pillar ? ` (${pillar.type})` : ''}.`,
        bestSlot ? `Post around hour ${bestSlot.hour}:00 — your highest-engagement window.` : 'Post at your usual best-performing time.',
        'Record weekly median views for each post.',
      ],
      impacts: 'Stable, high-intent engagement is the evidence brands pay premiums for.',
      doneWhen: '3 posts published and weekly median views recorded.',
      effortHours: 6,
    },
    {
      week: 3,
      goal: 'Prepare your brand assets',
      actions: [
        'Collect your top 3 performing videos as a performance portfolio.',
        `Draft a one-page rate card using your suggested range ($${snapshot.suggestedRateRange.mid} mid).`,
        'Write a 2-sentence pitch: who you reach and why they convert.',
      ],
      impacts: 'Brand readiness — makes every pitch faster and more professional.',
      doneWhen: 'Portfolio + rate card draft saved and shareable.',
      effortHours: 4,
    },
    {
      week: 4,
      goal: 'Start pitching',
      actions: [
        matchedCategories.length > 0
          ? `Contact 5 brands in your best-fit categories: ${matchedCategories.join(', ')}.`
          : 'Contact 5 brands that already sponsor creators in your niche.',
        `Lead with your performance proof, open at your suggested rate ($${snapshot.suggestedRateRange.mid}+).`,
        `Keep your current cadence (${postingPerWeek} posts/week) while negotiating.`,
      ],
      impacts: 'Pipeline — negotiated deals are the only way rates compound.',
      doneWhen: '5 personalized pitches sent; responses tracked in a sheet.',
      effortHours: 4,
    },
  ]

  const dataNote = metrics.effectivePlaysSource === 'fallback' || risks.length === 0
    ? ' Limited recent post data available — treat timing suggestions as directional.'
    : ''

  return {
    tasks,
    summary: `Derived from your mature-video play history (~${Math.round(metrics.effectiveAvgPlays).toLocaleString()} effective views/video), ${metrics.engagementRate.toFixed(1)}% engagement, ${risks.length} detected rate blocker${risks.length === 1 ? '' : 's'}.${dataNote}`,
  }
}

// ── 旧缓存 Hydration（服务端） ──
// v2 早期缓存在数据库中缺少 commercialSnapshot / dealPricing / thirtyDayPlan。
// 本函数在缓存命中/付费升级时于服务端重建这些派生字段，
// 保证客户端拿到的报价永远出自服务端（不允许客户端自行重算）。

function approxRiskDiscount(risks: RiskFlag[]): number {
  let discount = 1.0
  for (const r of risks) {
    discount *= r.level === 'high' ? RISK_DISCOUNT.high : r.level === 'medium' ? RISK_DISCOUNT.medium : 1.0
  }
  return clamp(discount, 0.1, 1.0)
}

export function hydrateCommercial(evaluation: Evaluation): Evaluation {
  if (evaluation.commercialSnapshot && evaluation.dealPricing && evaluation.thirtyDayPlan) {
    return evaluation
  }
  try {
    const meta: Partial<CalculationMetadata> = evaluation.calculationMetadata || {}
    const mid = evaluation.brandDealPerVideo?.mid ?? meta.perVideoBrandDealMid ?? 0
    if (mid <= 0) return evaluation // 无法重建报价，保持原样

    const brand: Pick<BrandDealResult, 'perVideoLow' | 'perVideoMid' | 'perVideoHigh' | 'detail'> = {
      perVideoLow: evaluation.brandDealPerVideo?.low ?? Math.round(mid * 0.7),
      perVideoMid: evaluation.brandDealPerVideo?.mid ?? mid,
      perVideoHigh: evaluation.brandDealPerVideo?.high ?? Math.round(mid * 1.5),
      detail: {
        cpm: meta.brandCpm ?? 15,
        effectiveAvgPlays: meta.effectiveAvgPlays ?? evaluation.metrics.effectiveAvgPlays,
        engagementMult: meta.engagementMultiplier ?? 1,
        regionMult: meta.regionMultiplier ?? 1,
        monthlyBrandPosts: meta.monthlyBrandPosts ?? 2,
        tierPremium: 1,
        momentumMultiplier: 1,
        riskDiscount: approxRiskDiscount(evaluation.riskFlags || []),
        verifiedMultiplier: evaluation.verified ? 1.1 : 1,
        marketAnchored: false,
        followerCapAnchored: false,
      },
    }
    const categories = evaluation.accountProfile?.categories || []
    const risks = evaluation.riskFlags || []
    const growthPlan: GrowthPlan = evaluation.growthPlan || { items: [], summary: '' }
    const metrics = evaluation.metrics
    const dims = evaluation.dimensions

    let snapshot = evaluation.commercialSnapshot
    if (!snapshot) {
      snapshot = buildCommercialSnapshot({
        score: evaluation.score,
        dims,
        metrics,
        risks,
        brand,
        categories,
        followerCount: evaluation.followerCount,
        growthPlan,
        dataQuality: evaluation.dataQuality,
        playsSource: metrics.effectivePlaysSource,
      })
    }
    let dealPricing = evaluation.dealPricing
    if (!dealPricing) {
      dealPricing = buildDealPricing({
        brand,
        followerCount: evaluation.followerCount,
        videoCount: evaluation.videoCount,
        metrics,
        risks,
        categoryLabel: meta.categoryForCpm || 'General',
        regionLabel: meta.regionLabel || 'United States',
      })
    }
    let thirtyDayPlan = evaluation.thirtyDayPlan
    if (!thirtyDayPlan) {
      thirtyDayPlan = buildThirtyDayPlan({
        snapshot,
        metrics,
        cadence: evaluation.contentCadence,
        contentStrategy: evaluation.contentStrategy,
        brandMatching: evaluation.brandMatching,
        followerCount: evaluation.followerCount,
        risks,
      })
    }
    return { ...evaluation, commercialSnapshot: snapshot, dealPricing, thirtyDayPlan }
  } catch {
    return evaluation // 重建失败不影响原有数据返回
  }
}
