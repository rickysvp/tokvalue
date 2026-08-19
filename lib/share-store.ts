import type {
  Evaluation,
  AccountProfile,
  BusinessValue,
  IncomeEstimate,
  Metrics,
  PeerRanking,
  ReportSummary,
} from '@/types'
import type { NeonQueryFunction } from '@neondatabase/serverless'

const DATABASE_URL = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').replace(/\s+/g, '')

// 分享链接有效期（天）——与分享页文案 "Share links are valid for 30 days" 保持一致
const SHARE_TTL_DAYS = 30
// 单个邮箱每日创建分享链接次数上限
const SHARE_DAILY_LIMIT = 10

let sql: NeonQueryFunction<false, false> | null = null
let initPromise: Promise<void> | null = null

async function getSql(): Promise<NeonQueryFunction<false, false>> {
  if (sql) return sql
  const { neon } = await import('@neondatabase/serverless')
  sql = neon(DATABASE_URL)
  return sql
}

async function initTable(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const s = await getSql()
      await s`
        CREATE TABLE IF NOT EXISTS shares (
          id TEXT PRIMARY KEY,
          evaluation JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
      await s`CREATE INDEX IF NOT EXISTS idx_shares_created ON shares(created_at)`
      // Migration: 分享链接过期时间；存量记录无 expires_at 时按 created_at + 30 天计算
      await s`ALTER TABLE shares ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`
      // Migration: 分享归属账号（延期/撤销/列表按 username 定位）；存量行 username 为 NULL 时按 evaluation.username 判断
      await s`ALTER TABLE shares ADD COLUMN IF NOT EXISTS username TEXT`
      // 分享创建限流表（模式同 db.ts 的 free_rate_limits：email + date_key + count）
      await s`
        CREATE TABLE IF NOT EXISTS share_rate_limits (
          email TEXT NOT NULL,
          date_key DATE NOT NULL,
          count INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (email, date_key)
        )
      `
    })()
  }
  return initPromise
}

/**
 * 分享快照白名单类型：仅包含分享页（app/share/[id]/page.tsx）实际渲染的字段。
 * growthPlan / revenueRoadmap / brandMatching / trendAnalysis / contentStrategy /
 * monetizationPath / commerceReadiness 等付费模块一律不入快照，防止分享链路成为付费墙后门。
 */
type ShareSnapshot = Pick<
  Evaluation,
  | 'username' | 'nickname' | 'avatar' | 'score' | 'tier' | 'verdict' | 'advice'
  | 'dimensions' | 'computedAt' | 'bio' | 'verified' | 'region'
  | 'followerCount' | 'followingCount' | 'totalLikes' | 'videoCount'
> & {
  summary: Pick<ReportSummary, 'headline' | 'strengths' | 'weaknesses'>
  businessValue: Pick<BusinessValue, 'totalValue' | 'components'>
  incomeEstimate: Pick<IncomeEstimate, 'monthlyTotal' | 'breakdown' | 'categoryCpm' | 'categoryLabel' | 'regionLabel'>
  accountProfile: AccountProfile
  metrics: Pick<Metrics, 'engagementRate' | 'avgPlays' | 'avgLikes' | 'avgComments' | 'avgShares'>
  peerRanking?: Pick<PeerRanking, 'overallPercentile' | 'tierLabel' | 'peerGroupDescription' | 'insight'> & {
    rankingBreakdown: PeerRanking['rankingBreakdown']
  }
}

/**
 * 将（完整或存量的）Evaluation 裁剪为分享快照白名单。
 * createShare（写入）与 getShare（读取，含存量旧记录）共用此函数，
 * 确保旧 share 记录中的付费模块数据也不会经 GET 泄漏。
 */
function toShareSnapshot(raw: Partial<Evaluation>): ShareSnapshot {
  const summary = raw.summary
  const businessValue = raw.businessValue
  const incomeEstimate = raw.incomeEstimate
  const metrics = raw.metrics
  const peerRanking = raw.peerRanking

  return {
    username: raw.username || 'unknown',
    nickname: raw.nickname || raw.username || 'Unknown',
    avatar: raw.avatar || raw.avatarData || undefined,
    score: Number(raw.score) || 0,
    tier: raw.tier || 'C',
    verdict: raw.verdict || '',
    advice: raw.advice || '',
    dimensions: raw.dimensions || {
      reach: 0, engagement: 0, content: 0, authenticity: 0, momentum: 0,
      stability: 0, commerce: 0, monetization: 0, health: 0, influence: 0,
    },
    summary: {
      headline: summary?.headline || '',
      strengths: Array.isArray(summary?.strengths) ? summary.strengths : [],
      weaknesses: Array.isArray(summary?.weaknesses) ? summary.weaknesses : [],
    },
    businessValue: {
      totalValue: businessValue?.totalValue || { low: 0, mid: 0, high: 0 },
      components: Array.isArray(businessValue?.components) ? businessValue.components : [],
    },
    incomeEstimate: {
      monthlyTotal: incomeEstimate?.monthlyTotal || { low: 0, mid: 0, high: 0 },
      breakdown: Array.isArray(incomeEstimate?.breakdown) ? incomeEstimate.breakdown : [],
      categoryCpm: Number(incomeEstimate?.categoryCpm) || 0,
      categoryLabel: incomeEstimate?.categoryLabel || '',
      regionLabel: incomeEstimate?.regionLabel || '',
    },
    accountProfile: raw.accountProfile || {
      categories: [], personaType: '', postingRhythm: '', audienceRegion: '', contentStyle: '',
    },
    metrics: {
      engagementRate: Number(metrics?.engagementRate) || 0,
      avgPlays: Number(metrics?.avgPlays) || 0,
      avgLikes: Number(metrics?.avgLikes) || 0,
      avgComments: Number(metrics?.avgComments) || 0,
      avgShares: Number(metrics?.avgShares) || 0,
    },
    followerCount: Number(raw.followerCount) || 0,
    followingCount: Number(raw.followingCount) || 0,
    totalLikes: Number(raw.totalLikes) || 0,
    videoCount: Number(raw.videoCount) || 0,
    verified: raw.verified ?? undefined,
    bio: raw.bio || undefined,
    region: raw.region || undefined,
    computedAt: raw.computedAt ? String(raw.computedAt) : new Date().toISOString(),
    peerRanking: peerRanking ? {
      overallPercentile: Number(peerRanking.overallPercentile) || 0,
      tierLabel: peerRanking.tierLabel || '',
      peerGroupDescription: peerRanking.peerGroupDescription || '',
      insight: peerRanking.insight || '',
      // 分享页仅渲染前 5 条，超出部分不入快照
      rankingBreakdown: Array.isArray(peerRanking.rankingBreakdown)
        ? peerRanking.rankingBreakdown.slice(0, 5)
        : [],
    } : undefined,
  }
}

// metrics 空默认：补全 Evaluation['metrics'] 类型所需字段，不含任何真实数据
const EMPTY_METRICS: Metrics = {
  engagementRate: 0, avgPlays: 0, avgLikes: 0, avgComments: 0, avgShares: 0,
  likesPerVideo: 0, followerFollowingRatio: 0, recentMedianPlays: 0, olderMedianPlays: 0,
  playGrowth: 0, cvPlays: 0, daysSinceLastPost: 0, topPostPlays: 0, topPostLikes: 0,
  matureMedianPlays: 0, matureWeightedAvgPlays: 0, historicalImpliedPlays: 0,
  immatureVideoCount: 0, growingVideoCount: 0, likePlayRatio: 0,
  effectivePlaysSource: 'fallback', effectiveAvgPlays: 0, effectivePeakPlays: 0,
}

/**
 * 将白名单快照补全为完整 Evaluation 形状（付费模块一律填空默认值，绝不回填真实数据）。
 * 分享页按 Evaluation 类型访问字段，缺失会导致客户端渲染崩溃。
 */
function ensureEvaluationFields(snapshot: ShareSnapshot): Evaluation {
  return {
    // ── 白名单字段（分享页实际渲染）──
    username: snapshot.username,
    nickname: snapshot.nickname,
    avatar: snapshot.avatar,
    score: snapshot.score,
    tier: (snapshot.tier || 'C') as Evaluation['tier'],
    verdict: snapshot.verdict,
    advice: snapshot.advice,
    dimensions: snapshot.dimensions,
    summary: { ...snapshot.summary, targetAudience: '', bestAction: '' },
    businessValue: { ...snapshot.businessValue, summary: '' },
    incomeEstimate: { ...snapshot.incomeEstimate, categoryRpm: 0, regionMultiplier: 1, summary: '' },
    accountProfile: snapshot.accountProfile,
    metrics: { ...EMPTY_METRICS, ...snapshot.metrics },
    peerRanking: snapshot.peerRanking || {
      overallPercentile: 0, tierLabel: '', peerGroupDescription: '', rankingBreakdown: [], insight: '',
    },
    followerCount: snapshot.followerCount,
    followingCount: snapshot.followingCount,
    totalLikes: snapshot.totalLikes,
    videoCount: snapshot.videoCount,
    verified: snapshot.verified,
    bio: snapshot.bio,
    region: snapshot.region,
    computedAt: snapshot.computedAt,
    // ── 付费模块：固定空默认，防止泄漏 ──
    riskFlags: [],
    priceAdvice: '',
    accountHealth: {
      overallScore: 0, shadowbanRisk: 'low', shadowbanSignals: [], growthAnomaly: 'normal',
      growthAnomalyReason: '', engagementAuthenticity: 0, fakeFollowerEstimate: 0, healthReasoning: '',
    },
    contentCadence: {
      postingRhythm: 'irregular', avgPostsPerDay: 0, avgPostsPerWeek: 0, bestTimeSlots: [],
      bestWeekdays: [], consistencyScore: 0, cadenceAdvice: '',
    },
    engagementQuality: {
      conversationDepth: 0, shareRatio: 0, commentLikeRatio: 0, completionRate: null,
      viralCoefficient: 0, topEngagers: [], qualityReasoning: '',
    },
    peerBenchmark: { percentile: 0, peerGroupSize: '', benchmarks: [], similarCreators: [] },
    brandPotential: {
      brandScore: 0, estimatedCPM: 0, audienceSpendingPower: 'low', suitableCategories: [],
      collaborationTypes: [], brandReasoning: '',
    },
    monetizationPath: {
      eligiblePrograms: [], nearestThreshold: null,
      estimatedMonthlyUsd: { low: 0, mid: 0, high: 0 }, pathReasoning: '',
    },
    growthPlan: { items: [], summary: '' },
    revenueRoadmap: {
      currentMonthly: { low: 0, mid: 0, high: 0 }, projections: [],
      total12Month: { low: 0, mid: 0, high: 0 }, summary: '',
    },
    contentStrategy: {
      pillars: [], recommendedHashtags: [], optimalSchedule: [],
      videoDuration: { min: 15, max: 60, label: '15-60秒（通用短视频最佳时长）' },
      collaborationIdeas: [], summary: '',
    },
    brandMatching: { matches: [], totalBrandValue: { low: 0, mid: 0, high: 0 }, summary: '' },
    trendAnalysis: { trendingTopics: [], trendingSounds: [], contentPredictions: [], bestPostTimes: [], summary: '' },
    commercializationAdvice: {
      directions: [], primaryRecommendation: '', secondaryRecommendation: '',
      estimatedTotalMonthly: { low: 0, mid: 0, high: 0 }, summary: '',
    },
    commerceReadiness: {
      overallScore: 0, tier: 'Limited', summary: '', channels: [], signals: [],
      productMatches: [], contentCommerceRatio: 0, recommendation: '',
    },
  }
}

/**
 * 分享创建限流：per-email 每日 ≤ SHARE_DAILY_LIMIT 次（尝试即计数，防批量枚举创建）。
 * 模式同 db.ts 的 free_rate_limits：INSERT ON CONFLICT DO UPDATE RETURNING count。
 * 限流表故障时 fail-closed（拒绝创建），避免限流被绕过。
 */
export async function checkShareRateLimit(email: string): Promise<boolean> {
  await initTable()
  const s = await getSql()
  const key = email.toLowerCase().trim()
  const dateKey = new Date().toISOString().slice(0, 10)

  try {
    const rows = await s`
      INSERT INTO share_rate_limits (email, date_key, count)
      VALUES (${key}, ${dateKey}::date, 1)
      ON CONFLICT (email, date_key) DO UPDATE SET count = share_rate_limits.count + 1
      RETURNING count
    ` as Array<{ count: number }>
    const count = Number(rows[0]?.count || 0)
    return count <= SHARE_DAILY_LIMIT
  } catch (err) {
    console.warn('[share-store] checkShareRateLimit failed:', err)
    return false
  }
}

/**
 * 分享所有权校验：该 username 的评估必须由当前邮箱用户付费完成。
 * 按用户收费、不共享：以 evaluation_ownership 表为单一事实源（is_free=false）。
 * 免费评估不可分享（产品决策）。
 */
export async function checkShareOwnership(
  username: string,
  email: string,
): Promise<'ok' | 'not_found' | 'forbidden'> {
  const s = await getSql()
  const normalized = username.trim().replace(/^@/, '').toLowerCase()
  const key = email.toLowerCase().trim()

  const rows = await s`
    SELECT is_free FROM evaluation_ownership WHERE email = ${key} AND username = ${normalized}
  `
  const row = rows[0] as { is_free: boolean | null } | undefined
  if (!row) return 'not_found'
  if (row.is_free === true) return 'forbidden'
  return 'ok'
}

export async function createShare(evaluation: Evaluation): Promise<string> {
  await initTable()
  const s = await getSql()

  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12)

  // 只存白名单快照（付费模块不入库），并写入过期时间与归属账号
  const snapshot = toShareSnapshot(evaluation)
  const expiresAt = new Date(Date.now() + SHARE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const username = snapshot.username.trim().replace(/^@/, '').toLowerCase()

  await s`
    INSERT INTO shares (id, username, evaluation, created_at, expires_at)
    VALUES (${id}, ${username}, ${JSON.stringify(snapshot)}::jsonb, NOW(), ${expiresAt}::timestamptz)
  `

  return id
}

/**
 * 按 ID 获取分享内容。
 * - 读取时同样过一遍白名单快照：存量旧 share 记录可能存有完整付费模块数据，防止经此接口泄漏
 * - 过期判定：新记录看 expires_at；存量旧记录无 expires_at 时按 created_at + 30 天计算
 * - expired=true 时调用方应返回 410
 */
export async function getShare(id: string): Promise<{ evaluation: Evaluation; expired: boolean } | null> {
  await initTable()
  const s = await getSql()

  const rows = await s`
    SELECT evaluation, COALESCE(expires_at, created_at + INTERVAL '30 days') AS effective_expires_at
    FROM shares WHERE id = ${id}
  `
  if (!rows[0]) return null

  const expired = new Date(String(rows[0].effective_expires_at)).getTime() <= Date.now()
  const snapshot = toShareSnapshot((rows[0].evaluation as Partial<Evaluation>) || {})
  return { evaluation: ensureEvaluationFields(snapshot), expired }
}

// ── 分享管理（B5b Reports 页：延期 / 撤销 / 列表）──

/** 分享行 → 归属 username：新记录读 username 列；存量行 username 为 NULL 时按 evaluation.username 判断 */
function shareRowUsername(row: { username?: string | null; evaluation: unknown }): string {
  const fromColumn = row.username ? String(row.username).trim().replace(/^@/, '').toLowerCase() : ''
  if (fromColumn) return fromColumn
  const evalUsername = (row.evaluation as Partial<Evaluation> | null)?.username
  return evalUsername ? evalUsername.trim().replace(/^@/, '').toLowerCase() : ''
}

/**
 * 延期分享链接：expires_at = NOW() + 30 天。
 * 所有权校验同 createShare（evaluation_ownership，is_free=false）；已过期/已撤销的分享不可复活。
 */
export async function extendShare(
  id: string,
  email: string,
): Promise<{ ok: true; expiresAt: string } | { ok: false; reason: 'not_found' | 'forbidden' }> {
  await initTable()
  const s = await getSql()

  const rows = await s`
    SELECT username, evaluation,
           COALESCE(expires_at, created_at + INTERVAL '30 days') AS effective_expires_at
    FROM shares WHERE id = ${id}
  `
  const row = rows[0] as { username?: string | null; evaluation: unknown; effective_expires_at?: unknown } | undefined
  if (!row) return { ok: false, reason: 'not_found' }
  // 已过期/已撤销的链接不可延期复活
  if (new Date(String(row.effective_expires_at)).getTime() <= Date.now()) {
    return { ok: false, reason: 'not_found' }
  }

  const username = shareRowUsername(row)
  if (!username) return { ok: false, reason: 'not_found' }

  const ownership = await checkShareOwnership(username, email)
  if (ownership !== 'ok') return { ok: false, reason: ownership }

  const expiresAt = new Date(Date.now() + SHARE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
  await s`UPDATE shares SET expires_at = ${expiresAt}::timestamptz WHERE id = ${id}`
  return { ok: true, expiresAt }
}

/**
 * 撤销分享链接：expires_at = NOW()（立即失效，幂等）。
 * 所有权校验同 createShare（evaluation_ownership，is_free=false）。
 */
export async function revokeShare(
  id: string,
  email: string,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'forbidden' }> {
  await initTable()
  const s = await getSql()

  const rows = await s`SELECT username, evaluation FROM shares WHERE id = ${id}`
  const row = rows[0] as { username?: string | null; evaluation: unknown } | undefined
  if (!row) return { ok: false, reason: 'not_found' }

  const username = shareRowUsername(row)
  if (!username) return { ok: false, reason: 'not_found' }

  const ownership = await checkShareOwnership(username, email)
  if (ownership !== 'ok') return { ok: false, reason: ownership }

  await s`UPDATE shares SET expires_at = NOW() WHERE id = ${id}`
  return { ok: true }
}

export interface ShareListItem {
  id: string
  createdAt: string
  expiresAt: string
}

/**
 * 列出该用户该账号的活跃分享（未过期）。
 * 所有权校验同 createShare：仅付费拥有该账号的用户可见（否则返回空列表）。
 */
export async function listShares(email: string, username: string): Promise<ShareListItem[]> {
  await initTable()
  const s = await getSql()

  const normalized = username.trim().replace(/^@/, '').toLowerCase()
  const ownership = await checkShareOwnership(normalized, email)
  if (ownership !== 'ok') return []

  const rows = await s`
    SELECT id, created_at,
           COALESCE(expires_at, created_at + INTERVAL '30 days') AS effective_expires_at
    FROM shares
    WHERE (username = ${normalized} OR (username IS NULL AND lower(evaluation->>'username') = ${normalized}))
      AND COALESCE(expires_at, created_at + INTERVAL '30 days') > NOW()
    ORDER BY created_at DESC
  `

  return (rows as Array<Record<string, unknown>>).map(r => ({
    id: String(r.id),
    createdAt: String(r.created_at),
    expiresAt: String(r.effective_expires_at),
  }))
}

// Clean expired shares (older than 30 days) — called periodically
export async function cleanOldShares(): Promise<void> {
  try {
    await initTable()
    const s = await getSql()
    await s`DELETE FROM shares WHERE COALESCE(expires_at, created_at + INTERVAL '30 days') < NOW()`
  } catch (err) {
    console.warn('[share-store] cleanOldShares failed:', err)
  }
}
