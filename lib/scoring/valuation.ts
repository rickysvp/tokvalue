import {
  RawProfile, Metrics, DimensionScores, RiskFlag, Post,
  IncomeEstimate, IncomeSource, BusinessValue, BusinessValueComponent,
  RevenueRoadmap, RevenueMilestone, ContentCadence,
  CommerceReadiness, CommerceChannelFit, CommerceSignal, CommerceProductMatch,
} from '../../types'
import {
  CATEGORY_BRAND_CPM, CATEGORY_CREATOR_RPM, REGION_VALUE_MULTIPLIER,
  ENGAGEMENT_TIERS, CATEGORY_FAN_VALUE_MULT,
  INCOME_LOW_HIGH_FACTORS, MIN_BRAND_DEAL_PRICE,
  MONETIZATION_THRESHOLDS, GROWTH_RATE_PARAMS, clamp, getPeerBenchmarks,
  // 新增 tier 分层配置
  TIER_PREMIUM, BRAND_DEAL_LIMITS_BY_TIER, VIDEO_COUNT_CAP_BY_TIER,
  CONTENT_CPM_RATIO_BY_TIER, DISCOUNT_FACTOR_BY_TIER,
  FOLLOWER_BASE_RATE, FOLLOWER_POWER_LAW_EXPONENT,
  VALUATION_PERIOD_BY_TIER, CHANNEL_WEIGHTS,
  TIER_IP_MULTIPLE, MARKET_ANCHORS, MARKET_ANCHOR_CLAMP,
  PLAY_FAN_PENALTY, PLAY_FAN_FACTOR_CLAMP,
  MOMENTUM_PARAMS, GROWTH_MULTIPLIER_PARAMS, RISK_DISCOUNT, VERIFIED_MULTIPLIER,
  ENGAGEMENT_FACTOR, BRANDING_SIGNAL_KEYWORDS, BRANDING_SIGNAL_BONUS,
  // 保留旧配置（SUBSCRIPTION/SHOP/LIVE 用）
  SUBSCRIPTION_CONVERSION_RATES, SUBSCRIPTION_AVG_PRICE,
  SUBSCRIPTION_CREATOR_CUT, SHOP_OPERATIONAL_METRICS, LIVE_GIFT_MULTIPLIERS,
  // 带货专属渠道配置
  AMAZON_ASSOCIATES_METRICS, SHOPIFY_DTC_METRICS, LIVE_COMMERCE_METRICS,
  COMMERCE_INTENT_KEYWORDS,
} from './config'

export type FollowerTier = 'nano' | 'micro' | 'mid' | 'macro' | 'mega'

export function getFollowerTier(followers: number): FollowerTier {
  if (followers < 10000) return 'nano'
  if (followers < 100000) return 'micro'
  if (followers < 500000) return 'mid'
  if (followers < 1000000) return 'macro'
  return 'mega'
}

const CATEGORY_LABELS: Record<string, string> = {
  'Finance & Investing': 'Finance & Investing', 'finance': 'Finance & Investing',
  'Tech & Gadgets': 'Tech & Gadgets', 'tech': 'Tech & Gadgets',
  'Fitness & Sports': 'Fitness & Sports', 'fitness': 'Fitness & Sports', 'Combat Sports': 'Fitness & Sports',
  'Food & Cooking': 'Food & Cooking', 'food': 'Food & Cooking', 'cooking': 'Food & Cooking',
  'Travel': 'Travel', 'travel': 'Travel',
  'Gaming': 'Gaming', 'gaming': 'Gaming', 'games': 'Gaming',
  'Beauty & Skincare': 'Beauty & Skincare', 'beauty': 'Beauty & Skincare', 'makeup': 'Beauty & Skincare',
  'Fashion & Style': 'Fashion & Style', 'fashion': 'Fashion & Style',
  'Music & Dance': 'Music & Dance', 'music': 'Music & Dance', 'dance': 'Music & Dance',
  'Pets & Animals': 'Pets & Animals', 'pets': 'Pets & Animals',
  'Comedy': 'Comedy', 'comedy': 'Comedy', 'funny': 'Comedy',
  'Lifestyle': 'Lifestyle', 'lifestyle': 'Lifestyle',
  'Beauty & Lifestyle': 'Beauty & Lifestyle',
  'General Entertainment': 'General Entertainment', 'entertainment': 'General Entertainment',
  'default': 'General',
}

export function pickCategoryCpm(categories: string[]): { cpm: number; label: string } {
  for (const cat of categories) {
    const key = cat.toLowerCase()
    if (CATEGORY_BRAND_CPM[key] !== undefined) {
      return { cpm: CATEGORY_BRAND_CPM[key], label: CATEGORY_LABELS[key] || cat }
    }
    if (CATEGORY_BRAND_CPM[cat] !== undefined) {
      return { cpm: CATEGORY_BRAND_CPM[cat], label: CATEGORY_LABELS[cat] || cat }
    }
  }
  return { cpm: CATEGORY_BRAND_CPM.default, label: 'General' }
}

const REGION_LABELS: Record<string, string> = {
  'US': 'US', 'CA': 'Canada', 'UK': 'UK', 'AU': 'Australia',
  'DE': 'Germany', 'FR': 'France', 'IT': 'Italy', 'ES': 'Spain', 'NL': 'Netherlands',
  'SE': 'Sweden', 'CH': 'Switzerland', 'JP': 'Japan', 'KR': 'South Korea',
  'SG': 'Singapore', 'HK': 'Hong Kong', 'TW': 'Taiwan',
  'AE': 'UAE', 'SA': 'Saudi Arabia', 'IL': 'Israel',
  'BR': 'Brazil', 'MX': 'Mexico', 'AR': 'Argentina',
  'ID': 'Indonesia', 'TH': 'Thailand', 'VN': 'Vietnam', 'PH': 'Philippines', 'MY': 'Malaysia',
  'IN': 'India', 'PK': 'Pakistan', 'BD': 'Bangladesh',
  'RU': 'Russia', 'TR': 'Turkey', 'PL': 'Poland', 'CZ': 'Czech Republic',
  'ZA': 'South Africa', 'EG': 'Egypt', 'NG': 'Nigeria',
  'default': 'Global',
}

export function pickRegionMultiplier(region?: string): { mult: number; label: string } {
  const r = (region || 'default').toUpperCase()
  const mult = REGION_VALUE_MULTIPLIER[r] ?? REGION_VALUE_MULTIPLIER.default
  const label = REGION_LABELS[r] || REGION_LABELS.default
  return { mult, label }
}

export function getEngagementMultiplier(er: number): number {
  for (const tier of ENGAGEMENT_TIERS) {
    if (er >= tier.min) return tier.multiplier
  }
  return 0.7
}

// ========== 新增辅助函数（分层估值模型） ==========

/** 粉丝量 → tierPremium 系数 */
export function getTierPremium(followers: number): number {
  const tier = getFollowerTier(followers)
  return TIER_PREMIUM[tier] ?? 1.0
}

/** tier → videoCountCap */
export function getVideoCountCap(tier: FollowerTier): number {
  return VIDEO_COUNT_CAP_BY_TIER[tier] ?? 100
}

/** tier → contentCpmRatio */
export function getContentCpmRatio(tier: FollowerTier): number {
  return CONTENT_CPM_RATIO_BY_TIER[tier] ?? 0.3
}

/** tier → discountFactor */
export function getDiscountFactor(tier: FollowerTier): number {
  return DISCOUNT_FACTOR_BY_TIER[tier] ?? 0.3
}

/** tier → followerBaseRate */
export function getFollowerBaseRate(tier: FollowerTier): number {
  return FOLLOWER_BASE_RATE[tier] ?? 0.01
}

/** tier → valuationPeriod (月) */
export function getValuationPeriod(tier: FollowerTier): number {
  return VALUATION_PERIOD_BY_TIER[tier] ?? 6
}

/** tier + categories → 市场基准锚点（USD/条） */
export function getMarketAnchor(tier: FollowerTier, categories: string[]): number {
  const anchors = MARKET_ANCHORS[tier]
  if (!anchors) return 0
  for (const cat of categories) {
    const key = cat.toLowerCase()
    if (anchors[key] !== undefined) return anchors[key]
    if (anchors[cat] !== undefined) return anchors[cat]
  }
  return anchors.default ?? 0
}

/**
 * 粉丝分层单条报价上限锚点（USD/条，仅 nano/micro/mid 生效；macro/mega 走 MARKET_ANCHORS 夹紧）
 * cap = min(flatCap 分层封顶, per10KFollowers × followerCount / 10000)
 *
 * 锚点依据（行业公开报价行情的保守上沿 + 爆款容差，量纲与本文件 CPM × multiplier 体系对齐）：
 * - nano（<1万粉）：  市场行情 $50-800/条   → $3,500/万粉、封顶 $2,500（小号爆款粉比普遍 10x+，
 *                    公式输出相对粉丝规模偏高，线性项仅在极小粉丝量生效：3K 粉 ≈ $1,050）
 * - micro（1-10万粉）：市场行情 $200-3,000/条 → $2,100/万粉、封顶 $12,000（5 万粉 ≈ $10,500）
 * - mid（10-50万粉）： 市场行情 $1,000-10,000/条 → $1,200/万粉、封顶 $12,000（≥10 万粉即接近触顶）
 *
 * 修复背景（审计 Major）：报价公式 8 个乘数堆叠（CPM × tierPremium × erMult × region × momentum
 * × risk × verified），中腰部账号极端"播放 × 参与率"组合（如 20 万粉 + 千万级均播 + er≥15%）
 * 曾算出 $486K/条，超过 MrBeast 级锚点，造成估值倒挂。此上限只裁剪异常尾部：
 * 正常账号（粉比 ≤3x、互动率 3-9%）的公式输出远低于锚点，不受影响。
 */
const BRAND_DEAL_CAP_BY_TIER: Partial<Record<FollowerTier, { per10KFollowers: number; flatCap: number }>> = {
  nano: { per10KFollowers: 3500, flatCap: 2500 },
  micro: { per10KFollowers: 2100, flatCap: 12000 },
  mid: { per10KFollowers: 1200, flatCap: 12000 },
}

/** followerCount → 单条报价上限（USD）；macro/mega 返回 0（由 MARKET_ANCHORS 管） */
export function getBrandDealFollowerCap(tier: FollowerTier, followers: number): number {
  const cap = BRAND_DEAL_CAP_BY_TIER[tier]
  if (!cap || followers <= 0) return 0
  return Math.min(cap.flatCap, (cap.per10KFollowers * followers) / 10000)
}

/** playGrowth → momentumMultiplier */
export function calcMomentumMultiplier(playGrowth: number): number {
  if (playGrowth >= MOMENTUM_PARAMS.highGrowthThreshold) return MOMENTUM_PARAMS.highGrowthMultiplier
  if (playGrowth <= MOMENTUM_PARAMS.lowGrowthThreshold) return MOMENTUM_PARAMS.lowGrowthMultiplier
  return MOMENTUM_PARAMS.neutral
}

/** risks → riskDiscount */
export function calcRiskDiscount(risks: RiskFlag[]): number {
  const hasHigh = risks.some(r => r.level === 'high')
  const hasMedium = risks.some(r => r.level === 'medium')
  if (hasHigh) return RISK_DISCOUNT.high
  if (hasMedium) return RISK_DISCOUNT.medium
  return RISK_DISCOUNT.none
}

/** verified → verifiedMultiplier */
export function calcVerifiedMultiplier(verified?: boolean): number {
  return verified ? VERIFIED_MULTIPLIER : 1.0
}

/** engagementRate → engagementFactor（粉丝资产用，tier-aware） */
export function calcEngagementFactor(er: number, tier: FollowerTier): number {
  const thresholds = ENGAGEMENT_FACTOR.tiers[tier] ?? ENGAGEMENT_FACTOR.tiers.mid
  const factors = ENGAGEMENT_FACTOR.factors
  if (er >= thresholds.high) return factors.high
  if (er >= thresholds.good) return factors.good
  if (er >= thresholds.normal) return factors.normal
  return factors.low
}

/** playGrowth + tier → growthMultiplier（变现能力用） */
export function calcGrowthMultiplier(playGrowth: number, _tier: FollowerTier): number {
  if (playGrowth >= GROWTH_MULTIPLIER_PARAMS.highGrowthThreshold) return GROWTH_MULTIPLIER_PARAMS.highGrowthMultiplier
  if (playGrowth <= GROWTH_MULTIPLIER_PARAMS.lowGrowthThreshold) return GROWTH_MULTIPLIER_PARAMS.lowGrowthMultiplier
  return GROWTH_MULTIPLIER_PARAMS.neutral
}

/** top 10 视频平均播放 / 均播 > 10x 时额外加成 */
export function calcTopViralBonus(posts: Post[], avgPlays: number, _tier: FollowerTier): number {
  if (!posts.length || avgPlays <= 0) return 0
  const sorted = [...posts].sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
  const top10 = sorted.slice(0, 10)
  const topAvg = top10.reduce((s, p) => s + (p.playCount || 0), 0) / top10.length
  if (topAvg >= avgPlays * 10) {
    // 爆款账号额外 20% 加成（基于 grossValue，调用方计算）
    return 0.2
  }
  return 0
}

/** 播放粉比折损乘数（品牌报价用）
 * playFanRatio >= threshold → 1.0（无折损）
 * playFanRatio < threshold → 指数衰减，最低 minMultiplier
 * 高粉低播账号（如 1M 粉 + 3 万播放 = ratio 0.03）应被显著折损 */
export function calcPlayFanPenaltyMultiplier(playFanRatio: number): number {
  if (playFanRatio >= PLAY_FAN_PENALTY.threshold) return 1.0
  if (playFanRatio <= 0) return PLAY_FAN_PENALTY.minMultiplier
  // 差距：每低于阈值 0.05，乘一次 decayFactor
  const gap = (PLAY_FAN_PENALTY.threshold - playFanRatio) / 0.05
  const multiplier = Math.pow(PLAY_FAN_PENALTY.decayFactor, gap)
  return Math.max(multiplier, PLAY_FAN_PENALTY.minMultiplier)
}

/** 播放粉比因子（粉丝资产用）
 * playFanFactor = clamp(playFanRatio / tierBenchmark, min, max)
 * 高粉低播账号粉丝资产应反映真实触达能力
 * ratio = 1.0 → 1.0（达到层级基准），ratio < 1.0 → 折损到 min 0.3 */
export function calcPlayFanFactor(playFanRatio: number, tierBenchmark: number): number {
  const ratio = playFanRatio / Math.max(tierBenchmark, 0.01)
  return clamp(ratio, PLAY_FAN_FACTOR_CLAMP.min, PLAY_FAN_FACTOR_CLAMP.max)
}

/** 检测 bio/posts 中的品牌信号，返回加成系数（1.0-1.5） */
export function detectBrandingSignals(bio: string, posts: Post[], verified?: boolean): number {
  let bonus = 0
  const bioLower = (bio || '').toLowerCase()
  const postsText = posts.slice(0, 20).map(p => (p.desc || '').toLowerCase()).join(' ')

  const hasKeywords = (text: string, keywords: string[]): boolean =>
    keywords.some(kw => text.includes(kw.toLowerCase()))

  if (hasKeywords(bioLower, BRANDING_SIGNAL_KEYWORDS.founder)) bonus += BRANDING_SIGNAL_BONUS.founder
  if (hasKeywords(bioLower, BRANDING_SIGNAL_KEYWORDS.brand)) bonus += BRANDING_SIGNAL_BONUS.brand
  if (hasKeywords(bioLower, BRANDING_SIGNAL_KEYWORDS.crossPlatform)) bonus += BRANDING_SIGNAL_BONUS.crossPlatform
  if (hasKeywords(postsText, BRANDING_SIGNAL_KEYWORDS.product)) bonus += BRANDING_SIGNAL_BONUS.product
  if (verified) bonus += BRANDING_SIGNAL_BONUS.verified

  return 1.0 + Math.min(bonus, BRANDING_SIGNAL_BONUS.max)
}

/** IP/品牌资产价值（仅 macro/mega，基于品牌年收入的倍数模型）
 * 高粉低播账号 IP 资产应用播放折损 — IP 价值应反映真实影响力，而非虚高的粉丝数 */
export function calcIpBrandValue(
  brandDealAnnual: number,
  tier: FollowerTier,
  bio: string,
  posts: Post[],
  verified: boolean | undefined,
  risks: RiskFlag[],
  followers: number = 0,
  effectiveAvgPlays: number = 0,
): { value: number; detail: string } {
  if (tier !== 'macro' && tier !== 'mega') {
    return { value: 0, detail: 'IP asset value only applies to macro/mega tier accounts' }
  }

  const tierMultiple = TIER_IP_MULTIPLE[tier] ?? 0
  if (tierMultiple <= 0 || brandDealAnnual <= 0) {
    return { value: 0, detail: 'No IP asset (insufficient brand deal income or tier)' }
  }

  const brandingBonus = detectBrandingSignals(bio, posts, verified)
  const riskDiscount = calcRiskDiscount(risks)
  // 播放折损：高粉低播账号 IP 价值应反映真实触达能力
  const playFanRatio = followers > 0 ? effectiveAvgPlays / followers : 0
  const playPenaltyMult = calcPlayFanPenaltyMultiplier(playFanRatio)
  const value = Math.round(brandDealAnnual * tierMultiple * brandingBonus * riskDiscount * playPenaltyMult)
  const detail = `Brand Deal Annual $${Math.round(brandDealAnnual).toLocaleString()} × ${tier} IP multiple ${tierMultiple}x × Branding signals ${brandingBonus.toFixed(2)}x × Risk discount ${riskDiscount.toFixed(2)}x${playPenaltyMult < 1.0 ? ` × Play-Fan penalty ${playPenaltyMult.toFixed(2)}x` : ''}`

  return { value, detail }
}

// ========== 以下为修正后的 calc 函数 ==========

export interface BrandDealResult {
  perVideoLow: number
  perVideoMid: number
  perVideoHigh: number
  monthlyBrandPosts: number
  monthlyLow: number
  monthlyMid: number
  monthlyHigh: number
  detail: {
    cpm: number
    effectiveAvgPlays: number
    engagementMult: number
    regionMult: number
    monthlyBrandPosts: number
    tierPremium: number
    momentumMultiplier: number
    riskDiscount: number
    verifiedMultiplier: number
    marketAnchored: boolean
    /** 是否被粉丝分层报价上限锚点裁剪（nano/micro/mid 异常尾部） */
    followerCapAnchored: boolean
  }
}

export interface BrandDealInput {
  effectiveAvgPlays: number
  categoryCpm: number
  er: number
  regionMult: number
  postsPerMonth: number
  followers: number
  playGrowth: number
  risks: RiskFlag[]
  verified?: boolean
  categories: string[]
}

export function calcBrandDealValue(input: BrandDealInput): BrandDealResult {
  const { effectiveAvgPlays, categoryCpm, er, regionMult, postsPerMonth, followers, playGrowth, risks, verified, categories } = input
  const tier = getFollowerTier(followers)
  const tierPremium = getTierPremium(followers)
  const engagementMult = getEngagementMultiplier(er)
  const momentumMultiplier = calcMomentumMultiplier(playGrowth)
  const riskDiscount = calcRiskDiscount(risks)
  const verifiedMultiplier = calcVerifiedMultiplier(verified)

  let perVideoMid = (effectiveAvgPlays / 1000) * categoryCpm * tierPremium * engagementMult * regionMult * momentumMultiplier * riskDiscount * verifiedMultiplier

  // 粉丝分层报价上限锚点（nano/micro/mid）：裁剪"极端播放 × 极端参与率"组合的异常尾部报价
  // （如 20 万粉 + 千万级均播曾算出 $486K/条）；正常账号输出远低于锚点，不受影响。
  // 放在 mega/macro 市场锚点夹紧之前，与市场锚点同层级生效（两者按 tier 互斥）。
  let followerCapAnchored = false
  const followerCap = getBrandDealFollowerCap(tier, followers)
  if (followerCap > 0 && perVideoMid > followerCap) {
    perVideoMid = followerCap
    followerCapAnchored = true
  }

  // mega/macro 市场基准夹紧（先夹紧，再应用播放折损，避免折损被锚点下限覆盖）
  let marketAnchored = false
  if (tier === 'mega' || tier === 'macro') {
    const anchor = getMarketAnchor(tier, categories)
    if (anchor > 0) {
      const low = anchor * MARKET_ANCHOR_CLAMP.low
      const high = anchor * MARKET_ANCHOR_CLAMP.high
      if (perVideoMid < low || perVideoMid > high) {
        perVideoMid = Math.max(low, Math.min(perVideoMid, high))
        marketAnchored = true
      }
    }
  }

  // 播放折损系数：高粉低播账号品牌报价应反映真实触达能力
  // 在市场锚点夹紧之后应用，确保折损不被锚点下限覆盖
  const playFanRatio = followers > 0 ? effectiveAvgPlays / followers : 0
  const playPenaltyMult = calcPlayFanPenaltyMultiplier(playFanRatio)
  if (playPenaltyMult < 1.0) {
    perVideoMid *= playPenaltyMult
  }

  perVideoMid = Math.max(perVideoMid, MIN_BRAND_DEAL_PRICE)

  const limits = BRAND_DEAL_LIMITS_BY_TIER[tier] ?? { maxRatioOfMonthlyPosts: 0.3, maxPerMonth: 4 }
  const maxRatioPosts = postsPerMonth * limits.maxRatioOfMonthlyPosts
  let monthlyBrandPosts = Math.min(Math.round(maxRatioPosts), limits.maxPerMonth)
  monthlyBrandPosts = Math.max(monthlyBrandPosts, 0.5)

  const { low: lowFactor, high: highFactor } = INCOME_LOW_HIGH_FACTORS
  const perVideoLow = Math.max(perVideoMid * lowFactor, MIN_BRAND_DEAL_PRICE)
  const perVideoHigh = perVideoMid * highFactor

  return {
    perVideoLow: Math.round(perVideoLow),
    perVideoMid: Math.round(perVideoMid),
    perVideoHigh: Math.round(perVideoHigh),
    monthlyBrandPosts,
    monthlyLow: Math.round(perVideoLow * monthlyBrandPosts),
    monthlyMid: Math.round(perVideoMid * monthlyBrandPosts),
    monthlyHigh: Math.round(perVideoHigh * monthlyBrandPosts),
    detail: {
      cpm: categoryCpm,
      effectiveAvgPlays: Math.round(effectiveAvgPlays),
      engagementMult,
      regionMult,
      monthlyBrandPosts,
      tierPremium,
      momentumMultiplier,
      riskDiscount,
      verifiedMultiplier,
      marketAnchored,
      followerCapAnchored,
    },
  }
}

export interface SimpleIncomeResult {
  low: number
  mid: number
  high: number
  detail: string
}

export interface SubscriptionResult extends SimpleIncomeResult {
  eligible: boolean
}

export interface ShopResult extends SimpleIncomeResult {
  eligible: boolean
}

export function calcCreatorFundIncome(
  effectiveAvgPlays: number,
  postsPerMonth: number,
  region: string | undefined,
  _categories: string[]
): SimpleIncomeResult {
  const monthlyMatureViews = effectiveAvgPlays * postsPerMonth * 0.8
  const rpm = CATEGORY_CREATOR_RPM[(region || 'default').toUpperCase()] ?? CATEGORY_CREATOR_RPM.default
  const mid = (monthlyMatureViews / 1000) * rpm
  const { low, high } = INCOME_LOW_HIGH_FACTORS
  return {
    low: Math.round(mid * low),
    mid: Math.round(mid),
    high: Math.round(mid * high),
    detail: `Monthly mature views ${Math.round(monthlyMatureViews).toLocaleString()} × RPM $${rpm.toFixed(3)}`,
  }
}

export function calcSubscriptionIncome(
  followers: number,
  postsPerMonth: number
): SubscriptionResult {
  const eligible = followers >= MONETIZATION_THRESHOLDS.subscriptionFollowers && postsPerMonth >= 1
  if (!eligible) {
    return { low: 0, mid: 0, high: 0, eligible: false, detail: 'Not yet meeting Subscription threshold (1K+ followers)' }
  }
  const tier = getFollowerTier(followers)
  const convRate = SUBSCRIPTION_CONVERSION_RATES[tier]
  const activeSubs = followers * convRate * 0.3
  const mid = activeSubs * SUBSCRIPTION_AVG_PRICE * SUBSCRIPTION_CREATOR_CUT
  const { low, high } = INCOME_LOW_HIGH_FACTORS
  return {
    low: Math.round(mid * low),
    mid: Math.round(mid),
    high: Math.round(mid * high),
    eligible: true,
    detail: `Est. ${Math.round(activeSubs)} subscribers × $${SUBSCRIPTION_AVG_PRICE}/month (creator cut 50%)`,
  }
}

export function calcTikTokShopIncome(
  followers: number,
  categories: string[],
  engagementRate: number
): ShopResult {
  let shopConfig: { aov: number; commission: number; conversionRate: number } | null = null
  for (const cat of categories) {
    const key = cat.toLowerCase()
    if (SHOP_OPERATIONAL_METRICS[key]) { shopConfig = SHOP_OPERATIONAL_METRICS[key]; break }
    if (SHOP_OPERATIONAL_METRICS[cat]) { shopConfig = SHOP_OPERATIONAL_METRICS[cat]; break }
  }

  const eligible = followers >= MONETIZATION_THRESHOLDS.tiktokShopFollowers && shopConfig !== null
  if (!eligible || !shopConfig) {
    return { low: 0, mid: 0, high: 0, eligible: false, detail: shopConfig ? 'Follower count below Shop threshold (1K+)' : 'This niche is not suitable for TikTok Shop' }
  }

  const monthlyActiveFollowers = followers * 0.1
  const erFactor = clamp(engagementRate / 3, 0.5, 1.5)
  const orders = monthlyActiveFollowers * shopConfig.conversionRate * erFactor
  const mid = orders * shopConfig.aov * shopConfig.commission
  const { low, high } = INCOME_LOW_HIGH_FACTORS
  return {
    low: Math.round(mid * low),
    mid: Math.round(mid),
    high: Math.round(mid * high),
    eligible: true,
    detail: `Est. ${Math.round(orders)} orders/month × $${shopConfig.aov} AOV × ${(shopConfig.commission * 100).toFixed(0)}% commission`,
  }
}

export function calcLiveGiftIncome(
  followers: number,
  postsPerWeek: number
): SimpleIncomeResult {
  const liveFrequency = postsPerWeek * 0.3
  if (followers < MONETIZATION_THRESHOLDS.liveGiftFollowers || liveFrequency < 0.25) {
    return { low: 0, mid: 0, high: 0, detail: 'Not yet meeting LIVE gift stable income conditions' }
  }
  const tier = getFollowerTier(followers)
  const rate = LIVE_GIFT_MULTIPLIERS[tier] ?? LIVE_GIFT_MULTIPLIERS.default
  const mid = followers * rate * Math.min(liveFrequency, 4)
  const { low, high } = INCOME_LOW_HIGH_FACTORS
  return {
    low: Math.round(mid * low),
    mid: Math.round(mid),
    high: Math.round(mid * high),
    detail: `Based on ${tier} tier LIVE gift coefficient, avg ${liveFrequency.toFixed(1)} live sessions/month`,
  }
}

/** 检测带货 storefront / affiliate 信号强度（0-1） */
export function detectCommerceSignals(bio: string, posts: Post[]): { amazon: number; shopify: number; liveCommerce: number } {
  const bioLower = (bio || '').toLowerCase()
  const postsText = posts.slice(0, 20).map(p => (p.desc || '').toLowerCase()).join(' ')
  const text = `${bioLower} ${postsText}`

  const amazonSignals = ['amazon', 'affiliate', 'affiliate link', 'use my code', 'amazon finds', 'storefront', 'amazon storefront', '亚马逊', '好物清单']
  const shopifySignals = ['shopify', 'my store', 'my shop', 'own brand', 'flagship', '旗舰店', '我的店铺', '自有品牌', '独立站']
  const liveCommerceSignals = ['live shopping', 'live sale', 'tiktok shop live', '直播带货', '直播间', '带货直播', 'live commerce']

  const countHits = (signals: string[]): number => {
    let hits = 0
    for (const s of signals) {
      if (text.includes(s)) hits++
    }
    return Math.min(hits / 2, 1) // 2 个信号即满 1.0
  }

  return {
    amazon: countHits(amazonSignals),
    shopify: countHits(shopifySignals),
    liveCommerce: countHits(liveCommerceSignals),
  }
}

export interface AmazonAssociatesResult extends SimpleIncomeResult {
  eligible: boolean
}

/** Amazon Associates 联盟营销收入 */
export function calcAmazonAssociatesIncome(
  followers: number,
  categories: string[],
  engagementRate: number,
  commerceSignal: number
): AmazonAssociatesResult {
  const eligible = followers >= MONETIZATION_THRESHOLDS.amazonAssociatesFollowers
  if (!eligible) {
    return { low: 0, mid: 0, high: 0, eligible: false, detail: `Below Amazon Associates threshold (${MONETIZATION_THRESHOLDS.amazonAssociatesFollowers.toLocaleString()} followers)` }
  }

  let config = AMAZON_ASSOCIATES_METRICS.default
  for (const cat of categories) {
    const key = cat.toLowerCase()
    if (AMAZON_ASSOCIATES_METRICS[key]) { config = AMAZON_ASSOCIATES_METRICS[key]; break }
    if (AMAZON_ASSOCIATES_METRICS[cat]) { config = AMAZON_ASSOCIATES_METRICS[cat]; break }
  }

  const monthlyActiveFollowers = followers * 0.08
  const erFactor = clamp(engagementRate / 3, 0.5, 1.5)
  // 信号加成：无信号 0.4x（仍可做 affiliate），有强信号 1.0x
  const signalMultiplier = 0.4 + commerceSignal * 0.6
  const orders = monthlyActiveFollowers * config.conversionRate * erFactor * signalMultiplier
  const mid = orders * config.aov * config.commission
  const { low, high } = INCOME_LOW_HIGH_FACTORS
  return {
    low: Math.round(mid * low),
    mid: Math.round(mid),
    high: Math.round(mid * high),
    eligible: true,
    detail: `Est. ${Math.round(orders)} orders/mo × $${config.aov} AOV × ${(config.commission * 100).toFixed(1)}% commission (signal ${signalMultiplier.toFixed(2)}x)`,
  }
}

export interface ShopifyDtcResult extends SimpleIncomeResult {
  eligible: boolean
}

/** Shopify DTC 自营电商收入（需 storefront 信号） */
export function calcShopifyDtcIncome(
  followers: number,
  categories: string[],
  engagementRate: number,
  commerceSignal: number
): ShopifyDtcResult {
  const eligible = followers >= MONETIZATION_THRESHOLDS.shopifyDtcFollowers && commerceSignal > 0
  if (!eligible) {
    const reason = followers < MONETIZATION_THRESHOLDS.shopifyDtcFollowers
      ? `Below DTC threshold (${MONETIZATION_THRESHOLDS.shopifyDtcFollowers.toLocaleString()} followers)`
      : 'No own-brand/storefront signal detected'
    return { low: 0, mid: 0, high: 0, eligible: false, detail: reason }
  }

  let config = SHOPIFY_DTC_METRICS.default
  for (const cat of categories) {
    const key = cat.toLowerCase()
    if (SHOPIFY_DTC_METRICS[key]) { config = SHOPIFY_DTC_METRICS[key]; break }
    if (SHOPIFY_DTC_METRICS[cat]) { config = SHOPIFY_DTC_METRICS[cat]; break }
  }

  const monthlyActiveFollowers = followers * 0.06
  const erFactor = clamp(engagementRate / 3, 0.5, 1.5)
  const signalMultiplier = 0.5 + commerceSignal * 0.5
  const orders = monthlyActiveFollowers * config.conversionRate * erFactor * signalMultiplier
  // DTC 收入 = 订单 × AOV × 利润率（creator 保留全额利润）
  const mid = orders * config.aov * config.margin
  const { low, high } = INCOME_LOW_HIGH_FACTORS
  return {
    low: Math.round(mid * low),
    mid: Math.round(mid),
    high: Math.round(mid * high),
    eligible: true,
    detail: `Est. ${Math.round(orders)} orders/mo × $${config.aov} AOV × ${(config.margin * 100).toFixed(0)}% margin (signal ${signalMultiplier.toFixed(2)}x)`,
  }
}

export interface LiveCommerceResult extends SimpleIncomeResult {
  eligible: boolean
}

/** 直播带货 GMV 佣金收入 */
export function calcLiveCommerceGmv(
  followers: number,
  categories: string[],
  engagementRate: number,
  postsPerWeek: number,
  commerceSignal: number
): LiveCommerceResult {
  const liveFrequency = postsPerWeek * 0.3
  const eligible = followers >= MONETIZATION_THRESHOLDS.liveCommerceFollowers && liveFrequency >= 0.5
  if (!eligible) {
    const reason = followers < MONETIZATION_THRESHOLDS.liveCommerceFollowers
      ? `Below live commerce threshold (${MONETIZATION_THRESHOLDS.liveCommerceFollowers.toLocaleString()} followers)`
      : 'Insufficient live frequency for commerce'
    return { low: 0, mid: 0, high: 0, eligible: false, detail: reason }
  }

  let config = LIVE_COMMERCE_METRICS.default
  for (const cat of categories) {
    const key = cat.toLowerCase()
    if (LIVE_COMMERCE_METRICS[key]) { config = LIVE_COMMERCE_METRICS[key]; break }
    if (LIVE_COMMERCE_METRICS[cat]) { config = LIVE_COMMERCE_METRICS[cat]; break }
  }

  const liveViewers = followers * config.viewerRate
  const erFactor = clamp(engagementRate / 3, 0.5, 1.5)
  const signalMultiplier = 0.6 + commerceSignal * 0.4
  const orders = liveViewers * config.conversionRate * erFactor * signalMultiplier * Math.min(liveFrequency, 4)
  const mid = orders * config.aov * config.commission
  const { low, high } = INCOME_LOW_HIGH_FACTORS
  return {
    low: Math.round(mid * low),
    mid: Math.round(mid),
    high: Math.round(mid * high),
    eligible: true,
    detail: `${Math.round(liveViewers).toLocaleString()} live viewers × ${(config.conversionRate * 100).toFixed(1)}% CR × $${config.aov} AOV × ${(config.commission * 100).toFixed(0)}% commission × ${Math.min(liveFrequency, 4).toFixed(1)} sessions/mo`,
  }
}

export interface ContentAssetResult {
  value: number
  detail: string
}

export interface ContentAssetInput {
  videoCount: number
  effectiveAvgPlays: number
  categoryCpm: number
  followers: number
  posts: Post[]
  risks: RiskFlag[]
}

export function calcContentAssetValue(input: ContentAssetInput): ContentAssetResult {
  const { videoCount, effectiveAvgPlays, categoryCpm, followers, posts, risks } = input
  const tier = getFollowerTier(followers)
  // 按 tier 限制 videoCount 上限，避免历史总视频 × 近期均播导致虚高
  const videoCountCap = getVideoCountCap(tier)
  const effectiveVideoCount = Math.min(videoCount, videoCountCap)
  // 按 tier 取内容 CPM 占品牌 CPM 的比例
  const contentCpmRatio = getContentCpmRatio(tier)
  const contentCpm = categoryCpm * contentCpmRatio
  // 按 tier 取折现率
  const discountFactor = getDiscountFactor(tier)
  const gross = effectiveVideoCount * (effectiveAvgPlays / 1000) * contentCpm
  // 爆款账号额外加成
  const viralBonus = calcTopViralBonus(posts, effectiveAvgPlays, tier)
  const grossWithBonus = gross * (1 + viralBonus)
  // 风险折损
  const riskDiscount = calcRiskDiscount(risks)
  const value = grossWithBonus * discountFactor * riskDiscount
  return {
    value: Math.round(value),
    detail: `${effectiveVideoCount} videos × Avg Plays ${Math.round(effectiveAvgPlays).toLocaleString()} × Content CPM $${contentCpm.toFixed(1)} × Discount Rate ${(discountFactor * 100).toFixed(0)}%${viralBonus > 0 ? ` × Viral Bonus +${(viralBonus * 100).toFixed(0)}%` : ''} × Risk Discount ${(riskDiscount * 100).toFixed(0)}%`,
  }
}

export interface FollowerAssetResult {
  value: number
  detail: string
}

export interface FollowerAssetInput {
  followers: number
  authenticityScore: number
  engagementRate: number
  categories: string[]
  risks: RiskFlag[]
  bio: string
  posts: Post[]
  verified?: boolean
  effectiveAvgPlays?: number
}

/**
 * 粉丝资产价值（幂律定价模型）
 * value = baseRate × realFollowers^0.85 × categoryMult × engagementFactor × riskDiscount × commercialProximityMult × playFanFactor
 * 幂律公式避免线性低估头部账号（1 亿粉线性计价 ≈ $5M，幂律计价 ≈ $30M+）
 * commercialProximityMult：无商业信号 → 0.6（折损），有信号 → 1.0-1.5（加成）
 * playFanFactor：高粉低播账号粉丝资产折损（clamp 0.3-1.5），反映真实触达能力
 */
export function calcFollowerAssetValue(input: FollowerAssetInput): FollowerAssetResult {
  const { followers, authenticityScore, engagementRate, categories, risks, bio, posts, verified, effectiveAvgPlays } = input
  const tier = getFollowerTier(followers)
  const realFollowers = followers * (authenticityScore / 100)
  const engagementFactor = calcEngagementFactor(engagementRate, tier)
  const riskDiscount = calcRiskDiscount(risks)

  let categoryMult = 1.0
  for (const cat of categories) {
    const key = cat.toLowerCase()
    const m = CATEGORY_FAN_VALUE_MULT[key] ?? CATEGORY_FAN_VALUE_MULT[cat]
    if (m && m > categoryMult) categoryMult = m
  }

  const brandingBonus = detectBrandingSignals(bio, posts, verified)
  // 商业接近度调整：无商业信号 → 0.6（折损），有信号 → 1.0-1.5（加成）
  const commercialProximityMult = brandingBonus <= 1.0 ? 0.6 : brandingBonus

  // 播放因子：高粉低播账号粉丝资产折损
  // playFanFactor = clamp(playFanRatio / peerBenchmark, 0.3, 1.5)
  const playFanRatio = followers > 0 && effectiveAvgPlays !== undefined ? effectiveAvgPlays / followers : 0
  const peerBenchmark = getPeerBenchmarks(followers).avgPlaysRatio
  const playFanFactor = effectiveAvgPlays !== undefined ? calcPlayFanFactor(playFanRatio, peerBenchmark) : 1.0

  const baseRate = getFollowerBaseRate(tier)
  // 幂律定价：value = base × realFollowers^0.85 × mult × factor × discount × commercialProximity × playFanFactor
  const value = baseRate * Math.pow(realFollowers, FOLLOWER_POWER_LAW_EXPONENT) * categoryMult * engagementFactor * riskDiscount * commercialProximityMult * playFanFactor

  return {
    value: Math.round(value),
    detail: `${Math.round(realFollowers).toLocaleString()} real followers × $${baseRate.toFixed(3)}/fan × ^${FOLLOWER_POWER_LAW_EXPONENT} power law × Category ${categoryMult.toFixed(1)}x × Engagement ${engagementFactor.toFixed(2)} × Risk ${riskDiscount.toFixed(2)} × Commercial Proximity ${commercialProximityMult.toFixed(2)}x × Play-Fan Factor ${playFanFactor.toFixed(2)}x`,
  }
}

export interface MonetizationCapResult {
  value: number
  detail: string
}

export interface MonetizationCapInput {
  channels: string[]
  monthlyIncomeMid: number
  followers: number
  playGrowth: number
  risks: RiskFlag[]
}

/**
 * 变现能力价值
 * value = Σ(channelWeight × monthlyMid) × valuationPeriod × growthMultiplier × riskDiscount
 * 层级估值周期：nano 4 月、micro 6 月、mid 12 月、macro 18 月、mega 24 月
 */
export function calcMonetizationCapability(input: MonetizationCapInput): MonetizationCapResult {
  const { channels, monthlyIncomeMid, followers, playGrowth, risks } = input
  const tier = getFollowerTier(followers)
  const valuationPeriod = getValuationPeriod(tier)
  const growthMultiplier = calcGrowthMultiplier(playGrowth, tier)
  const riskDiscount = calcRiskDiscount(risks)

  // 按渠道权重加权求和（CHANNEL_WEIGHTS 已在 config 定义）
  let weightedChannels = 0
  for (const ch of channels) {
    weightedChannels += CHANNEL_WEIGHTS[ch] ?? 0.3
  }
  // weightedChannels 为加权渠道数，月收入按此分摊
  const channelFactor = weightedChannels > 0 ? Math.min(weightedChannels, 3.0) : 0
  const value = channelFactor * monthlyIncomeMid * valuationPeriod * growthMultiplier * riskDiscount

  return {
    value: Math.round(value),
    detail: `${channelFactor.toFixed(1)} weighted channels × Monthly Income $${Math.round(monthlyIncomeMid).toLocaleString()} × ${valuationPeriod} month valuation period × Growth Multiplier ${growthMultiplier.toFixed(2)} × Risk Discount ${riskDiscount.toFixed(2)}`,
  }
}

export interface BuildIncomeInput {
  profile: RawProfile
  metrics: Metrics
  dims: DimensionScores
  categories: string[]
  cadence: ContentCadence
  risks: RiskFlag[]
}

export function buildIncomeEstimate(input: BuildIncomeInput): IncomeEstimate {
  const { profile, metrics, categories, cadence, risks } = input
  const { cpm: categoryCpm, label: categoryLabel } = pickCategoryCpm(categories)
  const { mult: regionMult, label: regionLabel } = pickRegionMultiplier(profile.region)
  const postsPerMonth = cadence.avgPostsPerWeek * 4.33

  const brand = calcBrandDealValue({
    effectiveAvgPlays: metrics.effectiveAvgPlays,
    categoryCpm,
    er: metrics.engagementRate,
    regionMult,
    postsPerMonth,
    followers: profile.followerCount,
    playGrowth: metrics.playGrowth,
    risks,
    verified: profile.verified,
    categories,
  })
  const fund = calcCreatorFundIncome(metrics.effectiveAvgPlays, postsPerMonth, profile.region, categories)
  const subs = calcSubscriptionIncome(profile.followerCount, postsPerMonth)
  const shop = calcTikTokShopIncome(profile.followerCount, categories, metrics.engagementRate)
  const live = calcLiveGiftIncome(profile.followerCount, cadence.avgPostsPerWeek)

  // 带货专属渠道（Amazon Associates / Shopify DTC / Live Commerce）
  const commerceSignals = detectCommerceSignals(profile.bio || '', profile.posts)
  const amazon = calcAmazonAssociatesIncome(profile.followerCount, categories, metrics.engagementRate, commerceSignals.amazon)
  const shopify = calcShopifyDtcIncome(profile.followerCount, categories, metrics.engagementRate, commerceSignals.shopify)
  const liveCommerce = calcLiveCommerceGmv(profile.followerCount, categories, metrics.engagementRate, cadence.avgPostsPerWeek, commerceSignals.liveCommerce)

  const fundEligible = profile.followerCount >= MONETIZATION_THRESHOLDS.creatorFundFollowers

  const breakdown: IncomeSource[] = [
    {
      source: 'brand_deals', label: 'Brand Sponsorships', icon: '💰',
      monthlyAmount: { low: brand.monthlyLow, mid: brand.monthlyMid, high: brand.monthlyHigh },
      percentage: 0,
      confidence: metrics.engagementRate >= 3 ? 'high' : 'medium',
      detail: `${categoryLabel} CPM $${categoryCpm} × Avg Plays ${Math.round(metrics.effectiveAvgPlays).toLocaleString()} × Engagement Factor ${brand.detail.engagementMult.toFixed(1)} × ${regionLabel} Multiplier ${regionMult.toFixed(2)} × Tier Premium ${brand.detail.tierPremium.toFixed(1)}x, ~${brand.monthlyBrandPosts} posts/month${brand.detail.marketAnchored ? ' (Market-Anchored)' : ''}${brand.detail.followerCapAnchored ? ' (Follower-Cap Anchored)' : ''}`,
    },
    {
      source: 'creator_program', label: 'Creator Program', icon: '🎬',
      monthlyAmount: { low: fund.low, mid: fund.mid, high: fund.high },
      percentage: 0,
      confidence: fundEligible ? 'medium' : 'low',
      detail: fundEligible ? fund.detail : 'Not yet meeting Creator Fund threshold (10K followers + 10 videos)',
    },
    {
      source: 'subscriptions', label: 'Subscriptions', icon: '⭐',
      monthlyAmount: { low: subs.low, mid: subs.mid, high: subs.high },
      percentage: 0,
      confidence: subs.eligible ? 'low' : 'low',
      detail: subs.detail,
    },
    {
      source: 'tiktok_shop', label: 'TikTok Shop', icon: '🛒',
      monthlyAmount: { low: shop.low, mid: shop.mid, high: shop.high },
      percentage: 0,
      confidence: shop.eligible ? 'medium' : 'low',
      detail: shop.detail,
    },
    {
      source: 'amazon_associates', label: 'Amazon Associates', icon: '📦',
      monthlyAmount: { low: amazon.low, mid: amazon.mid, high: amazon.high },
      percentage: 0,
      confidence: amazon.eligible ? (commerceSignals.amazon > 0 ? 'medium' : 'low') : 'low',
      detail: amazon.detail,
    },
    {
      source: 'shopify_dtc', label: 'Shopify DTC', icon: '🏷️',
      monthlyAmount: { low: shopify.low, mid: shopify.mid, high: shopify.high },
      percentage: 0,
      confidence: shopify.eligible ? 'medium' : 'low',
      detail: shopify.detail,
    },
    {
      source: 'live_commerce', label: 'Live Commerce', icon: '📺',
      monthlyAmount: { low: liveCommerce.low, mid: liveCommerce.mid, high: liveCommerce.high },
      percentage: 0,
      confidence: liveCommerce.eligible ? 'medium' : 'low',
      detail: liveCommerce.detail,
    },
    {
      source: 'live_gifts', label: 'LIVE Gifts', icon: '🎁',
      monthlyAmount: { low: live.low, mid: live.mid, high: live.high },
      percentage: 0,
      confidence: 'low',
      detail: live.detail,
    },
  ]

  const totalMid = breakdown.reduce((s, b) => s + b.monthlyAmount.mid, 0)
  if (totalMid > 0) {
    for (const b of breakdown) {
      b.percentage = Math.round((b.monthlyAmount.mid / totalMid) * 100)
    }
  }

  const monthlyTotal = {
    low: breakdown.reduce((s, b) => s + b.monthlyAmount.low, 0),
    mid: totalMid,
    high: breakdown.reduce((s, b) => s + b.monthlyAmount.high, 0),
  }

  const rpm = CATEGORY_CREATOR_RPM[(profile.region || 'default').toUpperCase()] ?? CATEGORY_CREATOR_RPM.default
  const summary = brand.monthlyMid > 0
    ? `Brand sponsorships are the primary revenue source (${categoryLabel} niche), estimated monthly income $${monthlyTotal.low.toLocaleString()} - $${monthlyTotal.high.toLocaleString()}, median $${monthlyTotal.mid.toLocaleString()}`
    : 'Account does not yet meet stable monetization criteria — prioritize improving engagement rate and follower count'

  return {
    monthlyTotal,
    breakdown,
    categoryCpm: Math.round(categoryCpm),
    categoryRpm: rpm,
    regionMultiplier: regionMult,
    categoryLabel,
    regionLabel,
    summary,
  }
}

export interface BuildValueInput {
  profile: RawProfile
  metrics: Metrics
  dims: DimensionScores
  categories: string[]
  income: IncomeEstimate
  risks: RiskFlag[]
}

export function buildBusinessValue(input: BuildValueInput): BusinessValue {
  const { profile, metrics, dims, categories, income, risks } = input
  const { cpm: categoryCpm } = pickCategoryCpm(categories)
  const effectiveCpm = income.categoryCpm || categoryCpm
  const brandDealsMid = income.breakdown.find(b => b.source === 'brand_deals')?.monthlyAmount.mid || 0
  const tier = getFollowerTier(profile.followerCount)

  const brandDealValue = brandDealsMid * 12
  const contentAsset = calcContentAssetValue({
    videoCount: profile.videoCount,
    effectiveAvgPlays: metrics.effectiveAvgPlays,
    categoryCpm: effectiveCpm,
    followers: profile.followerCount,
    posts: profile.posts,
    risks,
  })
  const followerAsset = calcFollowerAssetValue({
    followers: profile.followerCount,
    authenticityScore: dims.authenticity,
    engagementRate: metrics.engagementRate,
    categories,
    risks,
    bio: profile.bio || '',
    posts: profile.posts,
    verified: profile.verified,
    effectiveAvgPlays: metrics.effectiveAvgPlays,
  })
  // monCap 排除 brand_deals 渠道，避免与品牌合作年价值重复计价
  const nonBrandChannels = income.breakdown.filter(b => b.source !== 'brand_deals' && b.monthlyAmount.mid > 0).map(b => b.source)
  const nonBrandMonthlyMid = income.breakdown.filter(b => b.source !== 'brand_deals').reduce((s, b) => s + b.monthlyAmount.mid, 0)
  const monCap = calcMonetizationCapability({
    channels: nonBrandChannels,
    monthlyIncomeMid: nonBrandMonthlyMid,
    followers: profile.followerCount,
    playGrowth: metrics.playGrowth,
    risks,
  })
  // IP/品牌资产价值（仅 macro/mega 计入，基于品牌年收入倍数）
  const ipBrand = calcIpBrandValue(
    brandDealValue,
    tier,
    profile.bio || '',
    profile.posts,
    profile.verified,
    risks,
    profile.followerCount,
    metrics.effectiveAvgPlays,
  )

  const components: BusinessValueComponent[] = [
    {
      label: 'Brand Deal Annual Value', icon: '💰',
      amount: {
        low: Math.round(brandDealValue * INCOME_LOW_HIGH_FACTORS.low),
        mid: Math.round(brandDealValue),
        high: Math.round(brandDealValue * INCOME_LOW_HIGH_FACTORS.high),
      },
      percentage: 0,
      detail: `Monthly brand income $${Math.round(brandDealsMid).toLocaleString()} × 12 months`,
    },
    {
      label: 'Content Asset Value', icon: '🎬',
      amount: { low: Math.round(contentAsset.value * 0.6), mid: contentAsset.value, high: Math.round(contentAsset.value * 1.5) },
      percentage: 0,
      detail: contentAsset.detail,
    },
    {
      label: 'Follower Asset Value', icon: '👥',
      amount: { low: Math.round(followerAsset.value * 0.6), mid: followerAsset.value, high: Math.round(followerAsset.value * 1.5) },
      percentage: 0,
      detail: followerAsset.detail,
    },
    {
      label: 'Monetization Capability Value', icon: '⚡',
      amount: { low: Math.round(monCap.value * 0.6), mid: monCap.value, high: Math.round(monCap.value * 1.5) },
      percentage: 0,
      detail: monCap.detail,
    },
    {
      label: 'IP/Brand Asset Value', icon: '🏆',
      amount: { low: Math.round(ipBrand.value * 0.6), mid: ipBrand.value, high: Math.round(ipBrand.value * 1.5) },
      percentage: 0,
      detail: ipBrand.detail,
    },
  ]

  let totalMid = components.reduce((s, c) => s + c.amount.mid, 0)
  // 百分比基于 cap 前的原始组件占比（cap 仅影响显示的总估值，不改变相对比例）
  if (totalMid > 0) {
    for (const c of components) c.percentage = Math.round((c.amount.mid / totalMid) * 100)
  }
  // 全局 cap：总估值不超过品牌年收入的 30 倍（防止任何组件失控）
  // 高粉低播账号使用更严格的 cap（3 倍）— 真实触达能力远低于粉丝数暗示的价值
  const playFanRatio = profile.followerCount > 0 && metrics.effectiveAvgPlays > 0
    ? metrics.effectiveAvgPlays / profile.followerCount
    : 0
  const isLowPlayAccount = profile.followerCount >= 100000 && playFanRatio < 0.05
  const GLOBAL_CAP_MULTIPLE = isLowPlayAccount ? 3 : 30
  if (brandDealValue > 0) {
    const globalCap = brandDealValue * GLOBAL_CAP_MULTIPLE
    if (totalMid > globalCap) {
      totalMid = globalCap
    }
  }

  const totalLow = components.reduce((s, c) => s + c.amount.low, 0)
  let totalHigh = components.reduce((s, c) => s + c.amount.high, 0)
  // 对称 cap：totalHigh 同样受全局上限约束（按 high 区间系数放大），
  // 避免 mid 被 cap 而 high 端仍展示失控估值（报价锚点 clamp 后 brandDealValue 已回归合理基准）
  if (brandDealValue > 0) {
    const globalCapHigh = brandDealValue * GLOBAL_CAP_MULTIPLE * INCOME_LOW_HIGH_FACTORS.high
    if (totalHigh > globalCapHigh) {
      totalHigh = globalCapHigh
    }
  }

  const summary = totalMid >= 500000
    ? `Extremely high commercial value (median $${Math.round(totalMid).toLocaleString()}) — top-tier IP asset, brand partnerships + IP premium are the core value drivers`
    : totalMid >= 100000
    ? `High commercial value (median $${Math.round(totalMid).toLocaleString()}) — brand partnerships are the core value source, suitable for mid-to-large brand paid collaborations`
    : totalMid >= 10000
    ? `Moderate commercial value (median $${Math.round(totalMid).toLocaleString()}) — can generate revenue through brand partnerships and multi-channel monetization`
    : `Limited commercial value (median $${Math.round(totalMid).toLocaleString()}) — prioritize improving content quality and follower engagement`

  return {
    totalValue: { low: totalLow, mid: totalMid, high: totalHigh },
    components,
    summary,
  }
}

export interface BuildRoadmapInput {
  profile: RawProfile
  metrics: Metrics
  dims: DimensionScores
  risks: RiskFlag[]
  income: IncomeEstimate
}

export function buildRevenueRoadmap(input: BuildRoadmapInput): RevenueRoadmap {
  const { profile, metrics, dims, risks, income } = input
  const baseMid = income.monthlyTotal.mid
  const { playGrowthTransmission, baseGrowthMin, baseGrowthMax, engagementBonusPerPoint,
    engagementBonusMax, engagementBonusMin, highRiskPenalty, mediumRiskPenalty,
    scaleSuppressPerLog, monthlyGrowthMin, monthlyGrowthMax } = GROWTH_RATE_PARAMS

  const rawPlayGrowth = metrics.playGrowth / 100
  const baseGrowth = clamp(rawPlayGrowth * playGrowthTransmission, baseGrowthMin, baseGrowthMax)

  const erDelta = metrics.engagementRate - 3
  const engagementBonus = clamp(erDelta * engagementBonusPerPoint, engagementBonusMin, engagementBonusMax)

  const hasHighRisk = risks.some(r => r.level === 'high')
  const hasMediumRisk = risks.some(r => r.level === 'medium')
  const healthPenalty = hasHighRisk ? highRiskPenalty : hasMediumRisk ? mediumRiskPenalty : 0

  const logF = Math.log10(Math.max(profile.followerCount / 10000, 1))
  const scaleSuppress = logF * scaleSuppressPerLog

  let monthlyGrowth = baseGrowth + engagementBonus + healthPenalty + scaleSuppress
  monthlyGrowth = clamp(monthlyGrowth, monthlyGrowthMin, monthlyGrowthMax)

  const buildProj = (month: number): { low: number; mid: number; high: number } => {
    // baseMid=0 时不强制 $100 起步和正增长，避免虚增零收入账号预期
    const mid = baseMid > 0 ? baseMid * Math.pow(1 + monthlyGrowth, month) : 0
    const variance = clamp(metrics.cvPlays, 0.15, 0.5)
    return {
      low: Math.max(0, Math.round(mid * (1 - variance))),
      mid: Math.round(mid),
      high: Math.round(mid * (1 + variance)),
    }
  }

  const m3 = buildProj(3)
  const m6 = buildProj(6)
  const m12 = buildProj(12)

  const unlocksFor = (month: number): string[] => {
    const u: string[] = []
    if (month === 3) {
      u.push(dims.monetization < 40 ? 'Reach Creator Fund threshold (10K followers)' : 'Optimize brand partnership pricing')
      if (metrics.engagementRate < 3) u.push('Optimize first-3-second hook, boost engagement to 3%+')
      u.push('Establish consistent posting schedule')
    } else if (month === 6) {
      u.push(...(monthlyGrowth > 0.02 ? ['Secure first long-term brand deal', 'Explore LIVE/Shop'] : ['Stabilize brand partnership income', 'Build fan community']))
    } else if (month === 12) {
      if (monthlyGrowth > 0.03) u.push('Multi-platform content distribution', 'Own brand/product line')
      else if (monthlyGrowth > 0) u.push('Full-channel monetization maturity', 'Build passive income streams')
      else u.push('Reposition account direction', 'Experiment with new content niches')
    }
    return u
  }

  const milestoneLabel = (month: number): string => {
    if (monthlyGrowth > 0.05) return month === 3 ? 'Rapid Growth Phase' : month === 6 ? 'Revenue Doubling' : 'Full-Channel Maturity'
    if (monthlyGrowth > 0.02) return month === 3 ? 'Steady Growth Start' : month === 6 ? 'Diversification' : 'Stable Growth Phase'
    if (monthlyGrowth > 0) return month === 3 ? 'Foundation Building' : month === 6 ? 'Optimization' : 'Stable Output Phase'
    return month === 3 ? 'Issue Remediation' : month === 6 ? 'Pivot & Adjust' : 'Pivot or Exit'
  }

  const current = income.monthlyTotal
  const projections: RevenueMilestone[] = [
    { month: 3, label: '3 Months', revenue: m3, milestone: milestoneLabel(3), unlocks: unlocksFor(3) },
    { month: 6, label: '6 Months', revenue: m6, milestone: milestoneLabel(6), unlocks: unlocksFor(6) },
    { month: 12, label: '12 Months', revenue: m12, milestone: milestoneLabel(12), unlocks: unlocksFor(12) },
  ]

  const total12Month = {
    low: Math.round((current.low * 3 + m3.low * 3 + m6.low * 3 + m12.low * 3)),
    mid: Math.round((current.mid * 3 + m3.mid * 3 + m6.mid * 3 + m12.mid * 3)),
    high: Math.round((current.high * 3 + m3.high * 3 + m6.high * 3 + m12.high * 3)),
  }

  let summary = ''
  if (hasHighRisk) {
    summary = `Account has high-risk signals — current projections assume risk resolution. Without resolution, actual revenue may be 30-50% below forecast.`
  } else if (monthlyGrowth > 0.05) {
    summary = `Account is in a strong growth phase (monthly growth ~${(monthlyGrowth * 100).toFixed(0)}%), 12-month cumulative revenue estimated at $${total12Month.mid.toLocaleString()}. Seize the window to accelerate monetization.`
  } else if (monthlyGrowth > 0.02) {
    summary = `Account is growing healthily (monthly growth ~${(monthlyGrowth * 100).toFixed(0)}%), 12-month cumulative revenue estimated at $${total12Month.mid.toLocaleString()}. Continue optimizing at current pace.`
  } else if (monthlyGrowth > 0) {
    summary = `Account growth is slow (monthly growth ~${(monthlyGrowth * 100).toFixed(0)}%), need to actively expand monetization channels. 12-month cumulative revenue estimated at $${total12Month.mid.toLocaleString()}.`
  } else {
    summary = `Account is experiencing downward pressure (~${(monthlyGrowth * 100).toFixed(0)}% monthly), projections based on recovery path after optimization measures.`
  }

  return {
    currentMonthly: current,
    projections,
    total12Month,
    summary,
  }
}

// ========== Commerce Readiness (带货能力分析) ==========

/** 品类 → 推荐带货商品品类映射 */
const CATEGORY_PRODUCT_MAP: Record<string, { category: string; icon: string; aov: number }[]> = {
  'shopping & deals': [
    { category: 'Home & Kitchen', icon: '🏠', aov: 35 },
    { category: 'Tech Gadgets', icon: '📱', aov: 65 },
    { category: 'Beauty & Personal Care', icon: '💄', aov: 25 },
  ],
  'beauty & skincare': [
    { category: 'Skincare Sets', icon: '🧴', aov: 32 },
    { category: 'Makeup Collections', icon: '💄', aov: 24 },
    { category: 'Beauty Tools', icon: '✨', aov: 38 },
  ],
  'tech & gadgets': [
    { category: 'Smart Home', icon: '📱', aov: 85 },
    { category: 'Accessories', icon: '🔌', aov: 28 },
    { category: 'Audio Gear', icon: '🎧', aov: 95 },
  ],
  'fashion & style': [
    { category: 'Apparel', icon: '👗', aov: 42 },
    { category: 'Accessories', icon: '👜', aov: 35 },
    { category: 'Footwear', icon: '👟', aov: 58 },
  ],
  'fitness & sports': [
    { category: 'Supplements', icon: '💊', aov: 38 },
    { category: 'Workout Gear', icon: '🏋️', aov: 48 },
    { category: 'Recovery Tools', icon: '🧘', aov: 42 },
  ],
  'food & cooking': [
    { category: 'Kitchen Tools', icon: '🍳', aov: 32 },
    { category: 'Gourmet Food', icon: '🍜', aov: 28 },
    { category: 'Cookware', icon: '🥘', aov: 55 },
  ],
  'lifestyle': [
    { category: 'Home Decor', icon: '🛋️', aov: 45 },
    { category: 'Self-Care', icon: '🧖', aov: 30 },
    { category: 'Organization', icon: '📦', aov: 28 },
  ],
  'default': [
    { category: 'Lifestyle Products', icon: '🛍️', aov: 35 },
    { category: 'Trending Items', icon: '🔥', aov: 30 },
    { category: 'Seasonal Picks', icon: '🎄', aov: 32 },
  ],
}

export interface BuildCommerceReadinessInput {
  profile: RawProfile
  metrics: Metrics
  categories: string[]
  income: IncomeEstimate
  cadence: ContentCadence
  dims: DimensionScores
}

export function buildCommerceReadiness(input: BuildCommerceReadinessInput): CommerceReadiness {
  const { profile, metrics, categories, income, dims } = input

  // 1. 检测带货信号
  const commerceSignals = detectCommerceSignals(profile.bio || '', profile.posts)

  // 2. 计算带货内容占比
  const allCommerceKeywords = [
    ...COMMERCE_INTENT_KEYWORDS.en,
    ...COMMERCE_INTENT_KEYWORDS.zh,
  ]
  const postsWithCommerce = profile.posts.filter(p => {
    const desc = (p.desc || '').toLowerCase()
    return allCommerceKeywords.some(kw => desc.includes(kw.toLowerCase()))
  })
  const contentCommerceRatio = profile.posts.length > 0
    ? Math.round((postsWithCommerce.length / profile.posts.length) * 100)
    : 0

  // 3. 构建信号列表
  const isShoppingNiche = categories.some(c => {
    const k = c.toLowerCase()
    return k.includes('shopping') || k.includes('deals')
  })
  const signals: CommerceSignal[] = [
    {
      label: 'Storefront / Affiliate Links',
      detected: commerceSignals.amazon > 0 || commerceSignals.shopify > 0,
      weight: Math.max(commerceSignals.amazon, commerceSignals.shopify),
      detail: commerceSignals.amazon > 0 || commerceSignals.shopify > 0
        ? 'Amazon storefront / Shopify store / affiliate links detected in bio or recent posts'
        : 'No storefront or affiliate links detected — add to bio to boost commerce signal',
    },
    {
      label: 'Commerce Intent Keywords',
      detected: contentCommerceRatio > 10,
      weight: Math.min(contentCommerceRatio / 30, 1),
      detail: `${contentCommerceRatio}% of posts contain commerce intent keywords (haul, deals, must-have, link in bio, etc.)`,
    },
    {
      label: 'Live Commerce Activity',
      detected: commerceSignals.liveCommerce > 0,
      weight: commerceSignals.liveCommerce,
      detail: commerceSignals.liveCommerce > 0
        ? 'Live shopping / live commerce signals detected in content'
        : 'No live commerce signals detected',
    },
    {
      label: 'Shopping & Deals Niche',
      detected: isShoppingNiche,
      weight: isShoppingNiche ? 1 : 0.3,
      detail: isShoppingNiche
        ? 'Account classified as Shopping & Deals niche — high commerce relevance'
        : 'Account is in a non-commerce niche — commerce fit depends on product alignment',
    },
    {
      label: 'Commerce Dimension Score',
      detected: dims.commerce >= 50,
      weight: Math.min(dims.commerce / 100, 1),
      detail: `Commerce readiness dimension scored ${dims.commerce}/100 in the 10-dimension assessment`,
    },
  ]

  // 4. 构建渠道矩阵
  const channelMeta: Record<string, { label: string; icon: string }> = {
    brand_deals: { label: 'Brand Sponsorships', icon: '💰' },
    creator_program: { label: 'Creator Program', icon: '🎬' },
    subscriptions: { label: 'Subscriptions', icon: '⭐' },
    tiktok_shop: { label: 'TikTok Shop', icon: '🛒' },
    amazon_associates: { label: 'Amazon Associates', icon: '📦' },
    shopify_dtc: { label: 'Shopify DTC', icon: '🏷️' },
    live_commerce: { label: 'Live Commerce', icon: '📺' },
    live_gifts: { label: 'LIVE Gifts', icon: '🎁' },
  }
  const commerceChannelIds = ['tiktok_shop', 'amazon_associates', 'shopify_dtc', 'live_commerce']

  const channels: CommerceChannelFit[] = income.breakdown.map(b => {
    const meta = channelMeta[b.source] || { label: b.label, icon: b.icon }
    const isCommerceChannel = commerceChannelIds.includes(b.source)

    let fitScore: number
    if (b.monthlyAmount.mid > 0) {
      const incomeScale = Math.min(Math.log10(b.monthlyAmount.mid + 1) * 25, 50)
      const confidenceBonus = b.confidence === 'high' ? 20 : b.confidence === 'medium' ? 12 : 5
      fitScore = Math.round(Math.min(incomeScale + confidenceBonus + (isCommerceChannel ? 18 : 0), 100))
    } else {
      fitScore = Math.round(Math.min(dims.commerce * 0.35 + (isCommerceChannel ? 10 : 0), 45))
    }

    const reasoning = b.monthlyAmount.mid > 0
      ? b.detail
      : (isCommerceChannel ? 'Below eligibility threshold for this commerce channel' : 'Limited direct commerce potential')

    return {
      source: b.source,
      label: meta.label,
      icon: meta.icon,
      monthlyAmount: b.monthlyAmount,
      fitScore,
      eligible: b.monthlyAmount.mid > 0,
      reasoning,
    }
  })

  // 5. 商品品类匹配
  let products = CATEGORY_PRODUCT_MAP.default
  for (const cat of categories) {
    const key = cat.toLowerCase()
    if (CATEGORY_PRODUCT_MAP[key]) { products = CATEGORY_PRODUCT_MAP[key]; break }
    if (CATEGORY_PRODUCT_MAP[cat]) { products = CATEGORY_PRODUCT_MAP[cat]; break }
  }
  const productMatches: CommerceProductMatch[] = products.map((p, i) => {
    const baseFit = 55 - i * 8
    const signalBoost = Math.round(
      (commerceSignals.amazon * 15) + (commerceSignals.shopify * 12) + (commerceSignals.liveCommerce * 10)
    )
    const erBoost = Math.min(Math.round(metrics.engagementRate * 3), 18)
    const nicheBoost = isShoppingNiche ? 10 : 0
    const fitScore = Math.min(baseFit + signalBoost + erBoost + nicheBoost, 100)
    return {
      category: p.category,
      icon: p.icon,
      fitScore,
      avgOrderValue: p.aov,
      reasoning: `Aligns with your ${categories[0] || 'content'} niche. Typical Amazon AOV ~$${p.aov}.`,
    }
  })

  // 6. 综合评分
  const signalScore = signals.reduce((s, sig) => s + (sig.detected ? sig.weight * 20 : 0), 0) / signals.length
  const commerceChannelScore = channels
    .filter(c => commerceChannelIds.includes(c.source))
    .reduce((s, c) => s + c.fitScore, 0) / commerceChannelIds.length
  const overallScore = Math.round(
    Math.min((signalScore * 0.4 + commerceChannelScore * 0.4 + contentCommerceRatio * 0.2), 100)
  )

  // 7. 等级
  const tier: CommerceReadiness['tier'] =
    overallScore >= 70 ? 'Commerce-Ready' :
    overallScore >= 40 ? 'Emerging' : 'Limited'

  // 8. summary
  const commerceIncome = income.breakdown
    .filter(b => commerceChannelIds.includes(b.source))
    .reduce((s, b) => s + b.monthlyAmount.mid, 0)
  const commerceIncomeRatio = income.monthlyTotal.mid > 0
    ? Math.round((commerceIncome / income.monthlyTotal.mid) * 100)
    : 0

  const summary = tier === 'Commerce-Ready'
    ? `Strong commerce readiness (score ${overallScore}/100). Commerce channels contribute ${commerceIncomeRatio}% of estimated income${commerceIncome > 0 ? ` — $${commerceIncome.toLocaleString()}/mo` : ''}. Account is well-positioned for direct product sales.`
    : tier === 'Emerging'
    ? `Emerging commerce potential (score ${overallScore}/100). ${contentCommerceRatio}% of content shows commerce intent. Optimize storefront signals and scale followers to unlock higher-tier commerce channels.`
    : `Limited commerce readiness (score ${overallScore}/100). Build audience trust first, then add commerce signals (storefront links, product-focused content) before pursuing direct sales.`

  // 9. recommendation
  const eligibleCommerceChannels = channels
    .filter(c => commerceChannelIds.includes(c.source) && c.eligible)
    .sort((a, b) => b.monthlyAmount.mid - a.monthlyAmount.mid)
  const topChannel = eligibleCommerceChannels[0]

  const recommendation = topChannel
    ? `Primary commerce opportunity: ${topChannel.label} (${topChannel.fitScore}% fit, est. $${topChannel.monthlyAmount.low.toLocaleString()}–$${topChannel.monthlyAmount.high.toLocaleString()}/mo). ${contentCommerceRatio < 20 ? 'Increase product-focused content to boost conversion rates.' : 'Maintain current commerce content cadence and expand product categories.'}`
    : profile.followerCount < 5000
    ? `Reach 5,000+ followers to unlock Amazon Associates affiliate revenue — your fastest path to commerce monetization.`
    : `No commerce channels eligible yet. Add storefront/affiliate links to your bio and increase commerce-focused content (hauls, product roundups, reviews) to signal commerce intent.`

  return {
    overallScore,
    tier,
    summary,
    channels,
    signals,
    productMatches,
    contentCommerceRatio,
    recommendation,
  }
}
