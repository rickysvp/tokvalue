import {
  RawProfile, Evaluation, DimensionScores, RiskFlag, Metrics,
  AccountHealth, ContentCadence, EngagementQuality, PeerBenchmark, BrandPotential,
  BrandMatching, BrandMatch, MonetizationPath, GrowthPlan, GrowthItem, Post,
  AccountProfile,
  PeerRanking, TrendAnalysis, CommercializationAdvice, CommercializationDirection,
  CalculationMetadata,
} from '@/types'
import {
  THREE_LAYER_WEIGHTS, RISK_THRESHOLDS, MONETIZATION_THRESHOLDS, POSTING_ACTIVITY,
  TIER_ER_BENCHMARK, TIER_CV_BENCHMARK,
  getPeerBenchmarks, clamp,
} from './scoring/config'
import {
  classifyAllPosts, calcEffectivePlays, calcOverallEngagement, calcWindowedPlayGrowth,
  calcMaturePlayCV,
} from './scoring/metrics'
import { computeDimensions } from './scoring/dimensions'
import {
  pickCategoryCpm, pickRegionMultiplier, getEngagementMultiplier, getFollowerTier,
  calcBrandDealValue, buildIncomeEstimate, buildBusinessValue, buildRevenueRoadmap, buildCommerceReadiness,
} from './scoring/valuation'
import { tierFromScore, buildPriceAdvice, buildVerdict, buildSummary } from './scoring/verdict'
import { buildContentStrategy } from './scoring/content-strategy'
import { buildCommercialSnapshot, buildDealPricing, buildThirtyDayPlan } from './scoring/commercial'
import { buildPillars, buildValuationV2 } from './pillar'

export { clamp, tierFromScore, inferCategories, peerGroupFromFollowers, aggregateByHour, aggregateByWeekday, average, median, stdDev }

function average(nums: number[]): number { return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0 }
function stdDev(nums: number[]): number {
  if (nums.length < 2) return 0
  const avg = average(nums)
  return Math.sqrt(nums.reduce((acc, n) => acc + Math.pow(n - avg, 2), 0) / nums.length)
}
function median(nums: number[]): number {
  if (!nums.length) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function aggregateByHour(posts: Post[]): { hour: number; engagementRate: number }[] {
  const buckets: Record<number, { interactions: number; plays: number }> = {}
  for (const post of posts) {
    const h = new Date((post.createTime || 0) * 1000).getHours()
    buckets[h] = buckets[h] || { interactions: 0, plays: 0 }
    buckets[h].interactions += (post.likeCount || 0) + (post.commentCount || 0) + (post.shareCount || 0)
    buckets[h].plays += post.playCount || 0
  }
  return Object.entries(buckets).map(([hour, data]) => ({
    hour: Number(hour), engagementRate: data.plays ? (data.interactions / data.plays) * 100 : 0,
  })).sort((a, b) => b.engagementRate - a.engagementRate)
}

function aggregateByWeekday(posts: Post[]): { weekday: string; engagementRate: number }[] {
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const buckets: Record<number, { interactions: number; plays: number }> = {}
  for (const post of posts) {
    const d = new Date((post.createTime || 0) * 1000).getDay()
    buckets[d] = buckets[d] || { interactions: 0, plays: 0 }
    buckets[d].interactions += (post.likeCount || 0) + (post.commentCount || 0) + (post.shareCount || 0)
    buckets[d].plays += post.playCount || 0
  }
  return Object.entries(buckets).map(([day, data]) => ({
    weekday: labels[Number(day)], engagementRate: data.plays ? (data.interactions / data.plays) * 100 : 0,
  })).sort((a, b) => b.engagementRate - a.engagementRate)
}

function peerGroupFromFollowers(followers: number): string {
  if (followers < 1000) return '< 1K followers'
  if (followers < 10000) return '1K-10K followers'
  if (followers < 100000) return '10K-100K followers'
  if (followers < 1000000) return '100K-1M followers'
  return '1M+ followers'
}

function inferCategories(profile: RawProfile): string[] {
  const text = `${profile.posts.map(p => (p.desc || '').toLowerCase()).join(' ')} ${String(profile.bio || '').toLowerCase()} ${String(profile.nickname || '').toLowerCase()}`
  const categories: { keyword: string; label: string; priority?: number }[] = [
    { keyword: '\\bbeauty\\b|\\bmakeup\\b|\\bskincare\\b|妆容|护肤|cosmetic|lipstick|foundation', label: 'Beauty & Skincare', priority: 6 },
    { keyword: '\\bfashion\\b|ootd|穿搭|衣服|\\boutfit\\b|\\bstyle\\b|lookbook|模特|\\bmodel\\b', label: 'Fashion & Style', priority: 6 },
    { keyword: '\\btech\\b|\\btechnology\\b|\\bgadget\\b|\\bphone\\b|\\bsmartphone\\b|科技|手机|数码|电子产品|unboxing|laptop|camera|耳机|电脑', label: 'Tech & Gadgets' },
    { keyword: '\\bfood\\b|\\brecipe\\b|\\bcooking\\b|美食|做饭|料理|厨房|restaurant', label: 'Food & Cooking' },
    { keyword: '\\bfitness\\b|\\bworkout\\b|\\bgym\\b|健身|运动|\\btraining\\b|yoga|pilates|跑步|marathon|swim|swimming|\\bsport\\b|\\bsports\\b', label: 'Fitness & Sports', priority: 8 },
    { keyword: 'mma|ufc|\\bboxing\\b|jiujitsu|柔术|格斗|摔跤|grappling|\\bwrestling\\b|\\bmartial\\b|\\bjudo\\b|\\bkarate\\b', label: 'Combat Sports', priority: 10 },
    { keyword: '\\btravel\\b|\\bvlog\\b|\\btrip\\b|旅行|旅游|hotel|destination', label: 'Travel' },
    { keyword: '\\bgame\\b|\\bgaming\\b|\\bplay\\b|游戏|\\bgamer\\b|stream', label: 'Gaming' },
    { keyword: '\\bfinance\\b|\\bmoney\\b|\\binvest\\b|理财|赚钱|crypto|\\bstock\\b', label: 'Finance & Investing' },
    { keyword: '美女|颜值|女神|\\bsexy\\b|\\bpretty\\b|\\bgorgeous\\b|\\bgirl\\b|\\bhot\\b|\\bcute\\b', label: 'Beauty & Lifestyle', priority: 6 },
    { keyword: '\\bcomedy\\b|\\bfunny\\b|搞笑|幽默|段子|笑话|\\bmeme\\b', label: 'Comedy' },
    { keyword: '\\bmusic\\b|\\bdance\\b|跳舞|舞蹈|翻唱|\\bcover\\b|\\bsong\\b', label: 'Music & Dance' },
    { keyword: '\\bpet\\b|\\bcat\\b|\\bdog\\b|宠物|猫|狗|\\banimal\\b', label: 'Pets & Animals' },
    // 带货账号类型（清单博主/评测博主/deals finder/电商带货）—— 优先级最高，确保覆盖 airlandolists 这类账号
    { keyword: 'amazon\\s*finds|tiktokmadeemebuyit|product\\s*roundup|must\\s*have|deals|haul|storefront|amazon\\s*storefront|etsy\\s*shop|shopify|tiktok\\s*shop|好物|清单|必买|开箱|购物车|带货|种草|推荐|好物推荐|评测|安利|flagship|旗舰店', label: 'Shopping & Deals', priority: 12 },
  ]
  const matched = categories.filter(c => new RegExp(c.keyword, 'i').test(text))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0)).map(c => c.label)
  return matched.length ? matched.slice(0, 3) : ['Lifestyle', 'General Entertainment']
}

function detectRisks(profile: RawProfile, metrics: Metrics, classified: ReturnType<typeof classifyAllPosts>): RiskFlag[] {
  const risks: RiskFlag[] = []
  if (!profile.posts.length) {
    risks.push({ level: 'medium', label: 'Too few videos to score', detail: 'No recent videos available to analyze. Upload at least 5 videos to get a reliable result.' })
    return risks
  }
  const { engagementRate, cvPlays, daysSinceLastPost, effectiveAvgPlays } = metrics
  const frRatio = profile.followerCount / Math.max(profile.followingCount, 1)
  const tier = getFollowerTier(profile.followerCount)
  const erBenchmark = TIER_ER_BENCHMARK[tier]
  const cvBenchmark = TIER_CV_BENCHMARK[tier]

  // 互动率风险：层级化（与 scoreHealth 同源），保证「健康分低 ⟺ 必有风险信号」
  if (engagementRate < erBenchmark * 0.3) {
    risks.push({ level: 'high', label: 'Most of your followers are silent', detail: `Only ${engagementRate.toFixed(1)}% interact with your videos — healthy for this size is ~${erBenchmark}%. Brands suspect purchased followers when engagement is this low, and rate offers drop 30–50%.` })
  } else if (engagementRate < erBenchmark * 0.5) {
    risks.push({ level: 'medium', label: 'Audiences don\'t react enough', detail: `${engagementRate.toFixed(1)}% engage — normal for this size is ${erBenchmark}%. Weak engagement tells brands your viewers aren't converted into customers or fans, so you'll hear lower opening offers.` })
  }
  // 高粉低播检测：粉丝 >= 10万 但 playFanRatio < 0.05 → 高风险
  if (profile.followerCount >= 100000 && effectiveAvgPlays > 0) {
    const playFanRatio = effectiveAvgPlays / profile.followerCount
    if (playFanRatio < 0.05) {
      risks.push({ level: 'high', label: 'Followers don\'t see your videos', detail: `Only ${(playFanRatio * 100).toFixed(1)}% of your followers are reached per video. A healthy ratio is 20%+. This means most listed followers never see your content — brands won't pay follower-count prices for that.` })
    }
  }
  // 发帖频率骤降/断更检测
  const recentPostCount = classified.mature.length + classified.growing.length + classified.immature.length
  if (recentPostCount < POSTING_ACTIVITY.dormantMaxRecentPosts && classified.archive.length >= POSTING_ACTIVITY.minArchiveForDormancy) {
    risks.push({
      level: 'high',
      label: 'You stopped posting',
      detail: `Only ${recentPostCount} video(s) in the last 30 days against ${classified.archive.length} historical. Stalled posting signals to brands that your account is inactive or abandoned — expect proposals 30–50% lower until posting resumes and stabilizes.`,
    })
  } else if (recentPostCount < POSTING_ACTIVITY.dormantMaxRecentPosts) {
    risks.push({
      level: 'medium',
      label: 'Not posting consistently lately',
      detail: `Only ${recentPostCount} video(s) in the last 30 days. Too little recent data to trust current reach — brands push for trial or discounted first posts.`,
    })
  }
  if (frRatio < RISK_THRESHOLDS.followerFollowingCritical) risks.push({ level: 'high', label: 'Follow/for-follow pattern detected', detail: `You follow back almost as many accounts as follow you. This is the #1 bot/bought-follower fingerprint. Brands and agencies auto-scan this, and accounts in this bucket are excluded from most deal lists.` })
  if (daysSinceLastPost > RISK_THRESHOLDS.inactiveDaysCritical) risks.push({ level: 'high', label: 'No new videos in 2+ months', detail: 'Over 60 days without a post. This is effectively cold-start traffic — new rates will be negotiated from scratch, not your historical baseline.' })
  else if (daysSinceLastPost > RISK_THRESHOLDS.inactiveDaysWarning) risks.push({ level: 'medium', label: 'A month since your last post', detail: 'Over 30 days without a new video. The algorithm penalizes dormant profiles — views will come back, but until they do quotes can be 10–20% lower.' })
  // 播放波动 CV：改人话
  if (cvPlays > cvBenchmark * 2.0) risks.push({ level: 'medium', label: 'Videos go viral… or get almost no views', detail: `Your hit-or-miss ratio (CV ${cvPlays.toFixed(2)}) is double the normal ${cvBenchmark} for this size. Sometimes 100K, sometimes 2K — for brands that means unreliable campaign performance. They'll propose backup posts or capped fees until you level this out.` })
  else if (cvPlays > cvBenchmark * 1.5) risks.push({ level: 'low', label: 'View counts vary a lot', detail: `Performance swing (CV ${cvPlays.toFixed(2)}) is wider than the ${cvBenchmark} typical for this size. Nothing deal-killing, but worth pinning down before pitching brands that care about predictable reach.` })
  if (profile.videoCount < 5) risks.push({ level: 'medium', label: 'Need more videos for a confident score', detail: 'Less than 5 total videos on this account — the score and estimate are a rough direction. Come back after a few more posts for a reliable reading.' })
  return risks
}

function computeMetrics(profile: RawProfile, ep: ReturnType<typeof calcEffectivePlays>, classified: ReturnType<typeof classifyAllPosts>, now: number = Math.floor(Date.now() / 1000)): Metrics {
  const relevant = [...classified.mature, ...classified.growing]
  const totalPlays = relevant.reduce((s, p) => s + (p.post.playCount || 0), 0) || profile.posts.reduce((s, p) => s + (p.playCount || 0), 0)
  const totalInteractions = relevant.reduce((s, p) => s + (p.post.likeCount || 0) + (p.post.commentCount || 0) + (p.post.shareCount || 0), 0)
  // 互动率：mature+growing 帖不足 3 条时，小样本互动率失真（冷启动帖互动率波动剧烈），
  // 用全量帖子的互动率兜底，避免断更号被几条冷启动帖的虚高互动率顶到高分
  const allProfilePlays = profile.posts.reduce((s, p) => s + (p.playCount || 0), 0)
  const allProfileInteractions = profile.posts.reduce((s, p) => s + (p.likeCount || 0) + (p.commentCount || 0) + (p.shareCount || 0), 0)
  let engagementRate: number
  if (relevant.length >= 3 && totalPlays > 0) {
    engagementRate = (totalInteractions / totalPlays) * 100
  } else if (allProfilePlays > 0) {
    engagementRate = (allProfileInteractions / allProfilePlays) * 100
  } else {
    engagementRate = calcOverallEngagement(profile, now)
  }
  const allPlays = profile.posts.map(p => p.playCount || 0)
  const avgPlays = allPlays.length ? allPlays.reduce((a, b) => a + b, 0) / allPlays.length : ep.effectiveAvgPlays
  const avgLikes = profile.posts.length ? profile.posts.reduce((s, p) => s + (p.likeCount || 0), 0) / profile.posts.length : 0
  const avgComments = profile.posts.length ? profile.posts.reduce((s, p) => s + (p.commentCount || 0), 0) / profile.posts.length : 0
  const avgShares = profile.posts.length ? profile.posts.reduce((s, p) => s + (p.shareCount || 0), 0) / profile.posts.length : 0
  // 播放波动 CV：以成熟帖（3-30天）为准，与 detectRisks 同源。
  // archive 历史爆款会污染全量 CV（历史峰值拉高 stdDev），不能反映当前稳定性。
  // 成熟帖不足 3 条时回退全量 CV。
  const cvAll = avgPlays > 0 ? stdDev(allPlays) / avgPlays : 1
  const cvPlays = classified.mature.length >= 3 ? calcMaturePlayCV(classified.mature) : cvAll
  const growth = calcWindowedPlayGrowth(profile, now)
  const latest = profile.posts.length ? Math.max(...profile.posts.map(p => p.createTime || 0)) : 0
  const daysSinceLastPost = latest ? Math.floor((now - latest) / 86400) : 999
  const sorted = [...profile.posts].sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
  const top = sorted[0]
  return {
    engagementRate: Number(engagementRate.toFixed(2)),
    avgPlays: Math.round(avgPlays),
    avgLikes: Math.round(avgLikes),
    avgComments: Math.round(avgComments),
    avgShares: Math.round(avgShares),
    likesPerVideo: profile.videoCount ? Math.round(profile.totalLikes / profile.videoCount) : 0,
    followerFollowingRatio: Number((profile.followerCount / Math.max(profile.followingCount, 1)).toFixed(2)),
    recentMedianPlays: Math.round(median(classified.growing.length ? classified.growing.map(p => p.post.playCount || 0) : allPlays.slice(0, Math.ceil(allPlays.length / 2)))),
    olderMedianPlays: Math.round(median(classified.mature.length ? classified.mature.slice(-Math.ceil(classified.mature.length / 2)).map(p => p.post.playCount || 0) : [])),
    playGrowth: Number((growth.playGrowth * 100).toFixed(1)),
    cvPlays: Number(cvPlays.toFixed(2)),
    daysSinceLastPost,
    topPostPlays: top?.playCount || 0,
    topPostLikes: top?.likeCount || 0,
    matureMedianPlays: ep.matureWeightedMedian,
    matureWeightedAvgPlays: ep.matureWeightedAvg,
    historicalImpliedPlays: ep.historicalImpliedPlays,
    immatureVideoCount: ep.immatureCount,
    growingVideoCount: ep.growingCount,
    likePlayRatio: ep.likePlayRatio,
    effectivePlaysSource: ep.source,
    effectiveAvgPlays: ep.effectiveAvgPlays,
    effectivePeakPlays: ep.effectivePeakPlays,
  }
}

/**
 * Three-Layer Scoring Process (Spec-defined)
 * Step 1: Core Drivers (60%) → Determines rating range
 * Step 2: Quality Modifiers (30%) → Fine-tunes within range
 * Step 3: Risk Adjustments (10%) → Penalty only, triggers downgrade
 */
function totalScore(dims: DimensionScores, _followerCount: number): { score: number; coreScore: number; qualityScore: number; riskScore: number } {
  const { core, quality, risk } = THREE_LAYER_WEIGHTS

  const coreScore = Object.entries(core).reduce((s, [k, w]) => {
    const v = dims[k as keyof DimensionScores]
    return s + (Number.isFinite(v) ? v * w : 0)
  }, 0)

  const qualityScore = Object.entries(quality).reduce((s, [k, w]) => {
    const v = dims[k as keyof DimensionScores]
    return s + (Number.isFinite(v) ? v * w : 0)
  }, 0)

  const riskScore = Object.entries(risk).reduce((s, [k, w]) => {
    const v = dims[k as keyof DimensionScores]
    return s + (Number.isFinite(v) ? v * w : 0)
  }, 0)

  const raw = coreScore + qualityScore + riskScore
  return {
    score: Math.round(clamp(Number.isFinite(raw) ? raw : 0, 0, 100)),
    coreScore: Math.round(coreScore * 100) / 100,
    qualityScore: Math.round(qualityScore * 100) / 100,
    riskScore: Math.round(riskScore * 100) / 100,
  }
}

function buildAccountHealth(metrics: Metrics, risks: RiskFlag[], dims: DimensionScores): AccountHealth {
  const highCount = risks.filter(r => r.level === 'high').length
  const risk: AccountHealth['shadowbanRisk'] = highCount >= 1 ? 'high' : risks.length >= 1 ? 'medium' : 'low'
  const authenticity = dims.authenticity
  return {
    overallScore: Math.round(clamp(100 - highCount * 25 - risks.filter(r => r.level === 'medium').length * 10, 0, 100)),
    shadowbanRisk: risk,
    shadowbanSignals: risks.map(r => r.detail),
    growthAnomaly: metrics.playGrowth < -40 ? 'abnormal' : metrics.playGrowth < -20 ? 'suspect' : 'normal',
    growthAnomalyReason: metrics.playGrowth < -20 ? 'Recent median plays significantly lower than earlier period' : 'Growth trend normal',
    engagementAuthenticity: Math.round(authenticity),
    fakeFollowerEstimate: Math.round(clamp(100 - authenticity, 0, 100)),
    healthReasoning: risk === 'high' ? `Account has ${highCount} high-risk signal(s) — address risks before pursuing partnerships or monetization.` : risk === 'medium' ? `Account is generally healthy, but ${risks.length} issue(s) worth monitoring.` : 'Account health is good — no significant risk signals detected.',
  }
}

function buildContentCadence(posts: Post[], now: number = Math.floor(Date.now() / 1000)): ContentCadence {
  const recent = posts.filter(p => p.createTime && now - p.createTime <= 30 * 86400)
  const avgPerDay = recent.length ? recent.length / 30 : 0
  const avgPerWeek = avgPerDay * 7
  const rhythm: ContentCadence['postingRhythm'] = avgPerDay >= 0.85 ? 'daily' : avgPerDay >= 0.25 ? 'weekly' : 'irregular'
  return {
    postingRhythm: rhythm,
    avgPostsPerDay: Number(avgPerDay.toFixed(2)),
    avgPostsPerWeek: Number(avgPerWeek.toFixed(1)),
    bestTimeSlots: aggregateByHour(recent).slice(0, 3),
    bestWeekdays: aggregateByWeekday(recent).slice(0, 3),
    consistencyScore: Math.round(clamp(100 - Math.abs(avgPerDay - 1) * 30, 0, 100)),
    cadenceAdvice: rhythm === 'irregular' ? 'Posting rhythm is irregular — aim for at least 3 videos per week to build audience expectations.' : 'Posting rhythm is healthy — maintain consistency and continue optimizing content.',
  }
}

function buildEngagementQuality(metrics: Metrics, profile: RawProfile, classified: ReturnType<typeof classifyAllPosts>): EngagementQuality {
  const relevant = [...classified.mature, ...classified.growing]
  const totalPlays = relevant.reduce((s, p) => s + p.post.playCount, 0) || 1
  const totalShares = relevant.reduce((s, p) => s + (p.post.shareCount || 0), 0)
  const totalComments = relevant.reduce((s, p) => s + (p.post.commentCount || 0), 0)
  const viralCoeff = profile.followerCount > 0 ? metrics.effectiveAvgPlays / profile.followerCount : 0
  return {
    conversationDepth: Number((1 + totalComments / Math.max(profile.followerCount * 0.001, 80)).toFixed(1)),
    shareRatio: Number(((totalShares / totalPlays) * 100).toFixed(2)),
    commentLikeRatio: Number((metrics.avgLikes ? (metrics.avgComments / metrics.avgLikes) * 100 : 0).toFixed(2)),
    completionRate: null,
    viralCoefficient: Number(viralCoeff.toFixed(2)),
    topEngagers: [],
    qualityReasoning: metrics.engagementRate >= 5 ? 'Excellent engagement quality — highly active followers, suitable for commercial partnerships.' : metrics.engagementRate >= 2 ? 'Adequate engagement quality — can improve with better comment prompts and first-3-second hooks.' : 'Low engagement quality — prioritize evaluating content appeal or follower authenticity.',
  }
}

function buildPeerBenchmark(profile: RawProfile, metrics: Metrics): PeerBenchmark {
  const peers = getPeerBenchmarks(profile.followerCount)
  const playsRatio = profile.followerCount > 0 ? metrics.effectiveAvgPlays / profile.followerCount : 0
  const benchmarks = [
    { metric: 'Engagement Rate', userValue: metrics.engagementRate, peerAvg: peers.avgER, peerTop10: peers.top10ER },
    { metric: 'Avg Plays/Follower', userValue: playsRatio, peerAvg: peers.avgPlaysRatio, peerTop10: peers.avgPlaysRatio * 1.8 },
    { metric: 'Play Growth', userValue: metrics.playGrowth, peerAvg: 3, peerTop10: 15 },
  ]
  const aboveCount = benchmarks.filter(b => b.userValue >= b.peerTop10).length
  const avgCount = benchmarks.filter(b => b.userValue >= b.peerAvg).length
  const belowCount = benchmarks.filter(b => b.userValue < b.peerAvg).length
  const percentile = clamp(50 + aboveCount * 12 + (avgCount - aboveCount) * 5 - belowCount * 8, 1, 99)
  return {
    percentile: Math.round(percentile),
    peerGroupSize: peerGroupFromFollowers(profile.followerCount),
    benchmarks: benchmarks.map(b => {
      const status: 'above' | 'average' | 'below' = b.userValue >= b.peerTop10 ? 'above' : b.userValue >= b.peerAvg ? 'average' : 'below'
      return {
        metric: b.metric,
        userValue: Number(b.userValue.toFixed(2)),
        peerAvg: Number(b.peerAvg.toFixed(2)),
        peerTop10: Number(b.peerTop10.toFixed(2)),
        status,
      }
    }),
    similarCreators: [],
  }
}

function buildBrandPotential(metrics: Metrics, categories: string[], health: AccountHealth, dims: DimensionScores): BrandPotential {
  const { cpm } = pickCategoryCpm(categories)
  const playsRatio = metrics.effectiveAvgPlays / Math.max(1, metrics.avgPlays)
  const score = clamp(metrics.engagementRate * 8 + playsRatio * 15 + health.engagementAuthenticity * 0.2 + dims.commerce * 0.3, 0, 100)
  const spendingPower: BrandPotential['audienceSpendingPower'] = metrics.engagementRate >= 5 ? 'high' : metrics.engagementRate >= 2 ? 'medium' : 'low'
  return {
    brandScore: Math.round(score),
    estimatedCPM: Math.round(cpm * (metrics.engagementRate >= 5 ? 1.2 : metrics.engagementRate >= 3 ? 1.0 : 0.8)),
    audienceSpendingPower: spendingPower,
    suitableCategories: categories,
    collaborationTypes: [
      { type: 'Short-Video Sponsorship', fit: clamp(Math.round(score), 0, 100), expectedRevenue: 'Based on avg plays × CPM' },
      { type: 'Live Shopping', fit: clamp(Math.round(score - 10), 0, 100), expectedRevenue: 'GMV commission 10-20%' },
      { type: 'Affiliate Marketing', fit: clamp(Math.round(score - 5), 0, 100), expectedRevenue: 'CPS-based commission' },
    ],
    brandReasoning: score >= 70 ? `Strong brand partnership potential — ${categories.join(', ')} niche has good fit, can quote at market rates.` : 'Moderate brand potential — focus on improving content quality and engagement rate first.',
  }
}

function buildBrandMatching(categories: string[], cpm: number, effectiveAvgPlays: number, engagementMult: number, regionMult: number): BrandMatching {
  const matches: BrandMatch[] = categories.slice(0, 3).map((cat, idx) => {
    const perVideoMid = Math.max((effectiveAvgPlays / 1000) * cpm * engagementMult * regionMult, 100)
    return {
      category: cat, icon: '✨',
      fitScore: Math.max(50, Math.min(95, 85 - idx * 7)),
      estimatedDealRange: { low: Math.round(perVideoMid * 0.6), high: Math.round(perVideoMid * 1.5) },
      exampleBrands: ['Relevant brands in this category'],
      collaborationType: 'Product Placement / Review',
      reasoning: `Strong content alignment with ${cat} category brands`,
    }
  })
  if (!matches.length) matches.push({ category: 'General', icon: '✨', fitScore: 60, estimatedDealRange: { low: 100, high: 500 }, exampleBrands: [], collaborationType: 'Brand Exposure', reasoning: 'Content suitable for mass-market consumer brands' })
  const totalLow = matches.reduce((s, m) => s + m.estimatedDealRange.low, 0)
  const totalHigh = matches.reduce((s, m) => s + m.estimatedDealRange.high, 0)
  return { matches, totalBrandValue: { low: totalLow, mid: Math.round((totalLow + totalHigh) / 2), high: totalHigh }, summary: `Brand matching based on content style (${categories.join(', ')})` }
}

function buildMonetizationPath(profile: RawProfile, metrics: Metrics, income: import('@/types').IncomeEstimate): MonetizationPath {
  const eligible: string[] = []
  if (profile.followerCount >= MONETIZATION_THRESHOLDS.creatorFundFollowers && profile.videoCount >= 10) eligible.push('Creator Fund / Creativity Program')
  if (profile.followerCount >= MONETIZATION_THRESHOLDS.tiktokShopFollowers) eligible.push('TikTok Shop Affiliate')
  if (profile.followerCount >= MONETIZATION_THRESHOLDS.liveGiftFollowers) eligible.push('LIVE Gifts')
  if (profile.followerCount >= MONETIZATION_THRESHOLDS.subscriptionFollowers) eligible.push('Subscription')
  const nearest = eligible.length === 0 ? { program: 'Creator Fund', gap: `${Math.max(0, MONETIZATION_THRESHOLDS.creatorFundFollowers - profile.followerCount).toLocaleString()} more followers needed` } : null
  return { eligiblePrograms: eligible, nearestThreshold: nearest, estimatedMonthlyUsd: income.monthlyTotal, pathReasoning: eligible.length ? `Qualifies for ${eligible.join(', ')} — ready to start monetizing.` : `Not yet meeting key monetization thresholds — ${nearest?.gap}, continue publishing niche content.` }
}

function buildGrowthPlan(risks: RiskFlag[], metrics: Metrics, cadence: ContentCadence, dims: DimensionScores, followerCount: number): GrowthPlan {
  const items: GrowthItem[] = []
  if (risks.some(r => r.level === 'high')) items.push({ priority: 'high', area: 'Account Health', action: 'Audit last 10 videos for violations or shadowbans — pause posting 3-5 days if needed to restore reach', expectedImpact: 'Reduce shadowban risk, restore recommendation traffic' })
  if (metrics.engagementRate < 3) items.push({ priority: 'high', area: 'Engagement Rate', action: 'Optimize first-3-second hook + add comment prompts to boost completion and comment rates', expectedImpact: 'Boost engagement rate from current level to 3-5%' })
  if (cadence.consistencyScore < 60) items.push({ priority: 'medium', area: 'Posting Cadence', action: `Publish at least ${Math.max(3, Math.round(cadence.avgPostsPerWeek))} videos per week consistently`, expectedImpact: 'Improve account activity and recommendation stability' })
  if (followerCount < 10000) items.push({ priority: 'medium', area: 'Content Niche', action: 'Focus on 1-2 vertical niches — use 3-5 targeted hashtags per video', expectedImpact: 'Accelerate path to Creator Fund eligibility' })
  if (dims.stability < 50) items.push({ priority: 'medium', area: 'Traffic Stability', action: 'Analyze low-performing videos — identify common patterns in content or timing to avoid', expectedImpact: 'Reduce play volatility, improve account predictability' })
  return { items: items.slice(0, 5), summary: items.length ? `Prioritize ${items.filter(i => i.priority === 'high').length} high-impact/high-ROI optimization(s)` : 'Account is in good shape — maintain current cadence and quality' }
}

function buildAccountProfile(profile: RawProfile, metrics: Metrics, categories: string[], cadence: ContentCadence): AccountProfile {
  return {
    categories: categories.slice(0, 3),
    personaType: profile.followerCount >= 1000000 ? 'Mega Creator' : profile.followerCount >= 100000 ? 'Mid-Tier Creator' : profile.followerCount >= 10000 ? 'Growing Creator' : 'Nano Creator',
    postingRhythm: cadence.postingRhythm === 'daily' ? 'Daily' : cadence.postingRhythm === 'weekly' ? 'Weekly' : 'Irregular',
    audienceRegion: profile.region || 'US',
    contentStyle: metrics.engagementRate >= 6 ? 'High-Engagement' : metrics.engagementRate >= 3 ? 'Content-Driven' : 'Traffic-Driven',
  }
}

function buildPeerRanking(metrics: Metrics, peerBench: PeerBenchmark, followerCount: number): PeerRanking {
  const peers = getPeerBenchmarks(followerCount)
  const playsRatio = followerCount > 0 ? metrics.effectiveAvgPlays / followerCount : 0
  const playsPercentile = clamp(50 + (playsRatio - peers.avgPlaysRatio) / Math.max(peers.avgPlaysRatio, 0.01) * 50, 1, 99)
  return {
    overallPercentile: peerBench.percentile,
    tierLabel: `Top ${100 - peerBench.percentile}%`,
    peerGroupDescription: peerGroupFromFollowers(followerCount),
    rankingBreakdown: [
      { metric: 'Engagement', value: `${metrics.engagementRate.toFixed(1)}%`, percentile: clamp(50 + (metrics.engagementRate - 3) * 12, 1, 99), barColor: '#00F2EA' },
      { metric: 'Avg Plays', value: metrics.effectiveAvgPlays >= 1000 ? (metrics.effectiveAvgPlays / 1000).toFixed(1) + 'K' : String(metrics.effectiveAvgPlays), percentile: Math.round(playsPercentile), barColor: '#FF0050' },
      { metric: 'Play Growth', value: `${metrics.playGrowth > 0 ? '+' : ''}${metrics.playGrowth.toFixed(0)}%`, percentile: clamp(50 + metrics.playGrowth * 1.5, 1, 99), barColor: metrics.playGrowth > 0 ? '#22c55e' : '#f59e0b' },
    ],
    insight: 'Relative performance benchmark against peer creators of similar follower range (log-curve based)',
  }
}

function buildTrendAnalysis(metrics: Metrics, cadence: ContentCadence): TrendAnalysis {
  const dir = metrics.playGrowth > 20 ? 'Strong upward trend — maintain posting cadence' : metrics.playGrowth > 0 ? 'Steady growth — try trending topics to accelerate' : metrics.playGrowth > -20 ? 'Growth slowing — consider optimizing content hooks' : 'Significant decline — investigate shadowban or adjust content direction'
  return {
    trendingTopics: [], trendingSounds: [],
    contentPredictions: [{ direction: dir, confidence: clamp(Math.abs(metrics.playGrowth) + 40, 30, 90), expectedEngagement: metrics.engagementRate >= 3 ? '3-6%' : '1-3%', why: `Based on ${metrics.playGrowth.toFixed(0)}% play growth and ${metrics.engagementRate.toFixed(1)}% engagement rate` }],
    bestPostTimes: cadence.bestTimeSlots.slice(0, 3).map((t, i) => ({ day: cadence.bestWeekdays[i % Math.max(cadence.bestWeekdays.length, 1)]?.weekday || 'Wed', hour: t.hour, score: t.engagementRate })),
    summary: dir,
  }
}

function buildCommercializationAdvice(categories: string[], dims: DimensionScores, income: import('@/types').IncomeEstimate, followerCount: number): CommercializationAdvice {
  const tier = getFollowerTier(followerCount)
  const directions: CommercializationDirection[] = []
  if (dims.commerce >= 40) directions.push({ name: 'Brand Sponsorships', icon: '💰', fitScore: dims.commerce, difficulty: tier === 'nano' ? 'low' : 'medium', estimatedMonthlyRevenue: income.breakdown.find(b => b.source === 'brand_deals')?.monthlyAmount || { low: 0, mid: 0, high: 0 }, revenuePotential: 'high', description: 'Earn through brand integrations, product reviews, and sponsored content', actionSteps: ['Create a media kit', 'Reach out to relevant brands', 'Join creator platforms'], why: 'Brand sponsorships are the most stable monetization channel', prerequisites: ['10K+ followers (recommended)', 'Consistent content quality'] })
  if (categories.some(c => ['food', 'food & cooking', 'beauty', 'beauty & skincare', 'fashion', 'fashion & style', 'fitness', 'fitness & sports'].includes(c.toLowerCase()))) {
    directions.push({ name: 'TikTok Shop', icon: '🛒', fitScore: dims.monetization, difficulty: 'medium', estimatedMonthlyRevenue: income.breakdown.find(b => b.source === 'tiktok_shop')?.monthlyAmount || { low: 0, mid: 0, high: 0 }, revenuePotential: 'high', description: 'Earn commissions through short-video & live shopping', actionSteps: ['Activate Shop access', 'Match products to content niche', 'Optimize product-linked videos'], why: 'Ideal for high-conversion product categories', prerequisites: ['1K+ followers', 'Vertical niche content'] })
  }
  directions.push({ name: 'Creator Program', icon: '🎬', fitScore: dims.monetization, difficulty: 'low', estimatedMonthlyRevenue: income.breakdown.find(b => b.source === 'creator_program')?.monthlyAmount || { low: 0, mid: 0, high: 0 }, revenuePotential: 'low', description: 'Earn platform revenue share based on video views', actionSteps: ['Meet 10K follower threshold', 'Consistently produce original content', 'Apply for Beta program'], why: 'The most fundamental monetization method', prerequisites: ['10K+ followers', '10K+ avg plays (Beta)'] })
  const total = income.monthlyTotal
  return { directions, primaryRecommendation: directions[0]?.name || 'Brand Sponsorships', secondaryRecommendation: directions[1]?.name || 'Creator Program', estimatedTotalMonthly: total, summary: `Based on account tier (${tier}) and content niche, prioritize ${directions[0]?.name || 'Brand Sponsorships'}` }
}

export interface ScoreOptions { now?: number }

export function scoreProfile(profile: RawProfile, options?: ScoreOptions): Evaluation {
  const now = options?.now ?? Date.now() / 1000
  const classified = classifyAllPosts(profile.posts, now)
  const ep = calcEffectivePlays(profile, now)
  const metrics = computeMetrics(profile, ep, classified, now)
  const categories = inferCategories(profile)
  const cadence = buildContentCadence(profile.posts, now)
  const postsPerMonth = cadence.avgPostsPerWeek * 4.33
  const risks = detectRisks(profile, metrics, classified)
  const dims = computeDimensions({ profile, metrics, classified: { mature: classified.mature, growing: classified.growing, archive: classified.archive }, postsPerMonth, categories })
  const { score } = totalScore(dims, profile.followerCount)
  const health = buildAccountHealth(metrics, risks, dims)
  const income = buildIncomeEstimate({ profile, metrics, dims, categories, cadence, risks })
  const business = buildBusinessValue({ profile, metrics, dims, categories, income, risks })
  // Tier is driven by 10-dimension score (not business value) — prevents high-follower-low-play accounts from getting S tier
  const { tier, reason: tierReason } = tierFromScore(score, risks)
  const roadmap = buildRevenueRoadmap({ profile, metrics, dims, risks, income })
  const { cpm: categoryCpm, label: categoryLabel } = pickCategoryCpm(categories)
  const { mult: regionMult, label: regionLabel } = pickRegionMultiplier(profile.region)
  const engagementMult = getEngagementMultiplier(metrics.engagementRate)
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
  const brandPotential = buildBrandPotential(metrics, categories, health, dims)
  const followerTier = getFollowerTier(profile.followerCount)
  const growthPlan = buildGrowthPlan(risks, metrics, cadence, dims, profile.followerCount)
  const contentStrategy = buildContentStrategy({ categories, cadence, followerTier })
  const brandMatching = buildBrandMatching(categories, categoryCpm, metrics.effectiveAvgPlays, engagementMult, regionMult)
  // ── Commercial Growth PMF 派生（服务端-only，客户端不得重算）──
  const commercialSnapshot = buildCommercialSnapshot({
    score, dims, metrics, risks, brand, categories,
    followerCount: profile.followerCount,
    growthPlan,
    dataQuality: profile.dataQuality,
    playsSource: metrics.effectivePlaysSource,
  })
  const dealPricing = buildDealPricing({
    brand, followerCount: profile.followerCount, videoCount: profile.videoCount,
    metrics, risks, categoryLabel, regionLabel,
  })
  const thirtyDayPlan = buildThirtyDayPlan({
    snapshot: commercialSnapshot, metrics, cadence, contentStrategy, brandMatching,
    followerCount: profile.followerCount, risks,
  })
  // ── B5a 支柱叙事：10 维 → 6 支柱映射 + 估值展示 v2（内部引擎不动）──
  const pillars = buildPillars({ dims, metrics, posts: profile.posts, risks })
  const valuationV2 = buildValuationV2({
    mid: business.totalValue.mid,
    risks,
    videoCount: profile.videoCount,
    dataQuality: profile.dataQuality,
    outlierBreakout: metrics.effectiveAvgPlays > 0 && metrics.effectivePeakPlays > metrics.effectiveAvgPlays * 8,
  })
  const { verdict, advice } = buildVerdict({ score, tier, tierReason, nickname: profile.nickname || profile.username, metrics, health, dims, risks, categories, businessValueMid: business.totalValue.mid })
  const priceAdvice = buildPriceAdvice({ perVideoLow: brand.perVideoLow, perVideoMid: brand.perVideoMid, perVideoHigh: brand.perVideoHigh, effectiveAvgPlays: metrics.effectiveAvgPlays, categoryLabel, cpm: categoryCpm, engagementMult, regionLabel, regionMult, risks })
  const peerBench = buildPeerBenchmark(profile, metrics)
  const calculationMetadata: CalculationMetadata = {
    effectiveAvgPlays: metrics.effectiveAvgPlays, effectivePeakPlays: metrics.effectivePeakPlays,
    matureVideoCount: ep.matureVideoCount, excludedImmatureCount: ep.immatureCount, excludedGrowingCount: ep.growingCount,
    brandCpm: categoryCpm, engagementMultiplier: engagementMult, regionMultiplier: regionMult,
    categoryForCpm: categoryLabel, regionLabel, perVideoBrandDealMid: brand.perVideoMid, monthlyBrandPosts: brand.monthlyBrandPosts,
    likePlayRatio: metrics.likePlayRatio, playsSource: ep.source,
  }
  return {
    username: profile.username, nickname: profile.nickname || profile.username, score, tier,
    summary: buildSummary({ profile: { nickname: profile.nickname, followerCount: profile.followerCount }, dims, metrics, tier, tierReason, categories, percentile: peerBench.percentile, businessValueMid: business.totalValue.mid }),
    dimensions: dims, metrics, riskFlags: risks, verdict, advice, priceAdvice,
    accountHealth: health, contentCadence: cadence, engagementQuality: buildEngagementQuality(metrics, profile, classified),
    peerBenchmark: peerBench, brandPotential, monetizationPath: buildMonetizationPath(profile, metrics, income),
    growthPlan,
    incomeEstimate: income, businessValue: business,
    brandDealPerVideo: {
      low: brand.perVideoLow,
      mid: brand.perVideoMid,
      high: brand.perVideoHigh,
      monthlyBrandPosts: brand.monthlyBrandPosts,
    },
    accountProfile: buildAccountProfile(profile, metrics, categories, cadence),
    revenueRoadmap: roadmap,
    contentStrategy,
    peerRanking: buildPeerRanking(metrics, peerBench, profile.followerCount),
    brandMatching,
    trendAnalysis: buildTrendAnalysis(metrics, cadence),
    commercializationAdvice: buildCommercializationAdvice(categories, dims, income, profile.followerCount),
    commerceReadiness: buildCommerceReadiness({ profile, metrics, categories, income, cadence, dims }),
    computedAt: new Date().toISOString(), avatar: profile.avatar, bio: profile.bio,
    followerCount: profile.followerCount, followingCount: profile.followingCount, totalLikes: profile.totalLikes, videoCount: profile.videoCount,
    verified: profile.verified, region: profile.region, posts: profile.posts,
    formulaVersion: 'v2', calculationMetadata,
    dataQuality: (profile.dataQuality as 'full' | 'partial' | undefined),
    postsFetchError: profile.postsFetchError,
    commercialSnapshot, dealPricing, thirtyDayPlan,
    pillars, valuationV2,
  }
}
