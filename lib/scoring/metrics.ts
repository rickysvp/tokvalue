import { Post, RawProfile } from '../../types'
import { MATURITY_WINDOWS, LIKE_PLAY_RATIO_RANGE, DEFAULT_PLAY_FOLLOWER_RATIO, clamp } from './config'

export type PostMaturity = 'immature' | 'growing' | 'mature' | 'archive'

export interface ClassifiedPost {
  post: Post
  maturity: PostMaturity
  ageHours: number
  ageDays: number
}

function medianOf(nums: number[]): number {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

function getAgeHours(createTime: number, now: number = Date.now() / 1000): number {
  return (now - createTime) / 3600
}

export function classifyPostMaturity(createTime: number, now: number = Date.now() / 1000): { maturity: PostMaturity; ageHours: number; ageDays: number } {
  // createTime 缺失或异常时直接归为 mature，避免被算成 56 年前导致 archive
  if (!createTime || createTime <= 0) return { maturity: 'mature', ageHours: 72, ageDays: 3 }
  const ageHours = getAgeHours(createTime, now)
  const ageDays = ageHours / 24
  const { immatureHours, growingHours, matureDays } = MATURITY_WINDOWS
  let maturity: PostMaturity
  if (ageHours < immatureHours) maturity = 'immature'
  else if (ageHours < growingHours) maturity = 'growing'
  else if (ageDays <= matureDays) maturity = 'mature'
  else maturity = 'archive'
  return { maturity, ageHours, ageDays }
}

export function classifyAllPosts(posts: Post[], now: number = Date.now() / 1000): {
  all: ClassifiedPost[]
  immature: ClassifiedPost[]
  growing: ClassifiedPost[]
  mature: ClassifiedPost[]
  archive: ClassifiedPost[]
} {
  const all = posts.map(p => ({ post: p, ...classifyPostMaturity(p.createTime, now) }))
  return {
    all,
    immature: all.filter(p => p.maturity === 'immature'),
    growing: all.filter(p => p.maturity === 'growing'),
    mature: all.filter(p => p.maturity === 'mature'),
    archive: all.filter(p => p.maturity === 'archive'),
  }
}

export function calcLikePlayRatio(maturePosts: ClassifiedPost[]): number {
  if (!maturePosts.length) return 0.05
  let totalLikes = 0, totalPlays = 0
  for (const { post } of maturePosts) {
    // 仅排除无播放的帖子；保留零点赞帖子，避免误判差内容
    if (post.playCount > 0) {
      totalLikes += post.likeCount || 0
      totalPlays += post.playCount
    }
  }
  if (totalPlays === 0) return 0.05
  const ratio = totalLikes / totalPlays
  return clamp(ratio, LIKE_PLAY_RATIO_RANGE.min, LIKE_PLAY_RATIO_RANGE.max)
}

export function calcMatureWeightedMedianPlays(maturePosts: ClassifiedPost[]): number {
  if (!maturePosts.length) return 0
  const sorted = [...maturePosts].sort((a, b) => a.post.playCount - b.post.playCount)
  const weights: number[] = []
  let totalW = 0
  for (const { ageDays } of sorted) {
    const w = Math.exp(-ageDays / 20)
    weights.push(w)
    totalW += w
  }
  let cum = 0
  for (let i = 0; i < sorted.length; i++) {
    cum += weights[i]
    if (cum >= totalW / 2) return sorted[i].post.playCount
  }
  return sorted[sorted.length - 1].post.playCount
}

export function calcMatureWeightedAvgPlays(maturePosts: ClassifiedPost[]): number {
  if (!maturePosts.length) return 0
  let weightedSum = 0, totalW = 0
  for (const { post, ageDays } of maturePosts) {
    const w = Math.exp(-ageDays / 20)
    weightedSum += post.playCount * w
    totalW += w
  }
  return totalW > 0 ? weightedSum / totalW : 0
}

export function calcWeightedEngagementRate(posts: ClassifiedPost[]): number {
  let totalEng = 0, totalPlays = 0
  for (const { post } of posts) {
    if (post.playCount > 0) {
      totalEng += (post.likeCount + post.commentCount + post.shareCount)
      totalPlays += post.playCount
    }
  }
  return totalPlays > 0 ? (totalEng / totalPlays) * 100 : 0
}

export function calcHistoricalImpliedPlays(profile: RawProfile, likePlayRatio: number): number {
  if (profile.videoCount <= 0 || likePlayRatio <= 0) return 0
  const avgLikesPerVideo = profile.totalLikes / profile.videoCount
  return avgLikesPerVideo / likePlayRatio
}

export interface EffectivePlaysResult {
  effectiveAvgPlays: number
  effectivePeakPlays: number
  matureVideoCount: number
  immatureCount: number
  growingCount: number
  archiveCount: number
  matureWeightedAvg: number
  matureWeightedMedian: number
  historicalImpliedPlays: number
  likePlayRatio: number
  source: 'mature+historical' | 'mature-only' | 'historical-only' | 'fallback'
  excludedReason?: string
}

export function calcEffectivePlays(profile: RawProfile, now: number = Date.now() / 1000): EffectivePlaysResult {
  const classified = classifyAllPosts(profile.posts, now)
  const { mature, immature, growing, archive } = classified

  const matureCount = mature.length
  const immatureCount = immature.length
  const growingCount = growing.length
  const archiveCount = archive.length

  const likePlayRatio = calcLikePlayRatio(mature)

  const matureWeightedAvg = calcMatureWeightedAvgPlays(mature)
  const matureWeightedMedian = calcMatureWeightedMedianPlays(mature)

  const historicalImplied = calcHistoricalImpliedPlays(profile, likePlayRatio)

  const allPlays = profile.posts.map(p => p.playCount).filter(p => p > 0)
  const effectivePeakPlays = allPlays.length ? Math.max(...allPlays) : 0

  // 历史 archive 帖中位数：30 天前帖子证明的真实稳定触达水平
  // 用于「断更/低频」号兜底——成熟帖不足或仍处冷启动时，不能拿冷启动低播当真实水平
  const archivePlays = archive.map(c => c.post.playCount).filter(p => p > 0)
  const archiveMedian = medianOf(archivePlays)

  let effectiveAvgPlays = 0
  let source: EffectivePlaysResult['source'] = 'fallback'
  let excludedReason: string | undefined

  // 稳健核心：成熟帖加权中位数（抗爆款污染）。
  // 播放分布高度偏态（历史爆款 + 大量普通帖）时，均值会被爆款拉高 3-4 倍，
  // 中位数才是「稳定触达」的无偏估计。
  const median = matureWeightedMedian > 0 ? matureWeightedMedian : matureWeightedAvg

  if (matureCount >= 5) {
    if (historicalImplied > 0) {
      // 历史隐含播放作参考，clamp 到中位数 [0.5x, 2x] 防止历史爆款污染（如过气号靠千万级爆款撑估值）
      const impliedCapped = clamp(historicalImplied, median * 0.5, median * 2)
      effectiveAvgPlays = median * 0.6 + impliedCapped * 0.4
      source = 'mature+historical'
    } else {
      effectiveAvgPlays = median
      source = 'mature-only'
      excludedReason = 'Insufficient historical data — score based on mature videos only'
    }
  } else if (matureCount > 0) {
    if (historicalImplied > 0) {
      const impliedCapped = clamp(historicalImplied, median * 0.5, median * 2)
      effectiveAvgPlays = median * 0.5 + impliedCapped * 0.5
      source = 'mature+historical'
      excludedReason = `Only ${matureCount} mature videos, ${immatureCount} videos still in cold-start — primarily using historical aggregate data`
    } else {
      effectiveAvgPlays = median
      source = 'mature-only'
      excludedReason = 'Insufficient historical data — score based on mature videos only'
    }
    // 成熟帖不足时，若 archive 历史中位数显著高于当前成熟帖（断更/低频导致的冷启动低播），
    // 用 archive 中位数兜底（×0.55 反映历史数据的时效折损），避免「真实 30 万触达被 2 条冷启动帖拉到 4.5 万」
    if (archiveMedian > median) {
      effectiveAvgPlays = Math.max(effectiveAvgPlays, archiveMedian * 0.55)
      excludedReason = `Only ${matureCount} mature videos but ${archive.length} archived videos show healthy historical reach (median ${Math.round(archiveMedian).toLocaleString()}) — using historical baseline`
    }
  } else if (immatureCount + growingCount > 0 && historicalImplied > 0) {
    effectiveAvgPlays = historicalImplied
    source = 'historical-only'
    excludedReason = `Recent ${immatureCount + growingCount} videos are all in cold-start/growth phase — excluded from avg plays; using historical aggregate data`
  } else {
    effectiveAvgPlays = profile.followerCount * DEFAULT_PLAY_FOLLOWER_RATIO
    source = 'fallback'
    excludedReason = 'Insufficient video data — estimating plays at 20% of follower count'
  }

  effectiveAvgPlays = Math.max(effectiveAvgPlays, 100)
  effectiveAvgPlays = clamp(effectiveAvgPlays, 100, Math.max(profile.followerCount * 50, 100000))

  return {
    effectiveAvgPlays: Math.round(effectiveAvgPlays),
    effectivePeakPlays: Math.round(effectivePeakPlays),
    matureVideoCount: matureCount,
    immatureCount,
    growingCount,
    archiveCount,
    matureWeightedAvg: Math.round(matureWeightedAvg),
    matureWeightedMedian: Math.round(matureWeightedMedian),
    historicalImpliedPlays: Math.round(historicalImplied),
    likePlayRatio: Math.round(likePlayRatio * 10000) / 10000,
    source,
    excludedReason,
  }
}

export function calcOverallEngagement(profile: RawProfile, now: number = Date.now() / 1000): number {
  const classified = classifyAllPosts(profile.posts, now)
  const relevant = [...classified.mature, ...classified.growing]
  if (!relevant.length) return 0
  return calcWeightedEngagementRate(relevant)
}

export function calcWindowedPlayGrowth(profile: RawProfile, now: number = Date.now() / 1000): {
  playGrowth30d: number
  playGrowth60d: number
  playGrowth90d: number
  playGrowth: number
} {
  const classified = classifyAllPosts(profile.posts, now)
  const { mature, growing } = classified
  const relevant = [...mature, ...growing]

  const avgIn = (days: number): number => {
    const inWindow = relevant.filter(p => p.ageDays <= days)
    if (inWindow.length < 2) return 0
    return inWindow.reduce((s, p) => s + p.post.playCount, 0) / inWindow.length
  }
  const avgBefore = (days: number): number => {
    const before = relevant.filter(p => p.ageDays > days)
    if (before.length < 2) return 0
    return before.reduce((s, p) => s + p.post.playCount, 0) / before.length
  }

  const recent30 = avgIn(30)
  const recent60 = avgIn(60)
  const older60 = avgBefore(60)

  let growth = 0
  if (recent30 > 0 && avgBefore(30) > 0) {
    growth = (recent30 - avgBefore(30)) / avgBefore(30)
  } else if (recent60 > 0 && older60 > 0) {
    growth = (recent60 - older60) / older60
  }
  growth = clamp(growth, -0.8, 5.0)

  return {
    playGrowth30d: recent30 > 0 && avgBefore(30) > 0 ? (recent30 - avgBefore(30)) / avgBefore(30) : 0,
    playGrowth60d: recent60 > 0 && older60 > 0 ? (recent60 - older60) / older60 : 0,
    playGrowth90d: 0,
    playGrowth: growth,
  }
}

export function calcMaturePlayCV(maturePosts: ClassifiedPost[]): number {
  if (maturePosts.length < 3) return 1.0
  const plays = maturePosts.map(p => p.post.playCount)
  const mean = plays.reduce((a, b) => a + b, 0) / plays.length
  if (mean <= 0) return 2.0
  const variance = plays.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / plays.length
  return Math.sqrt(variance) / mean
}
