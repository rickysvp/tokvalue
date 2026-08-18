import { RawProfile, DimensionScores, Metrics, Post } from '../../types'
import { ClassifiedPost, calcMaturePlayCV } from './metrics'
import {
  RISK_THRESHOLDS,
  COMMERCE_INTENT_KEYWORDS,
  MONETIZATION_THRESHOLDS,
  POSTING_ACTIVITY,
  TIER_ER_BENCHMARK,
  TIER_CV_BENCHMARK,
  getPeerBenchmarks,
  clamp,
} from './config'
import { getFollowerTier, FollowerTier } from './valuation'

// ========== 辅助：tier → 基准参数 ==========

/** 层级 × 预期 playFanRatio（正常范围中值） */
const TIER_PLAY_FAN_BENCHMARK: Record<FollowerTier, number> = {
  nano: 0.8,
  micro: 0.5,
  mid: 0.35,
  macro: 0.25,
  mega: 0.15,
}

/** 层级 × 商业/品牌基础分（即使没有 explicit 商业关键词，大号也有品牌价值） */
const TIER_COMMERCE_BASELINE: Record<FollowerTier, number> = {
  nano: 0,
  micro: 10,
  mid: 20,
  macro: 45,
  mega: 70,
}

/** 层级 × 变现基础分（大号天然具备所有变现条件） */
const TIER_MONETIZATION_BASELINE: Record<FollowerTier, number> = {
  nano: 0,
  micro: 10,
  mid: 25,
  macro: 50,
  mega: 70,
}

/** 层级 × 健康基础分（大号基础更稳固） */
const TIER_HEALTH_BASELINE: Record<FollowerTier, number> = {
  nano: 50,
  micro: 55,
  mid: 60,
  macro: 75,
  mega: 88,
}

/** 层级 × 影响力基础分 */
const TIER_INFLUENCE_BASELINE: Record<FollowerTier, number> = {
  nano: 30,
  micro: 40,
  mid: 50,
  macro: 70,
  mega: 90,
}

/**
 * 层级评分映射：将"与同层级基准的偏差"映射为 0-100 分
 * 基准分按 tier 差异化：nano 55, micro 58, mid 60, macro 65, mega 72
 * ratio = 1.0 → 基准分，ratio = 2.0 → 基准分+25，ratio = 0.5 → 基准分-25
 */
function scoreFromRatio(ratio: number, tier: FollowerTier): number {
  const baseline = tier === 'mega' ? 72 : tier === 'macro' ? 65 : tier === 'mid' ? 60 : tier === 'micro' ? 58 : 55
  const raw = baseline + (ratio - 1.0) * 25
  return clamp(raw, 0, 100)
}

// ========== 维度评分函数 ==========

export function scoreReach(
  followerCount: number,
  effectiveAvgPlays: number
): number {
  const tier = getFollowerTier(followerCount)
  const benchmark = TIER_PLAY_FAN_BENCHMARK[tier]
  const playFanRatio = followerCount > 0 ? effectiveAvgPlays / followerCount : 0

  // 100% 基于播放粉比 — 粉丝数不再提供地板，reach 完全反映真实触达能力
  const ratio = playFanRatio / Math.max(benchmark, 0.01)
  return Math.round(scoreFromRatio(ratio, tier))
}

export function scoreEngagement(
  maturePosts: ClassifiedPost[],
  growingPosts: ClassifiedPost[],
  followerCount: number,
  engagementRateOverride?: number
): number {
  const relevant = [...maturePosts, ...growingPosts]
  if (!relevant.length) return 0

  let totalPlays = 0, totalLikes = 0, totalComments = 0, totalInteractions = 0
  for (const { post } of relevant) {
    if (post.playCount > 0) {
      totalPlays += post.playCount
      totalLikes += post.likeCount || 0
      totalComments += post.commentCount || 0
      totalInteractions += (post.likeCount || 0) + (post.commentCount || 0) + (post.shareCount || 0)
    }
  }
  if (totalPlays <= 0) return 0
  // 统一口径：小样本（<3 条 mature+growing）时用外部传入的全量互动率，避免冷启动帖互动率失真
  const er = engagementRateOverride !== undefined && relevant.length < 3
    ? engagementRateOverride
    : (totalInteractions / totalPlays) * 100

  const tier = getFollowerTier(followerCount)
  const benchmark = TIER_ER_BENCHMARK[tier]

  // 用层级基准归一化
  const ratio = er / Math.max(benchmark, 0.1)
  const baseScore = scoreFromRatio(ratio, tier)

  // 评论深度加成（评论/点赞比）
  const commentLikeRatio = totalLikes > 0 ? totalComments / totalLikes : 0
  const depthBonus = clamp(commentLikeRatio * 100, 0, 10)

  return Math.round(clamp(baseScore + depthBonus, 0, 100))
}

export function scoreContent(
  profile: RawProfile,
  metrics: Metrics
): number {
  const { effectiveAvgPlays, effectivePeakPlays, cvPlays } = metrics
  if (!profile.posts.length || effectiveAvgPlays <= 0) return 0

  const tier = getFollowerTier(profile.followerCount)
  const pfBenchmark = TIER_PLAY_FAN_BENCHMARK[tier]
  const cvBenchmark = TIER_CV_BENCHMARK[tier]

  // 1. 表现基线：用层级基准归一化播放/粉丝比
  const playFanRatio = profile.followerCount > 0 ? effectiveAvgPlays / profile.followerCount : 0
  const ratio = playFanRatio / Math.max(pfBenchmark, 0.01)
  const performanceScore = scoreFromRatio(ratio, tier)

  // 2. 内容一致性：用层级基准归一化 CV
  const cvRatio = cvBenchmark / Math.max(cvPlays, 0.01)
  const consistencyScore = scoreFromRatio(cvRatio, tier)

  // 3. 垂直度：hashtag 集中度（mega/macro 账号不惩罚多样化内容）
  const tagCounts: Record<string, number> = {}
  let totalTags = 0
  for (const post of profile.posts) {
    const tags = (post.desc || '').match(/#[\w\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]+/g) || []
    for (const tag of tags) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1
      totalTags += 1
    }
  }
  let verticality = 0
  if (totalTags) {
    const maxTag = Math.max(...Object.values(tagCounts))
    verticality = maxTag / totalTags * 100
  }
  // 移除 mega/macro 硬地板 — 垂直度完全由实际 hashtag 集中度决定

  // 4. 爆款能力：峰值/均值比
  const breakoutRatio = effectivePeakPlays / Math.max(effectiveAvgPlays, 1)
  const breakoutScore = clamp((breakoutRatio - 1) / 4 * 100, 0, 100)
  // 移除 mega/macro 硬地板 — 爆款能力完全由实际数据决定

  return Math.round(
    performanceScore * 0.30 +
    consistencyScore * 0.25 +
    verticality * 0.25 +
    breakoutScore * 0.20
  )
}

export function scoreAuthenticity(
  followerCount: number,
  followingCount: number,
  engagementRate: number,
  maturePosts: ClassifiedPost[]
): number {
  const tier = getFollowerTier(followerCount)
  const frRatio = followerCount / Math.max(followingCount, 1)
  const clampedRatio = clamp(frRatio, 0.05, 50)
  let score = ((clampedRatio - 0.05) / (50 - 0.05)) * 100

  // followingCount=0 时可能误判满分
  if (followingCount === 0 && followerCount > 100) score -= 20

  // 流量波动惩罚
  if (maturePosts.length >= 3) {
    const cv = calcMaturePlayCV(maturePosts)
    if (cv > 2.0) score -= 20
    else if (cv > 1.5) score -= 10
  }

  // 层级化互动率真实度检测
  const benchmark = TIER_ER_BENCHMARK[tier]
  if (engagementRate < benchmark * 0.3) score -= 35
  else if (engagementRate < benchmark * 0.5) score -= 20

  // 粉关比异常
  if (frRatio < 0.5) score -= 30
  else if (frRatio < 1.0) score -= 15

  return Math.round(clamp(score, 0, 100))
}

export function scoreMomentum(playGrowth: number, followerCount: number): number {
  const tier = getFollowerTier(followerCount)
  // 大号增长天然慢，0% 增长不应惩罚
  const neutralBase = tier === 'mega' ? 75 : tier === 'macro' ? 70 : 60
  // playGrowth 是小数（0.2 = 20%），乘以 80 得到合理的分数变化
  const growthBonus = playGrowth > 0
    ? Math.min(playGrowth * 80, 25)
    : Math.max(playGrowth * 50, -40)
  return Math.round(clamp(neutralBase + growthBonus, 0, 100))
}

export function scoreStability(
  maturePosts: ClassifiedPost[],
  daysSinceLastPost: number,
  followerCount: number,
  effectiveAvgPlays: number,
  archiveCount: number = 0,
  recentPostCount: number = 0
): number {
  const tier = getFollowerTier(followerCount)
  const cvBenchmark = TIER_CV_BENCHMARK[tier]

  let cv = cvBenchmark
  if (maturePosts.length >= 3) {
    cv = calcMaturePlayCV(maturePosts)
  }

  // 用层级基准归一化
  const cvRatio = cvBenchmark / Math.max(cv, 0.01)
  let score = scoreFromRatio(cvRatio, tier)

  // 播放粉比惩罚：高粉低播账号稳定性额外扣分
  // playFanRatio < 0.05 → 扣 15-25 分（越低扣越多）
  const playFanRatio = followerCount > 0 ? effectiveAvgPlays / followerCount : 0
  if (playFanRatio < 0.05 && followerCount >= 100000) {
    // 比率越低，扣分越多：0.05→-15，0→-25
    const penalty = 15 + (1 - playFanRatio / 0.05) * 10
    score -= penalty
  }

  if (daysSinceLastPost > RISK_THRESHOLDS.inactiveDaysCritical) score -= 40
  else if (daysSinceLastPost > RISK_THRESHOLDS.inactiveDaysWarning) score -= 20

  // 发帖频率骤降：历史发帖 ≥ minArchiveForDormancy 但近 30 天 < dormantMaxRecentPosts → 断更
  // 稳定性差 — 老号停更/衰退，即使历史播放健康，也应扣分
  if (archiveCount >= POSTING_ACTIVITY.minArchiveForDormancy && recentPostCount < POSTING_ACTIVITY.dormantMaxRecentPosts) {
    score -= 25
  } else if (recentPostCount < POSTING_ACTIVITY.dormantMaxRecentPosts) {
    score -= 10
  }

  return Math.round(clamp(score, 0, 100))
}

const COMMERCIAL_CATEGORIES = new Set(['Fitness & Sports', 'fitness', 'Beauty & Skincare', 'beauty', 'Fashion & Style', 'fashion', 'Food & Cooking', 'food', 'Tech & Gadgets', 'tech', 'Finance & Investing', 'finance'])

/**
 * 播放粉比折损的 baseline 调整
 * 高粉低播账号（playFanRatio < 0.05 且粉丝 >= 10万）的 baseline 折损
 * playFanRatio 0.05 → 1.0x, 0 → 0.4x
 * 防止高粉低播账号因 baseline 虚高而获得不合理的评级
 */
function adjustBaselineByPlayFan(baseline: number, followerCount: number, effectiveAvgPlays: number): number {
  const playFanRatio = followerCount > 0 ? effectiveAvgPlays / followerCount : 0
  if (followerCount >= 100000 && playFanRatio < 0.05) {
    const factor = 0.4 + (playFanRatio / 0.05) * 0.6
    return baseline * factor
  }
  return baseline
}

export function scoreCommerce(posts: Post[], categories: string[], followerCount: number, effectiveAvgPlays: number = 0): number {
  const tier = getFollowerTier(followerCount)
  const baseline = adjustBaselineByPlayFan(TIER_COMMERCE_BASELINE[tier], followerCount, effectiveAvgPlays)
  if (!posts.length) return Math.round(baseline)

  // 关键词检测
  const enKeywords = COMMERCE_INTENT_KEYWORDS.en
  const zhKeywords = COMMERCE_INTENT_KEYWORDS.zh
  let hits = 0
  for (const post of posts) {
    const desc = (post.desc || '').toLowerCase()
    const isHit = enKeywords.some(w => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(desc))
      || zhKeywords.some(w => desc.includes(w.toLowerCase()))
    if (isHit) hits += 1
  }
  const hitRate = hits / posts.length
  const keywordScore = clamp(hitRate * 250, 0, 100)

  // 高商业化品类的额外加成
  const categoryBonus = categories.some(c => COMMERCIAL_CATEGORIES.has(c)) ? 25 : 0

  // 层级基础分：大号天然有品牌价值（受播放折损影响）
  return Math.round(clamp(keywordScore + categoryBonus + baseline, 0, 100))
}

export function scoreMonetization(
  followerCount: number,
  videoCount: number,
  effectiveAvgPlays: number,
  postsPerMonth: number,
  engagementRate: number
): number {
  const tier = getFollowerTier(followerCount)
  const monthlyViews = effectiveAvgPlays * postsPerMonth

  let score = adjustBaselineByPlayFan(TIER_MONETIZATION_BASELINE[tier], followerCount, effectiveAvgPlays)

  // 渐进式变现门槛加分
  if (followerCount >= MONETIZATION_THRESHOLDS.creatorFundFollowers && videoCount >= 10) score += 10
  if (
    followerCount >= MONETIZATION_THRESHOLDS.creativityBetaFollowers &&
    monthlyViews >= MONETIZATION_THRESHOLDS.creativityBetaMonthlyViews &&
    effectiveAvgPlays >= MONETIZATION_THRESHOLDS.creativityBetaPerVideoViews
  ) score += 15
  if (followerCount >= MONETIZATION_THRESHOLDS.tiktokShopFollowers) score += 8
  if (followerCount >= MONETIZATION_THRESHOLDS.subscriptionFollowers) score += 5
  if (followerCount >= MONETIZATION_THRESHOLDS.liveGiftFollowers) score += 5

  // 互动率加成（层级化）
  const benchmark = TIER_ER_BENCHMARK[tier]
  const erRatio = engagementRate / Math.max(benchmark, 0.1)
  score += clamp(erRatio * 10, 0, 15)

  return Math.round(clamp(score, 0, 100))
}

export function scoreHealth(
  followerCount: number,
  followingCount: number,
  metrics: Metrics
): number {
  const tier = getFollowerTier(followerCount)
  const { engagementRate, cvPlays, daysSinceLastPost } = metrics
  const erBenchmark = TIER_ER_BENCHMARK[tier]
  const cvBenchmark = TIER_CV_BENCHMARK[tier]

  let score = adjustBaselineByPlayFan(TIER_HEALTH_BASELINE[tier], followerCount, metrics.effectiveAvgPlays)

  // 层级化互动率健康检测
  if (engagementRate < erBenchmark * 0.3) score -= 25
  else if (engagementRate < erBenchmark * 0.5) score -= 15

  // 层级化 CV 检测
  if (cvPlays > cvBenchmark * 2.0) score -= 25
  else if (cvPlays > cvBenchmark * 1.5) score -= 15

  if (daysSinceLastPost > RISK_THRESHOLDS.inactiveDaysCritical) score -= 30
  else if (daysSinceLastPost > RISK_THRESHOLDS.inactiveDaysWarning) score -= 15

  const frRatio = followerCount / Math.max(followingCount, 1)
  if (frRatio < RISK_THRESHOLDS.followerFollowingCritical) score -= 30
  else if (frRatio < RISK_THRESHOLDS.followerFollowingWarning) score -= 15

  return Math.round(clamp(score, 0, 100))
}

export function scoreInfluence(
  followerCount: number,
  engagementRate: number,
  effectiveAvgPlays: number
): number {
  const tier = getFollowerTier(followerCount)
  const peers = getPeerBenchmarks(followerCount)
  const playsRatio = followerCount > 0 ? effectiveAvgPlays / followerCount : 0

  let score = adjustBaselineByPlayFan(TIER_INFLUENCE_BASELINE[tier], followerCount, effectiveAvgPlays)

  // 互动率 vs 同层级
  if (engagementRate >= peers.top10ER) score += 20
  else if (engagementRate >= peers.avgER) score += 10
  else if (engagementRate >= peers.avgER * 0.6) score += 0
  else score -= 10

  // 播放/粉丝比 vs 同层级
  if (playsRatio >= peers.avgPlaysRatio * 1.8) score += 20
  else if (playsRatio >= peers.avgPlaysRatio) score += 10
  else if (playsRatio >= peers.avgPlaysRatio * 0.5) score += 0
  else score -= 10

  return Math.round(clamp(score, 0, 100))
}

export interface ComputeDimsInput {
  profile: RawProfile
  metrics: Metrics
  classified: {
    mature: ClassifiedPost[]
    growing: ClassifiedPost[]
    archive: ClassifiedPost[]
  }
  postsPerMonth: number
  categories: string[]
}

export function computeDimensions(input: ComputeDimsInput): DimensionScores {
  const { profile, metrics, classified, postsPerMonth, categories } = input
  const followerCount = profile.followerCount

  return {
    reach: scoreReach(followerCount, metrics.effectiveAvgPlays),
    engagement: scoreEngagement(classified.mature, classified.growing, followerCount, metrics.engagementRate),
    content: scoreContent(profile, metrics),
    authenticity: scoreAuthenticity(followerCount, profile.followingCount, metrics.engagementRate, classified.mature),
    momentum: scoreMomentum(metrics.playGrowth / 100, followerCount),
    stability: scoreStability(classified.mature, metrics.daysSinceLastPost, followerCount, metrics.effectiveAvgPlays, classified.archive.length, classified.mature.length + classified.growing.length),
    commerce: scoreCommerce(profile.posts, categories, followerCount, metrics.effectiveAvgPlays),
    monetization: scoreMonetization(followerCount, profile.videoCount, metrics.effectiveAvgPlays, postsPerMonth, metrics.engagementRate),
    health: scoreHealth(followerCount, profile.followingCount, metrics),
    influence: scoreInfluence(followerCount, metrics.engagementRate, metrics.effectiveAvgPlays),
  }
}