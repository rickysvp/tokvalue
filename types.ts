export interface Post {
  id: string
  playCount: number
  likeCount: number
  commentCount: number
  shareCount: number
  createTime: number
  desc?: string
}

export interface SearchUserResult {
  username: string
  nickname: string
  followerCount: number
  avatar: string
}

export interface RawProfile {
  username: string
  nickname: string
  followerCount: number
  followingCount: number
  totalLikes: number
  videoCount: number
  secUid: string
  region?: string
  avatar?: string
  bio?: string
  verified?: boolean
  language?: string
  posts: Post[]
  dataQuality?: 'full' | 'partial' | 'minimal'
  postsFetchError?: string
}

export interface DimensionScores {
  reach: number        // 流量触达力 — 粉丝规模 + 平均播放
  engagement: number   // 互动健康度 — 互动率 + 点赞/评论/分享配比
  content: number      // 内容爆款力 — 爆款/粉丝比 + 内容垂直度
  authenticity: number // 粉丝真实性 — 粉关比 + 互动真实性
  momentum: number     // 增长势能 — 近期 vs 早期播放增长
  stability: number    // 流量稳定性 — 播放CV + 断更风险
  commerce: number     // 商业适配度 — 带货意图 + 品牌匹配
  monetization: number // 变现潜力 — 满足门槛 + 预估收益
  health: number       // 账号健康度 — 限流风险 + 假粉比例
  influence: number    // 行业位势 — 同体量百分位 + 对标
}

export interface ReportSummary {
  headline: string            // 一句话总评
  strengths: string[]         // 核心优势 (2-3条)
  weaknesses: string[]        // 主要短板 (2-3条)
  targetAudience: string      // 适合谁来用这个号
  bestAction: string          // 最佳行动建议
}

export interface RiskFlag {
  level: 'high' | 'medium' | 'low'
  label: string
  detail: string
}

export interface AccountProfile {
  categories: string[]           // 内容分类标签，如 ["美妆护肤", "日更"]
  personaType: string            // 账号类型，如 "腰部创作者" / "头部达人" / "品牌号"
  postingRhythm: string          // 更新节奏，如 "日更" / "周更" / "不定期"
  audienceRegion: string         // 受众地区
  contentStyle: string           // 内容风格，如 "教程类" / "娱乐类" / "Vlog"
}

export interface Evaluation {
  username: string
  nickname: string
  score: number
  tier: 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
  summary: ReportSummary
  dimensions: DimensionScores
  metrics: Metrics
  riskFlags: RiskFlag[]
  verdict: string
  advice: string
  priceAdvice: string
  accountHealth: AccountHealth
  contentCadence: ContentCadence
  engagementQuality: EngagementQuality
  peerBenchmark: PeerBenchmark
  brandPotential: BrandPotential
  monetizationPath: MonetizationPath
  growthPlan: GrowthPlan
  incomeEstimate: IncomeEstimate
  businessValue: BusinessValue
  brandDealPerVideo?: {
    low: number
    mid: number
    high: number
    monthlyBrandPosts: number
  }
  accountProfile: AccountProfile
  revenueRoadmap: RevenueRoadmap
  contentStrategy: ContentStrategy
  peerRanking: PeerRanking
  brandMatching: BrandMatching
  trendAnalysis: TrendAnalysis
  commercializationAdvice: CommercializationAdvice
  commerceReadiness: CommerceReadiness
  computedAt: string
  mock?: boolean
  cached?: boolean
  avatar?: string
  avatarData?: string
  bio?: string
  followerCount: number
  followingCount: number
  totalLikes: number
  videoCount: number
  verified?: boolean
  region?: string
  posts?: Post[]
  formulaVersion?: 'v2'
  calculationMetadata?: CalculationMetadata
  dataQuality?: 'full' | 'partial'
  postsFetchError?: string
}

export interface Metrics {
  engagementRate: number // 近 N 条平均互动率 %
  avgPlays: number
  avgLikes: number
  avgComments: number
  avgShares: number
  likesPerVideo: number
  followerFollowingRatio: number
  recentMedianPlays: number
  olderMedianPlays: number
  playGrowth: number // 近期 vs 早期中位播放增长率
  cvPlays: number // 播放变异系数
  daysSinceLastPost: number
  topPostPlays: number
  topPostLikes: number
  // ---- v2 新增：视频成熟度分层与稳健播放量 ----
  matureMedianPlays: number
  matureWeightedAvgPlays: number
  historicalImpliedPlays: number
  immatureVideoCount: number
  growingVideoCount: number
  likePlayRatio: number
  effectivePlaysSource: 'mature+historical' | 'mature-only' | 'historical-only' | 'fallback'
  effectiveAvgPlays: number
  effectivePeakPlays: number
}

export interface CalculationMetadata {
  effectiveAvgPlays: number
  effectivePeakPlays: number
  matureVideoCount: number
  excludedImmatureCount: number
  excludedGrowingCount: number
  brandCpm: number
  engagementMultiplier: number
  regionMultiplier: number
  categoryForCpm: string
  regionLabel: string
  perVideoBrandDealMid: number
  monthlyBrandPosts: number
  likePlayRatio: number
  playsSource: string
}

export interface AccountHealth {
  overallScore: number
  shadowbanRisk: 'low' | 'medium' | 'high'
  shadowbanSignals: string[]
  growthAnomaly: 'normal' | 'suspect' | 'abnormal'
  growthAnomalyReason: string
  engagementAuthenticity: number
  fakeFollowerEstimate: number
  healthReasoning: string
}

export interface ContentCadence {
  postingRhythm: 'daily' | 'weekly' | 'irregular'
  avgPostsPerDay: number
  avgPostsPerWeek: number
  bestTimeSlots: { hour: number; engagementRate: number }[]
  bestWeekdays: { weekday: string; engagementRate: number }[]
  consistencyScore: number
  cadenceAdvice: string
}

export interface EngagementQuality {
  conversationDepth: number
  shareRatio: number
  commentLikeRatio: number
  completionRate: number | null
  viralCoefficient: number
  topEngagers: { name: string; handle: string; avatarUrl: string; interactions: number }[]
  qualityReasoning: string
}

export interface PeerBenchmark {
  percentile: number
  peerGroupSize: string
  benchmarks: {
    metric: string
    userValue: number
    peerAvg: number
    peerTop10: number
    status: 'above' | 'average' | 'below'
  }[]
  similarCreators: { name: string; handle: string; avatarUrl: string; followers: number; overlap: number }[]
}

export interface BrandPotential {
  brandScore: number
  estimatedCPM: number
  audienceSpendingPower: 'low' | 'medium' | 'high'
  suitableCategories: string[]
  collaborationTypes: { type: string; fit: number; expectedRevenue: string }[]
  brandReasoning: string
}

export interface MonetizationPath {
  eligiblePrograms: string[]
  nearestThreshold: { program: string; gap: string } | null
  estimatedMonthlyUsd: { low: number; mid: number; high: number }
  pathReasoning: string
}

export interface GrowthItem {
  priority: 'high' | 'medium' | 'low'
  area: string
  action: string
  expectedImpact: string
}

export interface GrowthPlan {
  items: GrowthItem[]
  summary: string
}

// ========== Income Estimation ==========

export interface BusinessValueComponent {
  label: string
  icon: string
  amount: { low: number; mid: number; high: number }
  percentage: number
  detail: string
}

export interface BusinessValue {
  totalValue: { low: number; mid: number; high: number }
  components: BusinessValueComponent[]
  summary: string
}

export interface IncomeSource {
  source: 'brand_deals' | 'creator_program' | 'subscriptions' | 'tiktok_shop' | 'live_gifts' | 'amazon_associates' | 'shopify_dtc' | 'live_commerce'
  label: string
  icon: string
  monthlyAmount: { low: number; mid: number; high: number }
  percentage: number
  confidence: 'high' | 'medium' | 'low'
  detail: string
}

export interface IncomeEstimate {
  monthlyTotal: { low: number; mid: number; high: number }
  breakdown: IncomeSource[]
  categoryCpm: number
  categoryRpm: number
  regionMultiplier: number
  categoryLabel: string
  regionLabel: string
  summary: string
}

// ========== Revenue Roadmap ==========

export interface RevenueMilestone {
  month: number
  label: string
  revenue: { low: number; mid: number; high: number }
  milestone: string
  unlocks: string[]
}

export interface RevenueRoadmap {
  currentMonthly: { low: number; mid: number; high: number }
  projections: RevenueMilestone[]
  total12Month: { low: number; mid: number; high: number }
  summary: string
}

// ========== Content Strategy ==========

export interface ContentPillar {
  type: string
  icon: string
  frequency: string
  expectedEngagement: string
  examples: string[]
  why: string
}

export interface ContentStrategy {
  pillars: ContentPillar[]
  recommendedHashtags: { tag: string; volume: 'high' | 'medium' | 'low'; relevance: number }[]
  optimalSchedule: { day: string; time: string; format: string }[]
  videoDuration: { min: number; max: number; label: string }
  collaborationIdeas: { type: string; description: string; potential: 'high' | 'medium' }[]
  summary: string
}

// ========== Peer Ranking ==========

export interface PeerRanking {
  overallPercentile: number
  tierLabel: string // e.g. "Top 15%"
  peerGroupDescription: string
  rankingBreakdown: {
    metric: string
    value: string
    percentile: number
    barColor: string
  }[]
  insight: string
}

// ========== Brand Match ==========

export interface BrandMatch {
  category: string
  icon: string
  fitScore: number
  estimatedDealRange: { low: number; high: number }
  exampleBrands: string[]
  collaborationType: string
  reasoning: string
}

export interface BrandMatching {
  matches: BrandMatch[]
  totalBrandValue: { low: number; mid: number; high: number }
  summary: string
}

// ========== Trend Analysis ==========

export interface TrendTopic {
  topic: string
  hashtag: string
  growth: number
  relevance: number
}

export interface TrendSound {
  name: string
  artist: string
  usageCount: string
  growth: number
}

export interface ContentPrediction {
  direction: string
  confidence: number
  expectedEngagement: string
  why: string
}

export interface BestPostTime {
  day: string
  hour: number
  score: number
}

export interface TrendAnalysis {
  trendingTopics: TrendTopic[]
  trendingSounds: TrendSound[]
  contentPredictions: ContentPrediction[]
  bestPostTimes: BestPostTime[]
  summary: string
}

// ========== Commercialization Direction ==========

export interface CommercializationDirection {
  name: string
  icon: string
  fitScore: number
  difficulty: 'low' | 'medium' | 'high'
  estimatedMonthlyRevenue: { low: number; mid: number; high: number }
  revenuePotential: 'low' | 'medium' | 'high'
  description: string
  actionSteps: string[]
  why: string
  prerequisites: string[]
}

export interface CommercializationAdvice {
  directions: CommercializationDirection[]
  primaryRecommendation: string
  secondaryRecommendation: string
  estimatedTotalMonthly: { low: number; mid: number; high: number }
  summary: string
}

// ========== Commerce Readiness (带货能力分析) ==========

export interface CommerceChannelFit {
  source: string
  label: string
  icon: string
  monthlyAmount: { low: number; mid: number; high: number }
  fitScore: number
  eligible: boolean
  reasoning: string
}

export interface CommerceSignal {
  label: string
  detected: boolean
  weight: number
  detail: string
}

export interface CommerceProductMatch {
  category: string
  icon: string
  fitScore: number
  avgOrderValue: number
  reasoning: string
}

export interface CommerceReadiness {
  overallScore: number
  tier: 'Commerce-Ready' | 'Emerging' | 'Limited'
  summary: string
  channels: CommerceChannelFit[]
  signals: CommerceSignal[]
  productMatches: CommerceProductMatch[]
  contentCommerceRatio: number
  recommendation: string
}

export type ApiErrorCode = 'USER_NOT_FOUND' | 'RATE_LIMIT' | 'API_ERROR' | 'INVALID_USERNAME' | 'MISSING_API_KEY' | 'NETWORK_ERROR' | 'UNAUTHORIZED' | 'CONSUME_ERROR' | 'BALANCE_ERROR'

export interface ApiErrorResponse {
  error: string
  code: ApiErrorCode
  detail?: string
}

// Shared type for /api/recent-evaluations and components/RecentEvaluations
export interface RecentEvaluation {
  username: string
  nickname: string
  avatar: string | null
  avatarData?: string | null
  tier: string
  score: number
  followerCount: number
  totalLikes: number
  videoCount: number
  region: string | null
  verified: boolean
  categories: string[]
  personaType: string | null
  businessValueHigh: number
  computedAt: string
}
