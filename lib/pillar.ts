// ── 6 支柱映射层（Spec §7.1–7.4）──
// 内部 10 维加权评分引擎不动；本模块只做「内部维度 → 对外支柱」的纯映射，
// 以及估值展示 v2 的置信度区间宽度与风险折扣公式。零 LLM、零副作用。

import type {
  DimensionScores, Metrics, Post, RiskFlag,
  PillarKey, Pillar, PillarBreakdown, PillarStatus, ConfidenceBand, ValuationV2,
} from '../types'
import { TIER_COLORS } from './tier'

// 类型定义统一在 types.ts；此处 re-export 便于组件单点导入
export type { PillarKey, Pillar, PillarBreakdown, PillarStatus, ConfidenceBand, ValuationV2 }

export interface BuildPillarsInput {
  dims: DimensionScores
  metrics: Metrics
  posts: Post[]
  risks: RiskFlag[]
}

// ========== 状态词（Spec §7.1） ==========

export function pillarStatusOf(score: number): PillarStatus {
  if (score >= 70) return 'Strong'
  if (score >= 45) return 'On track'
  return 'Needs attention'
}

/** risk 支柱反向语义：低风险 = Strong */
function riskStatusOf(riskScore: number): PillarStatus {
  return pillarStatusOf(100 - riskScore)
}

// ========== Risk Score / 折扣（Spec §7.4） ==========

const RISK_WEIGHT = { high: 30, medium: 15, low: 6 } as const

export function riskScoreOf(risks: RiskFlag[]): number {
  const total = risks.reduce((s, r) => s + RISK_WEIGHT[r.level], 0)
  return Math.max(0, Math.min(100, total))
}

/** discount = min(40%, RiskScore × 0.75%) */
export function riskDiscountPct(riskScore: number): number {
  return Math.min(40, riskScore * 0.75)
}

// ========== Niche Clarity：hashtag 聚类（无 LLM） ==========

export interface NicheClarity {
  score: number
  topTags: string[]
  /** 无 hashtag / 无视频时为 true → 归因明示「无法判定」并降置信 */
  unclear: boolean
}

const HASHTAG_RE = /#[\w\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]+/g

export function nicheClarityOf(posts: Post[]): NicheClarity {
  const counts: Record<string, number> = {}
  let total = 0
  for (const post of posts) {
    const tags = (post.desc || '').match(HASHTAG_RE) || []
    for (const t of tags) {
      counts[t.toLowerCase()] = (counts[t.toLowerCase()] || 0) + 1
      total += 1
    }
  }
  if (!total) return { score: 30, topTags: [], unclear: true }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
  const top3Share = sorted.slice(0, 3).reduce((s, [, n]) => s + n, 0) / total
  const top1Share = (sorted[0]?.[1] || 0) / total // 头号主题重复率（越高越聚焦）

  // top-3 占比为主（0–85 分）+ 头号主题重复加成（0–15 分）
  const shareScore = Math.min(85, Math.round(top3Share * 100))
  const focusBonus = top1Share >= 0.3 ? 15 : top1Share >= 0.15 ? 8 : 0
  return { score: Math.min(100, shareScore + focusBonus), topTags: sorted.slice(0, 3).map(([t]) => t), unclear: false }
}

// ========== 6 支柱构建（Spec §7.1 映射表） ==========

function fmtPct(n: number): string {
  return `${n > 0 ? '+' : ''}${n.toFixed(0)}%`
}

export function buildPillars(input: BuildPillarsInput): PillarBreakdown {
  const { dims, metrics, posts, risks } = input
  const niche = nicheClarityOf(posts)

  const growthScore = Math.round(dims.momentum)
  const consistencyScore = Math.round(dims.stability)
  const audienceScore = Math.round((dims.engagement + dims.authenticity) / 2)
  const brandScore = Math.round(dims.commerce * 0.4 + dims.monetization * 0.3 + dims.influence * 0.3)
  const riskScore = riskScoreOf(risks)

  const nicheAttribution = niche.unclear
    ? 'No hashtags detected in recent videos — niche focus cannot be verified from public data.'
    : `Top themes ${niche.topTags.join(', ')} cover the majority of recent posts.`

  const pillars: Pillar[] = [
    {
      key: 'growth_momentum',
      name: 'Growth Momentum',
      score: growthScore,
      status: pillarStatusOf(growthScore),
      attribution: Math.abs(metrics.playGrowth) < 0.01
        ? 'Your recent videos are getting views at about the same rate as the previous period — holding steady.'
        : `Your recent videos got ${fmtPct(metrics.playGrowth * 100)} views vs the previous period — ${metrics.playGrowth > 0 ? 'momentum is building' : 'views are cooling off'}.`,
    },
    {
      key: 'content_consistency',
      name: 'Content Consistency',
      score: consistencyScore,
      status: pillarStatusOf(consistencyScore),
      attribution: `Views are ${metrics.cvPlays > 0.5 ? 'unpredictable from video to video' : metrics.cvPlays > 0.3 ? 'somewhat variable but manageable' : 'steady video-to-video'} — steadier performance is easier to sell to brands.`,
    },
    {
      key: 'audience_quality',
      name: 'Audience Quality',
      score: audienceScore,
      status: pillarStatusOf(audienceScore),
      attribution: `${metrics.engagementRate.toFixed(1)}% of viewers like, comment or share — engagement patterns look authentic, with no bot-like activity detected.`,
    },
    {
      key: 'niche_clarity',
      name: 'Niche Clarity',
      score: niche.score,
      status: pillarStatusOf(niche.score),
      attribution: nicheAttribution,
    },
    {
      key: 'brand_readiness',
      name: 'Brand Readiness',
      score: brandScore,
      status: pillarStatusOf(brandScore),
      attribution: 'Combines how brand-friendly your content is, which monetization programs you qualify for, and how you stack up in your niche.',
    },
    {
      key: 'risk',
      name: 'Risk Score',
      score: riskScore,
      status: riskStatusOf(riskScore),
      attribution: risks.length
        ? `Detected: ${risks.map(r => r.label).join(', ')}.`
        : 'No account risk signals detected in public data.',
    },
  ]

  return { pillars }
}

// ========== 置信度分档与区间宽度（Spec §7.4） ==========

export interface ConfidenceInput {
  videoCount: number
  dataQuality?: 'full' | 'partial' | 'minimal'
  /** 异常爆款存在（峰值/均值 > 8x 视为异常） */
  outlierBreakout?: boolean
}

export function confidenceBandOf(input: ConfidenceInput): { band: ConfidenceBand; reasons: string[] } {
  const { videoCount, dataQuality, outlierBreakout } = input
  const reasons: string[] = []

  let points = 0
  if (videoCount >= 15) points += 2
  else if (videoCount >= 8) { points += 1; reasons.push('limited video sample') }
  else { reasons.push('very few videos analyzed') }

  if (dataQuality === 'full') points += 2
  else if (dataQuality === 'partial') { points += 0; reasons.push('partial data coverage') }
  else if (dataQuality === 'minimal') { reasons.push('minimal data coverage') }

  if (outlierBreakout) { points -= 1; reasons.push('outlier viral video widens estimates') }

  const band: ConfidenceBand =
    points >= 4 ? 'medium_high'
    : points >= 3 ? 'medium'
    : points >= 2 ? 'medium_low'
    : 'low'
  return { band, reasons }
}

export function rangeWidthForConfidence(band: ConfidenceBand): number {
  switch (band) {
    case 'medium_high': return 0.15
    case 'medium': return 0.20
    case 'medium_low': return 0.25
    case 'low': return 0.30
  }
}

/** band 宽度重算展示区间（内部估值 low/high 不动，仅展示层覆盖） */
export function valuationRangeOf(mid: number, band: ConfidenceBand): { low: number; mid: number; high: number } {
  const w = rangeWidthForConfidence(band)
  return { low: Math.round(mid * (1 - w)), mid: Math.round(mid), high: Math.round(mid * (1 + w)) }
}

/** 组合：估值展示 v2 全量字段（scoreProfile 单点调用） */
export function buildValuationV2(input: ConfidenceInput & { mid: number; risks: RiskFlag[] }): ValuationV2 {
  const { mid, risks, ...conf } = input
  const { band } = confidenceBandOf(conf)
  const riskScore = riskScoreOf(risks)
  return {
    band,
    riskScore,
    riskDiscountPct: Math.round(riskDiscountPct(riskScore)),
    range: valuationRangeOf(mid, band),
  }
}

// ========== 价值层级（Spec §7.2；色值读 TIER_COLORS 硬约束） ==========

export type ValueTier = 'Premium Value' | 'Growth Value' | 'Developing Value' | 'Early Value'

export function valueTierOf(tier: string): ValueTier {
  switch (tier) {
    case 'S': case 'A': return 'Premium Value'
    case 'B': case 'C': return 'Growth Value'
    case 'D': case 'E': return 'Developing Value'
    default: return 'Early Value'
  }
}

export function valueTierColor(tier: string): string {
  return TIER_COLORS[tier] || '#ffffff'
}
