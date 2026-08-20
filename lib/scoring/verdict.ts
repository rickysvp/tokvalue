import {
  DimensionScores, Metrics, RiskFlag, ReportSummary,
  AccountHealth,
} from '../../types'
import { TIER_THRESHOLDS } from './config'

const DIM_LABELS: Record<keyof DimensionScores, { name: string; strength: string; weakness: string }> = {
  reach: { name: 'Reach', strength: 'Strong reach — follower count and play volume perform well', weakness: 'Limited reach — consider growing follower base or improving play volume' },
  engagement: { name: 'Engagement', strength: 'Healthy engagement — active followers with good comment depth', weakness: 'Low engagement — optimize hook in first 3 seconds and comment prompts' },
  content: { name: 'Content Virality', strength: 'Strong viral potential — high niche focus with viral hits', weakness: 'Weak viral potential — focus on a vertical niche to boost hit rate' },
  authenticity: { name: 'Authenticity', strength: 'High follower authenticity — genuine engagement, no bot activity', weakness: 'Questionable authenticity — possible follow-for-follow or bot activity' },
  momentum: { name: 'Momentum', strength: 'Strong growth momentum — recent plays trending upward', weakness: 'Weak momentum — recent plays declining' },
  stability: { name: 'Stability', strength: 'Stable traffic — low play volatility, predictable performance', weakness: 'Unstable traffic — high play volatility, affecting partnership reliability' },
  commerce: { name: 'Commerce Fit', strength: 'High commerce fit — clear purchase intent, strong brand alignment', weakness: 'Low commerce fit — lacks purchase intent or brand association' },
  monetization: { name: 'Monetization', strength: 'Strong monetization potential — meets platform monetization thresholds', weakness: 'Low monetization potential — not meeting key monetization thresholds' },
  health: { name: 'Account Health', strength: 'Healthy account — no significant risk signals detected', weakness: 'Poor account health — potential shadowban or fake follower risks' },
  influence: { name: 'Influence', strength: 'High industry standing — above peer average for this tier', weakness: 'Low industry standing — below peer average for this tier' },
}

// ========== Score-based Tier System ==========

export interface TierResult {
  tier: 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
  reason: string
}

/**
 * Score-based tier system
 * Tier reflects overall account quality across 10 dimensions (reach, engagement, content, etc.)
 * Business value is a display metric, not a tier determinant — prevents "high followers + low plays" from getting S tier
 */
export function tierFromScore(score: number, risks: RiskFlag[]): TierResult {
  const hasHighRisk = risks.some(r => r.level === 'high')
  const highRiskCount = risks.filter(r => r.level === 'high').length

  // Critical risk → straight to F
  if (highRiskCount >= 2) {
    return {
      tier: 'F' as const,
      reason: 'Critical risk signals detected — not recommended for any commercial partnership',
    }
  }

  let tier: 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
  let reason: string

  if (score >= TIER_THRESHOLDS.S) {
    tier = 'S'
    reason = `Score ${score} — top-tier account with exceptional performance across all dimensions`
  } else if (score >= TIER_THRESHOLDS.A) {
    tier = 'A'
    reason = `Score ${score} — premium account with above-average performance`
  } else if (score >= TIER_THRESHOLDS.B) {
    tier = 'B'
    reason = `Score ${score} — solid account with stable performance and growth room`
  } else if (score >= TIER_THRESHOLDS.C) {
    tier = 'C'
    reason = `Score ${score} — growing account with potential, not yet at stable level`
  } else if (score >= TIER_THRESHOLDS.D) {
    tier = 'D'
    reason = `Score ${score} — entry-level account, multiple dimensions need improvement`
  } else if (score >= TIER_THRESHOLDS.E) {
    tier = 'E'
    reason = `Score ${score} — below-average performance with risk signals`
  } else {
    tier = 'F'
    reason = `Score ${score} — minimal commercial value, not ready for partnerships`
  }

  // Risk downgrade: high risk signals → force downgrade one tier
  if (hasHighRisk && tier !== 'F' && tier !== 'E') {
    const tierOrder = ['S', 'A', 'B', 'C', 'D', 'E', 'F'] as const
    const idx = tierOrder.indexOf(tier)
    if (idx >= 0 && idx < tierOrder.length - 1) {
      const downgradedTier = tierOrder[idx + 1]
      reason += ` (downgraded from ${tier} to ${downgradedTier} due to risk signals)`
      tier = downgradedTier
    }
  }

  return { tier, reason }
}

/**
 * @deprecated Use tierFromScore instead
 * Business value-based tier — kept for backward compatibility, no longer used in scoreProfile
 */
export function tierFromBusinessValue(
  _businessValueMid: number,
  _followerCount: number,
  risks: RiskFlag[],
): TierResult {
  return tierFromScore(0, risks)
}

function formatPlays(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(0).replace(/\.0$/, '') + 'K'
  return String(Math.round(n))
}

export interface PriceAdviceInput {
  perVideoLow: number
  perVideoMid: number
  perVideoHigh: number
  effectiveAvgPlays: number
  categoryLabel: string
  cpm: number
  engagementMult: number
  regionLabel: string
  regionMult: number
  risks: RiskFlag[]
}

export function buildPriceAdvice(input: PriceAdviceInput): string {
  const { perVideoLow, perVideoMid, perVideoHigh, effectiveAvgPlays, categoryLabel, cpm, engagementMult, regionLabel, regionMult, risks } = input
  const playsN = formatPlays(effectiveAvgPlays)

  let text = `Market rate: $${perVideoLow.toLocaleString()} – $${perVideoHigh.toLocaleString()} per sponsored video (typical: $${perVideoMid.toLocaleString()}). Based on your ${playsN} average views, ${categoryLabel} niche rates, ${engagementMult >= 1 ? 'strong' : 'softer'} engagement and ${regionLabel} market pricing. Adjust ±20-30% for production cost, exclusivity and usage rights.`

  const highRisks = risks.filter(r => r.level === 'high')
  if (highRisks.length > 0) {
    const riskLabels = highRisks.map(r => r.label).join(', ')
    text += ` ⚠️ Detected: ${riskLabels}. Remediate before accepting partnerships. Actual pricing may be 30-50% lower.`
  }

  return text
}

export interface VerdictInput {
  score: number
  tier: string
  tierReason: string
  nickname: string
  metrics: Metrics
  health: AccountHealth
  dims: DimensionScores
  risks: RiskFlag[]
  categories: string[]
  businessValueMid: number
}

export function buildVerdict(input: VerdictInput): { verdict: string; advice: string } {
  const { score, tier, nickname, metrics, health, dims, risks, businessValueMid } = input

  // 差异化支柱：每个账号的最强/最弱维度不一样 → 注入到 verdict 与 advice 中
  const dimEntries = (Object.entries(dims) as [keyof DimensionScores, number][]).sort((a, b) => b[1] - a[1])
  const topDim = dimEntries[0] as [keyof DimensionScores, number]
  const botDim = dimEntries[dimEntries.length - 1] as [keyof DimensionScores, number]
  const topPillarSentence = `Strongest pillar: ${DIM_LABELS[topDim[0]].name} (${topDim[1]}/100)`
  const botPillarSentence = `Main gap: ${DIM_LABELS[botDim[0]].name} (${botDim[1]}/100)`

  const engagementLabel = metrics.engagementRate >= 6 ? 'excellent engagement'
    : metrics.engagementRate >= 3 ? 'healthy engagement'
    : metrics.engagementRate >= 1 ? 'average engagement'
    : 'below-average engagement'

  const healthLabel = health.shadowbanRisk === 'high' ? ', with notable health risks' : health.shadowbanRisk === 'medium' ? ', with minor risk signals' : ''

  const bvFormatted = businessValueMid >= 1_000_000
    ? `$${(businessValueMid / 1_000_000).toFixed(1)}M`
    : businessValueMid >= 1_000
    ? `$${(businessValueMid / 1_000).toFixed(0)}K`
    : `$${Math.round(businessValueMid)}`

  // 支柱差异 + 播放增长趋势注入 → 免费用户看到的第一句就"像真人写的"
  const growthTag = metrics.playGrowth >= 25 ? ' — strong growth phase, play counts climbing fast'
    : metrics.playGrowth >= 8 ? ' — recent growth is trending positive'
    : metrics.playGrowth >= 0 ? ' — posting consistency is holding steady'
    : metrics.playGrowth > -15 ? ' — recent plays have softened, worth adjusting direction'
    : ' — notable decline trend, needs a content reset'

  const verdict = `${nickname} scores ${score}/100 with ${engagementLabel}${growthTag}. ${topPillarSentence}; ${botPillarSentence}. Estimated account value ${bvFormatted}${healthLabel}.`

  const hasHighRisk = risks.some(r => r.level === 'high')
  let advice = ''

  if (hasHighRisk) {
    const riskLabels = risks.filter(r => r.level === 'high').map(r => r.label).join(', ')
    advice = `High-risk signals detected: ${riskLabels}. Address these risks first — they directly suppress ${DIM_LABELS[botDim[0]].name.toLowerCase()} and deflate partnership rates.`
  } else if (tier === 'S' || tier === 'A') {
    if (metrics.playGrowth > 20) {
      advice = `You're in a growth surge. Double down on what's fueling ${DIM_LABELS[topDim[0]].name.toLowerCase()} (now ${topDim[1]}/100), protect momentum, and price premium — your current ${DIM_LABELS[botDim[0]].name.toLowerCase()} weakness (${botDim[1]}/100) is the only thing that can undercut your value in brand negotiations.`
    } else {
      advice = `Premium quality. Lead with ${DIM_LABELS[topDim[0]].name.toLowerCase()} when pitching brands (it's your strongest bargaining chip at ${topDim[1]}/100), and quietly improve ${DIM_LABELS[botDim[0]].name.toLowerCase()} (${botDim[1]}/100) — that gap is where you leave money on the table.`
    }
  } else if (tier === 'B') {
    advice = `Solid foundation. Priority: raise ${DIM_LABELS[botDim[0]].name.toLowerCase()} from ${botDim[1]}/100 — it's the single biggest lever on your rates. Meanwhile keep ${DIM_LABELS[topDim[0]].name.toLowerCase()} (${topDim[1]}/100) consistent, it's why brands will click through on your media kit. Engagement currently ${metrics.engagementRate.toFixed(1)}%.`
  } else if (tier === 'C') {
    advice = `Below peer benchmark. Fix the weak foundation first: ${DIM_LABELS[botDim[0]].name.toLowerCase()} sits at ${botDim[1]}/100 and drags every other metric. Once baseline quality stabilizes, ${DIM_LABELS[topDim[0]].name.toLowerCase()} (${topDim[1]}/100) is the right pillar to accelerate.`
  } else if (tier === 'D') {
    advice = `Multiple weak dimensions. Do not chase monetization yet — rebuild content basics around ${DIM_LABELS[topDim[0]].name.toLowerCase()} (the only signal with upside, currently ${topDim[1]}/100), then systematically address ${DIM_LABELS[botDim[0]].name.toLowerCase()} (${botDim[1]}/100) before pitching any partnerships.`
  } else {
    advice = `Currently too weak for brand work. Niche down aggressively and rebuild: identify what small audience actually connects with your content, then focus every video on improving ${DIM_LABELS[botDim[0]].name.toLowerCase()} (${botDim[1]}/100) before anything else.`
  }

  return { verdict, advice }
}

export interface SummaryInput {
  profile: { nickname: string; followerCount: number }
  dims: DimensionScores
  metrics: Metrics
  tier: string
  tierReason: string
  categories: string[]
  percentile: number
  businessValueMid: number
}

export function buildSummary(input: SummaryInput): ReportSummary {
  const { dims, tier, metrics, categories, percentile, businessValueMid } = input
  const strengths: string[] = []
  const weaknesses: string[] = []

  const sorted = (Object.entries(dims) as [keyof DimensionScores, number][]).sort((a, b) => b[1] - a[1])

  // 1) 严格阈值优先（≥65 = 强优势，≤48 = 明显弱点）
  for (let i = 0; i < sorted.length && strengths.length < 3; i++) {
    const [key, val] = sorted[i]
    if (val >= 65) {
      strengths.push(`${DIM_LABELS[key].strength} (${val}/100)`)
    }
  }
  for (let i = sorted.length - 1; i >= 0 && weaknesses.length < 3; i--) {
    const [key, val] = sorted[i]
    if (val <= 48) {
      weaknesses.push(`${DIM_LABELS[key].weakness} (${val}/100)`)
    }
  }

  // 2) Fallback 兜底：保证 strengths 至少 2 个、weaknesses 至少 2 个（中等账号不再空白）
  //    从剩余已排序项中按相对位置抓取（相对优势 / 相对劣势）
  for (let i = 0; i < sorted.length && strengths.length < 2; i++) {
    const [key, val] = sorted[i]
    const already = strengths.some(s => s.startsWith(DIM_LABELS[key].strength))
    if (!already) strengths.push(`${DIM_LABELS[key].strength} (${val}/100)`)
  }
  for (let i = sorted.length - 1; i >= 0 && weaknesses.length < 2; i--) {
    const [key, val] = sorted[i]
    const already = weaknesses.some(s => s.startsWith(DIM_LABELS[key].weakness))
    if (!already) weaknesses.push(`${DIM_LABELS[key].weakness} (${val}/100)`)
  }

  // 3) 去重（极端情况下 sorted 仅有 1 个键的边界保护）
  const seenS = new Set<string>()
  const finalStrengths = strengths.filter(s => { const k = s.split(' (')[0]; if (seenS.has(k)) return false; seenS.add(k); return true })
  const seenW = new Set<string>()
  const finalWeaknesses = weaknesses.filter(s => { const k = s.split(' (')[0]; if (seenW.has(k)) return false; seenW.add(k); return true })

  // targetAudience：描述「看这个账号的人是谁」（Spec v2 创作者视角），而非给两类人的建议
  const catLabel0 = categories.length ? categories.slice(0, 2).join(' & ') : 'general lifestyle'
  const engWord = metrics.engagementRate >= 6 ? 'highly engaged' : metrics.engagementRate >= 3 ? 'engaged' : 'casual'
  let targetAudience: string
  if (tier === 'S' || tier === 'A') {
    targetAudience = `${engWord.charAt(0).toUpperCase() + engWord.slice(1)} viewers interested in ${catLabel0.toLowerCase()} — an audience brands pay premium rates to reach`
  } else if (tier === 'B') {
    targetAudience = `${engWord.charAt(0).toUpperCase() + engWord.slice(1)} viewers interested in ${catLabel0.toLowerCase()} — solid fit for mid-budget brand campaigns`
  } else if (tier === 'C') {
    targetAudience = `Viewers interested in ${catLabel0.toLowerCase()} — engagement is still building, so focus on audience growth before pitching brands`
  } else if (tier === 'D') {
    targetAudience = `A small, early audience interested in ${catLabel0.toLowerCase()} — fix content and account issues before monetizing`
  } else {
    targetAudience = `A very small audience with weak engagement — rebuild your content niche before thinking about monetization`
  }

  let bestAction = ''
  if (finalWeaknesses.length > 0 && (finalStrengths.length === 0 || dims.monetization < 40 || finalWeaknesses[0].includes('Poor account health'))) {
    bestAction = `Priority fix: ${finalWeaknesses[0].split(' (')[0]}`
  } else if (metrics.engagementRate < 2) {
    bestAction = 'Optimize first-3-second hook and comment prompts to boost engagement before monetizing'
  } else if (dims.monetization < 40) {
    bestAction = 'Consistently publish niche content to reach key monetization thresholds'
  } else if (metrics.playGrowth > 20 && metrics.engagementRate >= 3) {
    bestAction = 'Your account is trending up — accelerate posting and explore new revenue streams while momentum lasts'
  } else if (finalStrengths.length > 0 && finalWeaknesses.length > 0) {
    const topPillar = (Object.keys(dims) as (keyof DimensionScores)[]).sort((a, b) => dims[b] - dims[a])[0]
    const botPillar = (Object.keys(dims) as (keyof DimensionScores)[]).sort((a, b) => dims[a] - dims[b])[0]
    bestAction = `Double down on ${DIM_LABELS[topPillar].name.toLowerCase()} as your premium lever, while lifting ${DIM_LABELS[botPillar].name.toLowerCase()} to close the gap`
  } else {
    bestAction = 'Maintain current cadence, focus on improving content quality and brand alignment'
  }

  const catLabel = categories.length ? categories.slice(0, 2).join('/') : 'General Lifestyle'
  const bvFormatted = businessValueMid >= 1_000_000
    ? `$${(businessValueMid / 1_000_000).toFixed(1)}M`
    : businessValueMid >= 1_000
    ? `$${(businessValueMid / 1_000).toFixed(0)}K`
    : `$${Math.round(businessValueMid)}`
  // percentile 语义 = 超过同龄组百分之多少（66 → 优于 66% 同行，即 Top 34%）
  const headline = `${catLabel} creator, ${bvFormatted} estimated account value — performs better than ${percentile}% of similar accounts`

  return { headline, strengths: finalStrengths, weaknesses: finalWeaknesses, targetAudience, bestAction }
}