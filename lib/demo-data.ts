import { Evaluation } from '@/types'
import { hydrateCommercial } from './scoring/commercial'
import { buildPillars, buildValuationV2 } from './pillar'

// 示例报告数据：面向 30 万粉健身创作者的写实样本。
// 顶部由 EvaluatePage 渲染统一 "Sample report" 横幅（mock: true），
// 因此字段文案不再加 [DEMO] 前缀——保持与真实报告完全一致的观感。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DEMO_RAW = {
  username: 'demo',
  nickname: 'Demo Creator (sample data)',
  score: 72,
  tier: 'A',
  mock: true,
  followerCount: 300_000,
  followingCount: 1_500,
  totalLikes: 9_000_000,
  videoCount: 280,
  verified: false,
  region: 'US',
  avatar: undefined,
  bio: 'Fitness coach helping busy people train at home · 30-day challenges every month',
  computedAt: new Date().toISOString(),
  dataQuality: 'full' as const,
  formulaVersion: 'v2',
  metrics: {
    engagementRate: 7.5, avgPlays: 50_000, avgLikes: 30_000, avgComments: 2_000,
    avgShares: 3_000, likesPerVideo: 30_000, followerFollowingRatio: 200,
    recentMedianPlays: 55_000, olderMedianPlays: 40_000, playGrowth: 0.35, cvPlays: 0.8,
    daysSinceLastPost: 1, topPostPlays: 200_000, topPostLikes: 18_000,
    matureMedianPlays: 60_000, matureWeightedAvgPlays: 60_000, historicalImpliedPlays: 50_000,
    immatureVideoCount: 5, growingVideoCount: 8, likePlayRatio: 0.12,
    effectivePlaysSource: 'mature+historical' as const,
    effectivePlays: 60_000, effectiveAvgPlays: 60_000, effectivePeakPlays: 180_000,
  },
  dimensions: { reach: 68, engagement: 78, content: 71, authenticity: 82,
    momentum: 74, stability: 70, commerce: 65, monetization: 60, health: 85, influence: 68 },
  riskFlags: [],
  // B5a：demo posts（fitness 主题 hashtag 聚焦，供 Niche Clarity 聚类）
  posts: [
    { id: 'd1', playCount: 62_000, likeCount: 30_000, commentCount: 1_900, shareCount: 2_800, createTime: Date.now() - 86_400_000 * 2, desc: 'Full body HIIT — no equipment #fitness #workout #hiit' },
    { id: 'd2', playCount: 55_000, likeCount: 27_000, commentCount: 1_700, shareCount: 2_400, createTime: Date.now() - 86_400_000 * 4, desc: '30-day challenge: day 12 legs #fitness #workout' },
    { id: 'd3', playCount: 71_000, likeCount: 36_000, commentCount: 2_300, shareCount: 3_500, createTime: Date.now() - 86_400_000 * 6, desc: '5 high-protein meal preps under 20 min #fitness #nutrition' },
    { id: 'd4', playCount: 48_000, likeCount: 24_000, commentCount: 1_500, shareCount: 2_100, createTime: Date.now() - 86_400_000 * 8, desc: 'My 6am morning routine #fitness #workout #motivation' },
    { id: 'd5', playCount: 58_000, likeCount: 29_000, commentCount: 1_800, shareCount: 2_600, createTime: Date.now() - 86_400_000 * 10, desc: 'Leg day tutorial — proper form #fitness #workout' },
    { id: 'd6', playCount: 52_000, likeCount: 26_000, commentCount: 1_600, shareCount: 2_300, createTime: Date.now() - 86_400_000 * 12, desc: '10 mobility drills for desk workers #fitness #mobility' },
    { id: 'd7', playCount: 66_000, likeCount: 33_000, commentCount: 2_000, shareCount: 3_000, createTime: Date.now() - 86_400_000 * 14, desc: 'HIIT vs steady state — which burns more? #fitness #hiit' },
    { id: 'd8', playCount: 45_000, likeCount: 22_000, commentCount: 1_400, shareCount: 1_900, createTime: Date.now() - 86_400_000 * 16, desc: 'Home gym setup under $300 #fitness #workout' },
  ],
  summary: {
    headline: 'Established fitness creator with above-average engagement and strong niche focus',
    strengths: ['7.5% engagement rate — well above the 5% average for similar accounts',
      'Views up 35% month-over-month — momentum is on your side',
      'Fitness niche commands premium brand rates (CPM ~$22)'],
    weaknesses: ['No verified badge — completing verification strengthens brand pitches',
      'Audience concentrated in the US — fine for US brands, limits global deals'],
    targetAudience: '18–34 fitness enthusiasts, mostly US-based, interested in home training',
    bestAction: 'Pitch 1–2 micro brand deals per month — your engagement justifies paid partnerships now.',
  },
  verdict: 'Premium Value — a commercially mature account ready for consistent brand deals.',
  advice: 'Post 4x/week to lock in momentum — your recent growth came from consistent uploads.',
  priceAdvice: 'Charge $400 – $1,000 per brand deal based on current reach and engagement.',
  accountHealth: { overallScore: 85, shadowbanRisk: 'low' as const, shadowbanSignals: [],
    growthAnomaly: 'normal' as const, growthAnomalyReason: 'Growth pattern matches organic benchmarks',
    engagementAuthenticity: 95, fakeFollowerEstimate: 2, healthReasoning: 'Engagement ratios look organic — likes, comments and shares are consistent with real audiences.' },
  contentCadence: { postingRhythm: 'daily' as const, avgPostsPerDay: 0.5, avgPostsPerWeek: 4,
    bestTimeSlots: [{ hour: 7, engagementRate: 8.2 }],
    bestWeekdays: [{ weekday: 'Monday', engagementRate: 8.5 }],
    consistencyScore: 82, cadenceAdvice: 'Your 4–5 posts/week rhythm works. Morning uploads (7–9 AM) get the best response.' },
  engagementQuality: { conversationDepth: 2.0, shareRatio: 0.05, commentLikeRatio: 0.07,
    completionRate: null, viralCoefficient: 0.15, topEngagers: [],
    qualityReasoning: 'Healthy comment-to-like and share ratios — your audience interacts, not just scrolls.' },
  peerBenchmark: { percentile: 74, peerGroupSize: '300K-follower fitness creators',
    benchmarks: [{ metric: 'Engagement Rate', userValue: 7.5, peerAvg: 5.0, peerTop10: 9.0, status: 'above' as const },
      { metric: 'Views per Follower (%)', userValue: 16.5, peerAvg: 12, peerTop10: 24, status: 'above' as const },
      { metric: '90-Day Growth (%)', userValue: 35, peerAvg: 18, peerTop10: 45, status: 'above' as const }],
    similarCreators: [] },
  brandPotential: { brandScore: 68, estimatedCPM: 22, audienceSpendingPower: 'medium' as const,
    suitableCategories: ['Fitness', 'Activewear', 'Nutrition'],
    collaborationTypes: [{ type: 'Product Review', fit: 0.88, expectedRevenue: '$400–800/post' },
      { type: 'Tutorial Sponsorship', fit: 0.72, expectedRevenue: '$300–600/post' }],
    brandReasoning: 'Fitness + nutrition content fits supplement and activewear brands naturally — no forced integrations needed.' },
  monetizationPath: { eligiblePrograms: ['tiktokShop', 'subscriptions', 'liveGifts'], nearestThreshold: null,
    estimatedMonthlyUsd: { low: 2_500, mid: 3_000, high: 3_500 },
    pathReasoning: 'Already eligible for TikTok Shop, subscriptions and LIVE gifts — most doors are open at your size.' },
  growthPlan: {
    items: [{ priority: 'high' as const, area: 'Content Consistency', action: 'Keep 4 posts/week',
      expectedImpact: 'Reach 400K followers by Q2' },
      { priority: 'medium' as const, area: 'Brand Outreach', action: 'Pitch 3 brands this month',
        expectedImpact: 'First recurring brand deal' }],
    summary: 'Momentum is real — the next step is turning it into recurring brand income.',
  },
  incomeEstimate: {
    monthlyTotal: { low: 2_500, mid: 3_000, high: 3_500 },
    breakdown: [
      { source: 'brand_deals' as const, label: 'Brand Sponsorships', icon: '💰', monthlyAmount: { low: 1_400, mid: 2_000, high: 2_800 }, percentage: 38, confidence: 'high' as const, detail: 'Based on 4 brand posts/month at your rate range' },
      { source: 'creator_program' as const, label: 'Creator Rewards', icon: '📺', monthlyAmount: { low: 200, mid: 300, high: 400 }, percentage: 10, confidence: 'high' as const, detail: 'Estimated from ~60K qualified views/month' },
      { source: 'subscriptions' as const, label: 'Subscriptions', icon: '⭐', monthlyAmount: { low: 0, mid: 0, high: 0 }, percentage: 0, confidence: 'medium' as const, detail: 'Not activated — could add $200–500/month' },
      { source: 'tiktok_shop' as const, label: 'TikTok Shop', icon: '🛒', monthlyAmount: { low: 300, mid: 400, high: 550 }, percentage: 14, confidence: 'medium' as const, detail: 'Affiliate commissions from product links' },
      { source: 'amazon_associates' as const, label: 'Amazon Associates', icon: '📦', monthlyAmount: { low: 0, mid: 0, high: 0 }, percentage: 0, confidence: 'medium' as const, detail: 'Not active — fits gear-review content' },
      { source: 'shopify_dtc' as const, label: 'Own Products', icon: '🧴', monthlyAmount: { low: 0, mid: 0, high: 0 }, percentage: 0, confidence: 'low' as const, detail: 'No storefront yet — long-term option' },
      { source: 'live_gifts' as const, label: 'LIVE Gifts', icon: '🎁', monthlyAmount: { low: 80, mid: 150, high: 220 }, percentage: 5, confidence: 'low' as const, detail: '1–2 LIVE sessions per week' },
      { source: 'live_commerce' as const, label: 'LIVE Commerce', icon: '🛍️', monthlyAmount: { low: 0, mid: 0, high: 0 }, percentage: 0, confidence: 'low' as const, detail: 'Requires 50K+ followers — you qualify soon' },
    ],
    categoryCpm: 22, categoryRpm: 0.04, regionMultiplier: 1.0,
    categoryLabel: 'Fitness', regionLabel: 'US',
    summary: 'Around $3,000/month today — mostly from brand deals, with room to grow.',
  },
  businessValue: {
    totalValue: { low: 45_000, mid: 75_000, high: 115_000 },
    components: [
      { label: 'Brand Deal Annual Value', icon: '💰', amount: { low: 17_000, mid: 25_000, high: 34_000 }, percentage: 38, detail: 'What brands would pay you over a year at current rates' },
      { label: 'Content Asset Value', icon: '🎬', amount: { low: 6_500, mid: 9_000, high: 12_000 }, percentage: 16, detail: 'Your 280-video library working as reusable marketing assets' },
      { label: 'Follower Asset Value', icon: '👥', amount: { low: 4_500, mid: 7_000, high: 9_000 }, percentage: 13, detail: 'Audience you can reach without paying for ads' },
      { label: 'Monetization Capability', icon: '⚡', amount: { low: 3_500, mid: 5_000, high: 6_500 }, percentage: 9, detail: 'Ready-to-use income channels beyond brand deals' },
      { label: 'IP / Brand Asset', icon: '🏆', amount: { low: 13_000, mid: 16_000, high: 20_000 }, percentage: 24, detail: 'Your name and niche authority as a sellable brand' },
    ],
    summary: 'Total account value ~$75,000 — built mostly on brand-deal earning power.',
  },
  brandDealPerVideo: { low: 400, mid: 700, high: 1_000, monthlyBrandPosts: 4 },
  accountProfile: { categories: ['Fitness', 'Health'], personaType: 'Mid-tier creator',
    postingRhythm: 'Daily', audienceRegion: 'US', contentStyle: 'Tutorials & challenges' },
  revenueRoadmap: {
    currentMonthly: { low: 2_500, mid: 3_000, high: 3_500 },
    projections: [
      { month: 3, label: 'Month 3', revenue: { low: 3_000, mid: 3_500, high: 4_000 }, milestone: 'Cross 400K followers', unlocks: ['Higher brand deal tier'] },
      { month: 6, label: 'Month 6', revenue: { low: 4_000, mid: 5_000, high: 6_000 }, milestone: '2 recurring brand partners', unlocks: ['Premium fitness CPM'] },
      { month: 12, label: 'Month 12', revenue: { low: 6_000, mid: 7_500, high: 9_500 }, milestone: '4 brand deals/month', unlocks: ['Cross-platform expansion'] },
    ],
    total12Month: { low: 56_000, mid: 68_000, high: 82_000 },
    summary: 'Realistic path from $3K to $7.5K/month within a year at current growth.',
  },
  contentStrategy: {
    pillars: [
      { type: 'Workout Tutorial', icon: '🏋️', frequency: '3x/week', expectedEngagement: '4.5–6%', examples: ['30-day challenge', 'HIIT sessions'], why: 'Your highest-retention format — keeps followers coming back' },
      { type: 'Nutrition', icon: '🥗', frequency: '1x/week', expectedEngagement: '3.5–5%', examples: ['Meal prep recipes'], why: 'Opens supplement brand deals' },
      { type: 'Motivation', icon: '💪', frequency: '1x/week', expectedEngagement: '5–7%', examples: ['Morning routines'], why: 'Most shared format — drives follower growth' },
    ],
    recommendedHashtags: [
      { tag: 'fitness', volume: 'high' as const, relevance: 0.95 },
      { tag: 'workout', volume: 'high' as const, relevance: 0.92 },
      { tag: 'homeworkout', volume: 'medium' as const, relevance: 0.85 },
    ],
    optimalSchedule: [
      { day: 'Monday', time: '7:00 AM', format: 'Tutorial' },
      { day: 'Wednesday', time: '7:00 AM', format: 'Tutorial' },
    ],
    videoDuration: { min: 30, max: 90, label: '30-90 seconds' },
    collaborationIdeas: [{ type: 'Supplement brand integration', description: '15-sec product mention inside your meal-prep videos', potential: 'high' as const }],
    summary: 'Double down on tutorials — they carry your engagement.',
  },
  peerRanking: { overallPercentile: 25, tierLabel: 'Top 25%', peerGroupDescription: 'Compared to 300K-follower fitness creators',
    rankingBreakdown: [
      { metric: 'Engagement Rate', value: '7.5%', percentile: 74, barColor: '#00F2EA' },
      { metric: 'Views per Follower', value: '16.5%', percentile: 68, barColor: '#FF0050' },
      { metric: 'Growth', value: '+35%', percentile: 81, barColor: '#22c55e' },
    ],
    insight: 'You outperform 3 of 4 similar creators on engagement — lead with that stat in pitches.' },
  brandMatching: {
    matches: [
      { category: 'Fitness Equipment', icon: '🏋️', fitScore: 88, estimatedDealRange: { low: 400, high: 900 }, exampleBrands: ['Resistance band brands', 'Home gym startups'], collaborationType: 'Product Review', reasoning: 'Your home-workout content shows the products in action' },
      { category: 'Activewear', icon: '👟', fitScore: 78, estimatedDealRange: { low: 300, high: 700 }, exampleBrands: ['DTC athletic brands'], collaborationType: 'Tutorial Integration', reasoning: 'Outfit features fit naturally into workout tutorials' },
    ],
    totalBrandValue: { low: 35_000, mid: 50_000, high: 70_000 },
    summary: 'Strongest fits are equipment and activewear — start there.',
  },
  trendAnalysis: {
    trendingTopics: [], trendingSounds: [],
    contentPredictions: [{ direction: 'Home workouts', confidence: 80, expectedEngagement: '4–6%', why: 'Search interest steady for 6+ months' }],
    bestPostTimes: [{ day: 'Monday', hour: 7, score: 8 }],
    summary: 'Home-workout demand remains strong — your core format is on trend.',
  },
  commercializationAdvice: {
    directions: [{
      name: 'Brand Sponsorships', icon: '💰', fitScore: 82, difficulty: 'medium' as const,
      estimatedMonthlyRevenue: { low: 800, mid: 1_400, high: 2_200 }, revenuePotential: 'high' as const,
      description: 'Paid product integrations in your regular tutorials',
      actionSteps: ['Build a 1-page media kit with your stats', 'Pitch 3 activewear or supplement brands'],
      why: 'Your engagement rate is your strongest selling point',
      prerequisites: ['Media kit'],
    }],
    primaryRecommendation: 'Start with 2 product-review deals — easiest to close with your format.',
    secondaryRecommendation: 'Activate TikTok Shop affiliate links for gear you already use.',
    estimatedTotalMonthly: { low: 1_000, mid: 1_800, high: 2_900 },
    summary: 'Brand deals first, affiliate income on top.',
  },
  commerceReadiness: {
    overallScore: 50, tier: 'Emerging' as const,
    summary: 'You can sell, but the pipeline is not systematized yet.',
    channels: [
      { source: 'tiktokShop', label: 'TikTok Shop', icon: '🛒', monthlyAmount: { low: 300, mid: 400, high: 550 }, fitScore: 68, eligible: true, reasoning: 'Eligible now — link gear in video descriptions' },
      { source: 'brandSponsorships', label: 'Brand Sponsorships', icon: '💰', monthlyAmount: { low: 1_400, mid: 2_000, high: 2_800 }, fitScore: 82, eligible: true, reasoning: 'Engagement justifies paid rates today' },
    ],
    signals: [
      { label: 'Clear niche', detected: true, weight: 0.8, detail: 'Fitness content is 90%+ of your library' },
      { label: 'Engagement above niche average', detected: true, weight: 0.9, detail: '7.5% vs 5% peer average' },
    ],
    productMatches: [
      { category: 'Supplements', icon: '💪', fitScore: 85, avgOrderValue: 45, reasoning: 'Nutrition content matches supplement audiences' },
    ],
    contentCommerceRatio: 0.15,
    recommendation: 'Systematize: media kit this week, 3 pitches per month, track response rate.',
  },
  calculationMetadata: {
    effectiveAvgPlays: 60_000, effectivePeakPlays: 180_000, matureVideoCount: 23,
    excludedImmatureCount: 5, excludedGrowingCount: 8, brandCpm: 22,
    engagementMultiplier: 1.8, regionMultiplier: 1.0, categoryForCpm: 'Fitness', regionLabel: 'US',
    perVideoBrandDealMid: 700, monthlyBrandPosts: 4, likePlayRatio: 0.12, playsSource: 'mature videos + historical',
  },
} as Evaluation

// Demo 与线上同构：PMF 派生字段（commercialSnapshot/dealPricing/thirtyDayPlan）走真实引擎；
// B5a v2 字段（6 支柱 + 估值展示 v2）同样走真实纯函数，demo 永远演示首评（Baseline）场景
const DEMO_WITH_V2: Evaluation = {
  ...DEMO_RAW,
  baselineReview: true,
  pillars: buildPillars({
    dims: DEMO_RAW.dimensions,
    metrics: DEMO_RAW.metrics,
    posts: DEMO_RAW.posts ?? [],
    risks: DEMO_RAW.riskFlags,
  }),
  valuationV2: buildValuationV2({
    mid: DEMO_RAW.businessValue.totalValue.mid,
    risks: DEMO_RAW.riskFlags,
    videoCount: DEMO_RAW.videoCount,
    dataQuality: DEMO_RAW.dataQuality,
    outlierBreakout: DEMO_RAW.metrics.effectiveAvgPlays > 0
      && DEMO_RAW.metrics.effectivePeakPlays > DEMO_RAW.metrics.effectiveAvgPlays * 8,
  }),
}

export const DEMO_RESULT = hydrateCommercial(DEMO_WITH_V2)
