import type { Evaluation } from '@/types'
import type { NeonQueryFunction } from '@neondatabase/serverless'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { withFileLock } from '@/lib/file-lock'
import { hashIp } from '@/lib/analytics'

const DATA_DIR = process.env.DATA_DIR || (process.env.VERCEL ? '/tmp' : join(process.cwd(), 'data'))
const DATA_PATH = join(DATA_DIR, 'evaluations.json')
const DATABASE_URL = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').replace(/\s+/g, '')

type Store = 'postgres' | 'file' | 'memory'

let storeType: Store = 'memory'
let memoryFallback: Evaluation[] = []
let sql: NeonQueryFunction<false, false> | null = null

function getSql(): NeonQueryFunction<false, false> {
  if (!sql) throw new Error('[db] Postgres not initialized')
  return sql
}

async function initStore(): Promise<Store> {
  if (storeType !== 'memory') return storeType

  if (DATABASE_URL) {
    // 冷启动时 Neon 无服务器连接可能瞬时抖动（ECONNRESET），重试几次再降级
    let lastErr: unknown = null
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { neon } = await import('@neondatabase/serverless')
        sql = neon(DATABASE_URL)
        await getSql()`
        CREATE TABLE IF NOT EXISTS evaluations (
          username TEXT PRIMARY KEY,
        nickname TEXT,
        score INTEGER,
        tier TEXT,
        dimensions JSONB,
        summary JSONB,
        metrics JSONB,
        risk_flags JSONB,
        verdict TEXT,
        advice TEXT,
        price_advice TEXT,
        computed_at TIMESTAMPTZ,
        avatar TEXT,
        avatar_data TEXT,
        bio TEXT,
        follower_count INTEGER,
        following_count INTEGER,
        total_likes INTEGER,
        video_count INTEGER,
        verified BOOLEAN,
        region TEXT,
        posts JSONB,
        account_profile JSONB,
        account_health JSONB,
        content_cadence JSONB,
        engagement_quality JSONB,
        peer_benchmark JSONB,
        brand_potential JSONB,
        monetization_path JSONB,
        growth_plan JSONB,
        income_estimate JSONB,
        business_value JSONB,
        revenue_roadmap JSONB,
        content_strategy JSONB,
        peer_ranking JSONB,
        brand_matching JSONB,
        trend_analysis JSONB,
        commercialization_advice JSONB,
        formula_version TEXT,
        calculation_metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
      `
      // Migration: add commerce_readiness column for existing deployments
      await getSql()`ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS commerce_readiness JSONB`
      // Migration: add evaluated_by column for per-user history
      await getSql()`ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS evaluated_by TEXT`
      await getSql()`CREATE INDEX IF NOT EXISTS idx_evaluations_evaluated_by ON evaluations(evaluated_by)`
      // Migration: freemium support
      await getSql()`ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS is_free BOOLEAN DEFAULT false`
      await getSql()`ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS upgraded_at TIMESTAMPTZ`
      await getSql()`ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS evaluated_by_ip TEXT`
      await getSql()`CREATE INDEX IF NOT EXISTS idx_evaluations_is_free ON evaluations(is_free)`
      // Migration: source posts data quality ('full' | 'partial') — paid cache must reject partial data
      await getSql()`ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS data_quality TEXT`
      await getSql()`ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS avatar_data TEXT`
      // 报告满意度评分表（用于首页社会证明的真实数据源）
      await getSql()`
        CREATE TABLE IF NOT EXISTS report_ratings (
          id SERIAL PRIMARY KEY,
          username TEXT,
          rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
          ip_hash TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `
      await getSql()`CREATE INDEX IF NOT EXISTS idx_report_ratings_created ON report_ratings(created_at)`
      // 同一 (username, ip_hash) 仅允许一条评分（防刷分）：先幂等清理历史重复行（保留每组最新一条），
      // 再建唯一索引——若存在重复行 CREATE UNIQUE INDEX 会失败，故 DELETE 必须在前；索引已存在时 DELETE 无害
      await getSql()`
        DELETE FROM report_ratings a
        USING report_ratings b
        WHERE a.username IS NOT DISTINCT FROM b.username
          AND a.ip_hash IS NOT DISTINCT FROM b.ip_hash
          AND a.id < b.id`
      await getSql()`CREATE UNIQUE INDEX IF NOT EXISTS idx_report_ratings_unique ON report_ratings(username, ip_hash)`
      await getSql()`
        CREATE TABLE IF NOT EXISTS free_rate_limits (
          ip_hash TEXT NOT NULL,
          date_key DATE NOT NULL,
          count INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (ip_hash, date_key)
        )
      `
      // 积分发放幂等表：以 payment_id 主键原子抢锁，
      // 修复 grantCredits"先 SELECT 再 UPDATE"的 TOCTOU 并发重复发放问题
      // （credits-server.ts 的 initTable 也会幂等建此表，保证 webhook 路径不依赖本文件初始化）
      await getSql()`
        CREATE TABLE IF NOT EXISTS credit_grants (
          payment_id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          credits INTEGER NOT NULL,
          created_at BIGINT NOT NULL
        )
      `
      storeType = 'postgres'
      return storeType
      } catch (err) {
        lastErr = err
        sql = null
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, attempt * 500))
        }
      }
    }
    // DATABASE_URL 已配置但重试均失败：重置状态，下次请求再重试，不 fallback 到 file 脏数据
    console.warn('[db] Postgres init failed after retries (will retry next request):', lastErr instanceof Error ? lastErr.message : lastErr)
    return 'memory'
  }

  // 未配置 DATABASE_URL → file/memory fallback（仅本地开发）
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
    if (!existsSync(DATA_PATH)) writeFileSync(DATA_PATH, '[]', 'utf-8')
    storeType = 'file'
  } catch (err) {
    console.warn('[db] File persistence not available, using in-memory fallback', err)
    storeType = 'memory'
  }
  return storeType
}

function readFileStore(): Evaluation[] {
  try {
    const raw = readFileSync(DATA_PATH, 'utf-8')
    return JSON.parse(raw) as Evaluation[]
  } catch (err) {
    console.warn('[db] Failed to read file store', err)
    return []
  }
}

function atomicWriteFile(filePath: string, data: unknown) {
  const tmp = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
  renameSync(tmp, filePath)
}

function writeFileStore(data: Evaluation[]) {
  try {
    atomicWriteFile(DATA_PATH, data)
  } catch (err) {
    console.warn('[db] Failed to write file store, falling back to memory', err)
    storeType = 'memory'
    memoryFallback = data
  }
}

export async function findEvaluation(username: string): Promise<Evaluation | null> {
  const normalized = username.trim().replace(/^@/, '').toLowerCase()
  const type = await initStore()
  if (type === 'postgres') {
    const rows = await getSql()`SELECT * FROM evaluations WHERE username = ${normalized}`
    return rows[0] ? rowToEvaluation(rows[0]) : null
  }
  const store = type === 'file' ? readFileStore() : memoryFallback
  const found = store.find(e => e.username === normalized)
  return found ? normalizeEvaluation(found) : null
}

export async function findRecentEvaluations(limit = 50): Promise<Evaluation[]> {
  const type = await initStore()
  if (type === 'postgres') {
    // 列裁剪：列表展示只需以下字段，避免拉取十余个巨型 JSONB 与 base64 头像列（SELECT * 可达数 MB）
    const rows = await getSql()`SELECT username, nickname, score, tier, avatar_data, computed_at, region, follower_count FROM evaluations ORDER BY computed_at DESC LIMIT ${limit}`
    return rows.map(rowToEvaluation)
  }
  const store = type === 'file' ? readFileStore() : memoryFallback
  return [...store].sort((a, b) => +new Date(b.computedAt) - +new Date(a.computedAt)).slice(0, limit).map(normalizeEvaluation)
}

interface SaveOptions {
  evaluatedBy?: string
  isFree?: boolean
  ip?: string
}

export async function saveEvaluation(evaluation: Evaluation, options?: string | SaveOptions): Promise<Evaluation> {
  // Backward-compat: string arg → { evaluatedBy }
  const opts: SaveOptions = typeof options === 'string'
    ? { evaluatedBy: options }
    : (options || {})
  const evaluatedBy = opts.evaluatedBy
  const isFree = opts.isFree ?? false
  const ip = opts.ip
  const type = await initStore()
  if (type === 'postgres') {
    await getSql()`
      INSERT INTO evaluations
        (username, nickname, score, tier, dimensions, summary, metrics, risk_flags, verdict, advice, price_advice,
         account_health, content_cadence, engagement_quality, peer_benchmark, brand_potential, monetization_path, growth_plan,
         income_estimate, business_value, revenue_roadmap, content_strategy, peer_ranking, brand_matching,
         trend_analysis, commercialization_advice, commerce_readiness, formula_version, calculation_metadata, data_quality,
         computed_at, avatar, avatar_data, bio, follower_count, following_count, total_likes, video_count, verified, region, posts, account_profile, evaluated_by, is_free, evaluated_by_ip)
      VALUES
        (${evaluation.username}, ${evaluation.nickname}, ${evaluation.score}, ${evaluation.tier},
         ${JSON.stringify(evaluation.dimensions)}::jsonb, ${JSON.stringify(evaluation.summary)}::jsonb,
         ${JSON.stringify(evaluation.metrics)}::jsonb,
         ${JSON.stringify(evaluation.riskFlags)}::jsonb,
         ${evaluation.verdict}, ${evaluation.advice}, ${evaluation.priceAdvice},
         ${JSON.stringify(evaluation.accountHealth)}::jsonb, ${JSON.stringify(evaluation.contentCadence)}::jsonb,
         ${JSON.stringify(evaluation.engagementQuality)}::jsonb, ${JSON.stringify(evaluation.peerBenchmark)}::jsonb,
         ${JSON.stringify(evaluation.brandPotential)}::jsonb, ${JSON.stringify(evaluation.monetizationPath)}::jsonb,
         ${JSON.stringify(evaluation.growthPlan)}::jsonb,
         ${JSON.stringify(evaluation.incomeEstimate)}::jsonb,
         ${JSON.stringify(evaluation.businessValue)}::jsonb,
         ${JSON.stringify(evaluation.revenueRoadmap)}::jsonb,
         ${JSON.stringify(evaluation.contentStrategy)}::jsonb,
         ${JSON.stringify(evaluation.peerRanking)}::jsonb,
         ${JSON.stringify(evaluation.brandMatching)}::jsonb,
         ${JSON.stringify(evaluation.trendAnalysis)}::jsonb,
         ${JSON.stringify(evaluation.commercializationAdvice)}::jsonb,
         ${JSON.stringify(evaluation.commerceReadiness)}::jsonb,
         ${evaluation.formulaVersion || null},
         ${JSON.stringify(evaluation.calculationMetadata || null)}::jsonb,
         ${evaluation.dataQuality || null},
         ${evaluation.computedAt}, ${evaluation.avatar || null}, ${evaluation.avatarData || null}, ${evaluation.bio || null},
         ${evaluation.followerCount}, ${evaluation.followingCount}, ${evaluation.totalLikes}, ${evaluation.videoCount},
         ${evaluation.verified ?? null}, ${evaluation.region || null}, ${JSON.stringify(evaluation.posts || [])}::jsonb,
         ${JSON.stringify(evaluation.accountProfile)}::jsonb,
         ${evaluatedBy || null}, ${isFree}, ${ip || null})
      ON CONFLICT (username) DO UPDATE SET
        nickname = EXCLUDED.nickname,
        score = EXCLUDED.score,
        tier = EXCLUDED.tier,
        dimensions = EXCLUDED.dimensions,
        summary = EXCLUDED.summary,
        metrics = EXCLUDED.metrics,
        risk_flags = EXCLUDED.risk_flags,
        verdict = EXCLUDED.verdict,
        advice = EXCLUDED.advice,
        price_advice = EXCLUDED.price_advice,
        account_health = EXCLUDED.account_health,
        content_cadence = EXCLUDED.content_cadence,
        engagement_quality = EXCLUDED.engagement_quality,
        peer_benchmark = EXCLUDED.peer_benchmark,
        brand_potential = EXCLUDED.brand_potential,
        monetization_path = EXCLUDED.monetization_path,
        growth_plan = EXCLUDED.growth_plan,
        income_estimate = EXCLUDED.income_estimate,
        business_value = EXCLUDED.business_value,
        revenue_roadmap = EXCLUDED.revenue_roadmap,
        content_strategy = EXCLUDED.content_strategy,
        peer_ranking = EXCLUDED.peer_ranking,
        brand_matching = EXCLUDED.brand_matching,
        trend_analysis = EXCLUDED.trend_analysis,
        commercialization_advice = EXCLUDED.commercialization_advice,
        commerce_readiness = EXCLUDED.commerce_readiness,
        formula_version = EXCLUDED.formula_version,
        calculation_metadata = EXCLUDED.calculation_metadata,
        data_quality = EXCLUDED.data_quality,
        computed_at = EXCLUDED.computed_at,
        avatar = EXCLUDED.avatar,
        avatar_data = EXCLUDED.avatar_data,
        bio = EXCLUDED.bio,
        follower_count = EXCLUDED.follower_count,
        following_count = EXCLUDED.following_count,
        total_likes = EXCLUDED.total_likes,
        video_count = EXCLUDED.video_count,
        verified = EXCLUDED.verified,
        region = EXCLUDED.region,
        posts = EXCLUDED.posts,
        account_profile = EXCLUDED.account_profile,
        is_free = CASE WHEN evaluations.is_free IS FALSE THEN false ELSE EXCLUDED.is_free END,
        evaluated_by_ip = CASE WHEN evaluations.is_free IS FALSE THEN evaluations.evaluated_by_ip ELSE EXCLUDED.evaluated_by_ip END,
        upgraded_at = CASE WHEN evaluations.is_free IS true AND EXCLUDED.is_free IS false THEN NOW() ELSE evaluations.upgraded_at END
    `
    // ON CONFLICT: once paid (is_free=false), never revert to free. Set upgraded_at on first upgrade.
    return evaluation
  }

  // File/memory mode: use file lock to prevent concurrent write race conditions
  if (type === 'file') {
    return withFileLock(DATA_PATH, async () => {
      const store = readFileStore()
      // 保留 isFree 标记：isCacheValid / findFreeEvaluation 的 file 模式判断依赖此字段
      const record: Evaluation & { isFree?: boolean } = { ...evaluation, isFree }
      const idx = store.findIndex(e => e.username === evaluation.username)
      if (idx >= 0) store[idx] = record
      else store.push(record)
      writeFileStore(store)
      return evaluation
    })
  }

  // Memory mode
  const record: Evaluation & { isFree?: boolean } = { ...evaluation, isFree }
  const idx = memoryFallback.findIndex(e => e.username === evaluation.username)
  if (idx >= 0) memoryFallback[idx] = record
  else memoryFallback.push(record)
  return evaluation
}

export async function isCacheValid(username: string, ttlHours = 720): Promise<boolean> {
  const normalized = username.trim().replace(/^@/, '').toLowerCase()
  const type = await initStore()

  let computedAt = ''
  let formulaVersion: string | undefined
  let categories: string[] | undefined
  let isFree: boolean | undefined
  let dataQuality: string | undefined

  if (type === 'postgres') {
    // 直接取行判断 is_free/data_quality（findEvaluation 的 Evaluation 重建会丢弃这两个行级字段）
    const rows = await getSql()`
      SELECT computed_at, formula_version, account_profile, is_free, data_quality
      FROM evaluations
      WHERE username = ${normalized}`
    const row = rows[0] as Record<string, unknown> | undefined
    if (!row) return false
    computedAt = String(row.computed_at ?? '')
    formulaVersion = row.formula_version ? String(row.formula_version) : undefined
    categories = parseJson<Evaluation['accountProfile']>(row.account_profile)?.categories
    isFree = row.is_free == null ? undefined : Boolean(row.is_free)
    dataQuality = row.data_quality ? String(row.data_quality) : undefined
  } else {
    const store = type === 'file' ? readFileStore() : memoryFallback
    const found = store.find(e => e.username === normalized)
    if (!found) return false
    computedAt = String(found.computedAt ?? '')
    formulaVersion = found.formulaVersion
    categories = found.accountProfile?.categories
    isFree = (found as { isFree?: boolean }).isFree
    dataQuality = found.dataQuality
  }

  if (formulaVersion !== 'v2') return false

  if (!categories || !Array.isArray(categories) || categories.length === 0) {
    return false
  }

  // 缓存污染防护（postgres）：付费 30 天缓存只允许命中付费评估（is_free=false），
  // 免费评估可能基于估算播放（dataQuality='partial'），不得透给付费用户
  if (type === 'postgres' && isFree !== false) return false
  // file/memory 模式：仅拒绝明确标记为免费的记录（历史数据无 isFree 标记时从宽，保持本地开发可用）
  if (isFree === true) return false

  // dataQuality='partial'（播放量估算）不进付费缓存；存量行为空/undefined 时视为 full（兼容历史）
  if (dataQuality && dataQuality !== 'full') return false

  const hours = (Date.now() - new Date(computedAt).getTime()) / 36e5
  return hours < ttlHours
}

/**
 * 评估统计：总数 + 商业价值总额（high 端）。
 * 用于公开 stats 端点，确保 evaluations 表已初始化后再查询。
 */
export async function getEvaluationStats(): Promise<{ count: number; totalValueAssessed: number }> {
  const type = await initStore()
  if (type !== 'postgres') {
    // file / memory 模式下手动聚合
    const store = type === 'file' ? readFileStore() : memoryFallback
    const count = store.length
    const totalValueAssessed = store.reduce((sum, e) => {
      const mid = e.businessValue?.totalValue?.mid
      return sum + (typeof mid === 'number' && Number.isFinite(mid) ? mid : 0)
    }, 0)
    return { count, totalValueAssessed }
  }

  // postgres 查询重试：连接抖动时重试，避免瞬时返回 0
  let countRows: Array<Record<string, unknown>> = []
  let valueRows: Array<Record<string, unknown>> = []
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      countRows = await getSql()`SELECT COUNT(*) as count FROM evaluations`
      valueRows = await getSql()`
        SELECT COALESCE(SUM((business_value->'totalValue'->>'mid')::numeric), 0) as total
        FROM evaluations
        WHERE business_value->'totalValue'->>'mid' IS NOT NULL
      `
      break
    } catch (err) {
      if (attempt === 3) throw err
      await new Promise(r => setTimeout(r, attempt * 400))
    }
  }
  const count = Number(countRows[0]?.count || 0)
  const totalValueAssessed = Number(valueRows[0]?.total || 0)
  return { count, totalValueAssessed }
}

/**
 * 覆盖维度统计：总粉丝数（覆盖受众规模）+ 去重国家数（覆盖地理范围）。
 * 用于公开 stats 端点。region 为空的记录不参与国家去重（不虚构）。
 */
export async function getAudienceReach(): Promise<{ totalFollowers: number; countriesReached: number }> {
  const type = await initStore()
  if (type !== 'postgres') {
    const store = type === 'file' ? readFileStore() : memoryFallback
    const totalFollowers = store.reduce((sum, e) => {
      const f = e.followerCount
      return sum + (typeof f === 'number' && Number.isFinite(f) ? f : 0)
    }, 0)
    const regionSet = new Set<string>()
    for (const e of store) {
      const r = (e.region || '').trim().toUpperCase()
      if (r) regionSet.add(r)
    }
    return { totalFollowers, countriesReached: regionSet.size }
  }

  let followersRows: Array<Record<string, unknown>> = []
  let countryRows: Array<Record<string, unknown>> = []
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      followersRows = await getSql()`SELECT COALESCE(SUM(follower_count), 0) as total FROM evaluations`
      countryRows = await getSql()`SELECT COUNT(DISTINCT UPPER(TRIM(region))) as c FROM evaluations WHERE region IS NOT NULL AND TRIM(region) != ''`
      break
    } catch (err) {
      if (attempt === 3) throw err
      await new Promise(r => setTimeout(r, attempt * 400))
    }
  }
  const totalFollowers = Number(followersRows[0]?.total || 0)
  const countriesReached = Number(countryRows[0]?.c || 0)
  return { totalFollowers, countriesReached }
}

/**
 * 每日评估次数时序：基于 evaluations 表 computed_at 聚合，缺失日期填 0。
 * 必须在 db.ts 中（调用 initStore 确保 evaluations 表已创建），不能走 analytics.ts 的 initDb。
 */
export async function getEvaluationsByDay(days: number): Promise<Array<{ date: string; count: number }>> {
  const type = await initStore()
  if (type !== 'postgres') {
    // file / memory 模式下手动按日聚合
    const store = type === 'file' ? readFileStore() : memoryFallback
    const since = Date.now() - days * 86400000
    const byDate = new Map<string, number>()
    for (const e of store) {
      const ts = new Date(e.computedAt).getTime()
      if (ts < since) continue
      const d = new Date(e.computedAt)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      byDate.set(dateStr, (byDate.get(dateStr) || 0) + 1)
    }
    const result: Array<{ date: string; count: number }> = []
    const now = new Date()
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      result.push({ date: dateStr, count: byDate.get(dateStr) || 0 })
    }
    return result
  }

  const TZ = 'Asia/Shanghai'
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const rows = await getSql()`
    SELECT TO_CHAR((computed_at AT TIME ZONE ${TZ})::date, 'YYYY-MM-DD') as date, COUNT(*) as count
    FROM evaluations
    WHERE computed_at >= ${since}::timestamptz
    GROUP BY date
  ` as Array<{ date: string; count: string }>

  const valueByDate: Record<string, number> = {}
  for (const r of rows) valueByDate[String(r.date)] = Number(r.count)

  const now = new Date()
  const shanghaiNow = new Date(now.toLocaleString('en-US', { timeZone: TZ }))
  const result: Array<{ date: string; count: number }> = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(shanghaiNow.getFullYear(), shanghaiNow.getMonth(), shanghaiNow.getDate() - i)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    result.push({ date: dateStr, count: Number(valueByDate[dateStr] || 0) })
  }
  return result
}

function normalizeEvaluation(evaluation: Partial<Evaluation>): Evaluation {
  const defaultMetrics = {
    engagementRate: 0,
    avgPlays: 0,
    avgLikes: 0,
    avgComments: 0,
    avgShares: 0,
    likesPerVideo: 0,
    followerFollowingRatio: 0,
    recentMedianPlays: 0,
    olderMedianPlays: 0,
    playGrowth: 0,
    cvPlays: 0,
    daysSinceLastPost: 0,
    topPostPlays: 0,
    topPostLikes: 0,
    matureMedianPlays: 0,
    matureWeightedAvgPlays: 0,
    historicalImpliedPlays: 0,
    immatureVideoCount: 0,
    growingVideoCount: 0,
    likePlayRatio: 0,
    effectivePlaysSource: 'fallback' as const,
    effectiveAvgPlays: 0,
    effectivePeakPlays: 0,
  }
  return {
    username: String(evaluation.username),
    nickname: String(evaluation.nickname),
    score: Number(evaluation.score),
    tier: String(evaluation.tier) as Evaluation['tier'],
    dimensions: evaluation.dimensions || { reach: 0, engagement: 0, content: 0, authenticity: 0, momentum: 0, stability: 0, commerce: 0, monetization: 0, health: 0, influence: 0 },
    summary: evaluation.summary || { headline: '', strengths: [], weaknesses: [], targetAudience: '', bestAction: '' },
    metrics: { ...defaultMetrics, ...(evaluation.metrics || {}) },
    riskFlags: Array.isArray(evaluation.riskFlags) ? evaluation.riskFlags : [],
    verdict: String(evaluation.verdict),
    advice: String(evaluation.advice),
    priceAdvice: String(evaluation.priceAdvice ?? ''),
    accountHealth: evaluation.accountHealth || {
      overallScore: 0,
      shadowbanRisk: 'low',
      shadowbanSignals: [],
      growthAnomaly: 'normal',
      growthAnomalyReason: '',
      engagementAuthenticity: 0,
      fakeFollowerEstimate: 0,
      healthReasoning: '',
    },
    contentCadence: evaluation.contentCadence || {
      postingRhythm: 'irregular',
      avgPostsPerDay: 0,
      avgPostsPerWeek: 0,
      bestTimeSlots: [],
      bestWeekdays: [],
      consistencyScore: 0,
      cadenceAdvice: '',
    },
    engagementQuality: evaluation.engagementQuality || {
      conversationDepth: 0,
      shareRatio: 0,
      commentLikeRatio: 0,
      completionRate: null,
      viralCoefficient: 0,
      topEngagers: [],
      qualityReasoning: '',
    },
    peerBenchmark: evaluation.peerBenchmark || {
      percentile: 0,
      peerGroupSize: '',
      benchmarks: [],
      similarCreators: [],
    },
    brandPotential: evaluation.brandPotential || {
      brandScore: 0,
      estimatedCPM: 0,
      audienceSpendingPower: 'low',
      suitableCategories: [],
      collaborationTypes: [],
      brandReasoning: '',
    },
    monetizationPath: evaluation.monetizationPath || {
      eligiblePrograms: [],
      nearestThreshold: null,
      estimatedMonthlyUsd: { low: 0, mid: 0, high: 0 },
      pathReasoning: '',
    },
    growthPlan: evaluation.growthPlan || {
      items: [],
      summary: '',
    },
    incomeEstimate: evaluation.incomeEstimate || {
      monthlyTotal: { low: 0, mid: 0, high: 0 },
      breakdown: [],
      categoryCpm: 0, categoryRpm: 0, regionMultiplier: 1,
      categoryLabel: '', regionLabel: '', summary: '',
    },
    businessValue: evaluation.businessValue || {
      totalValue: { low: 0, mid: 0, high: 0 },
      components: [],
      summary: '',
    },
    accountProfile: evaluation.accountProfile || {
      categories: [], personaType: '', postingRhythm: '', audienceRegion: '', contentStyle: '',
    },
    posts: Array.isArray(evaluation.posts) ? evaluation.posts : [],
    revenueRoadmap: evaluation.revenueRoadmap || {
      currentMonthly: { low: 0, mid: 0, high: 0 },
      projections: [],
      total12Month: { low: 0, mid: 0, high: 0 },
      summary: '',
    },
    contentStrategy: evaluation.contentStrategy ? {
      pillars: evaluation.contentStrategy.pillars || [],
      recommendedHashtags: evaluation.contentStrategy.recommendedHashtags || [],
      optimalSchedule: evaluation.contentStrategy.optimalSchedule || [],
      videoDuration: evaluation.contentStrategy.videoDuration || { min: 15, max: 60, label: '15-60秒（通用短视频最佳时长）' },
      collaborationIdeas: evaluation.contentStrategy.collaborationIdeas || [],
      summary: evaluation.contentStrategy.summary || '',
    } : {
      pillars: [], recommendedHashtags: [], optimalSchedule: [], videoDuration: { min: 15, max: 60, label: '15-60秒（通用短视频最佳时长）' }, collaborationIdeas: [], summary: '',
    },
    peerRanking: evaluation.peerRanking || {
      overallPercentile: 0, tierLabel: '', peerGroupDescription: '', rankingBreakdown: [], insight: '',
    },
    brandMatching: evaluation.brandMatching || {
      matches: [], totalBrandValue: { low: 0, mid: 0, high: 0 }, summary: '',
    },
    trendAnalysis: evaluation.trendAnalysis || {
      trendingTopics: [], trendingSounds: [], contentPredictions: [], bestPostTimes: [], summary: '',
    },
    commercializationAdvice: evaluation.commercializationAdvice || {
      directions: [], primaryRecommendation: '', secondaryRecommendation: '', estimatedTotalMonthly: { low: 0, mid: 0, high: 0 }, summary: '',
    },
    commerceReadiness: evaluation.commerceReadiness || {
      overallScore: 0, tier: 'Limited' as const, summary: '', channels: [], signals: [], productMatches: [], contentCommerceRatio: 0, recommendation: '',
    },
    computedAt: String(evaluation.computedAt),
    avatar: evaluation.avatar || undefined,
    bio: evaluation.bio || undefined,
    followerCount: Number(evaluation.followerCount),
    followingCount: Number(evaluation.followingCount),
    totalLikes: Number(evaluation.totalLikes),
    videoCount: Number(evaluation.videoCount),
    verified: evaluation.verified ?? undefined,
    region: evaluation.region || undefined,
    mock: evaluation.mock,
    cached: evaluation.cached,
    formulaVersion: (evaluation.formulaVersion as 'v2' | undefined) || undefined,
    calculationMetadata: evaluation.calculationMetadata,
    dataQuality: evaluation.dataQuality,
  }
}

function parseJson<T>(value: unknown): T | undefined {
  if (!value) return undefined
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return undefined
    }
  }
  return value as T
}

function rowToEvaluation(row: Record<string, unknown>): Evaluation {
  const defaultMetrics = {
    engagementRate: 0,
    avgPlays: 0,
    avgLikes: 0,
    avgComments: 0,
    avgShares: 0,
    likesPerVideo: 0,
    followerFollowingRatio: 0,
    recentMedianPlays: 0,
    olderMedianPlays: 0,
    playGrowth: 0,
    cvPlays: 0,
    daysSinceLastPost: 0,
    topPostPlays: 0,
    topPostLikes: 0,
    matureMedianPlays: 0,
    matureWeightedAvgPlays: 0,
    historicalImpliedPlays: 0,
    immatureVideoCount: 0,
    growingVideoCount: 0,
    likePlayRatio: 0,
    effectivePlaysSource: 'fallback' as const,
    effectiveAvgPlays: 0,
    effectivePeakPlays: 0,
  }
  const parsedMetrics = parseJson<Evaluation['metrics']>(row.metrics)
  return normalizeEvaluation({
    username: String(row.username),
    nickname: String(row.nickname),
    score: Number(row.score),
    tier: String(row.tier) as Evaluation['tier'],
    dimensions: parseJson<Evaluation['dimensions']>(row.dimensions),
    summary: parseJson<Evaluation['summary']>(row.summary),
    metrics: { ...defaultMetrics, ...(parsedMetrics || {}) },
    riskFlags: Array.isArray(row.risk_flags)
      ? row.risk_flags as Evaluation['riskFlags']
      : parseJson<Evaluation['riskFlags']>(row.risk_flags)
      ?? (row.riskFlags as Evaluation['riskFlags']),
    verdict: row.verdict != null ? String(row.verdict) : '',
    advice: row.advice != null ? String(row.advice) : '',
    priceAdvice: String(row.price_advice ?? row.priceAdvice ?? ''),
    accountHealth: parseJson<Evaluation['accountHealth']>(row.account_health),
    contentCadence: parseJson<Evaluation['contentCadence']>(row.content_cadence),
    engagementQuality: parseJson<Evaluation['engagementQuality']>(row.engagement_quality),
    peerBenchmark: parseJson<Evaluation['peerBenchmark']>(row.peer_benchmark),
    brandPotential: parseJson<Evaluation['brandPotential']>(row.brand_potential),
    monetizationPath: parseJson<Evaluation['monetizationPath']>(row.monetization_path),
    growthPlan: parseJson<Evaluation['growthPlan']>(row.growth_plan),
    incomeEstimate: parseJson<Evaluation['incomeEstimate']>(row.income_estimate),
    businessValue: parseJson<Evaluation['businessValue']>(row.business_value),
    accountProfile: parseJson<Evaluation['accountProfile']>(row.account_profile),
    revenueRoadmap: parseJson<Evaluation['revenueRoadmap']>(row.revenue_roadmap),
    contentStrategy: parseJson<Evaluation['contentStrategy']>(row.content_strategy),
    peerRanking: parseJson<Evaluation['peerRanking']>(row.peer_ranking),
    brandMatching: parseJson<Evaluation['brandMatching']>(row.brand_matching),
    trendAnalysis: parseJson<Evaluation['trendAnalysis']>(row.trend_analysis),
    commercializationAdvice: parseJson<Evaluation['commercializationAdvice']>(row.commercialization_advice),
    commerceReadiness: parseJson<Evaluation['commerceReadiness']>(row.commerce_readiness) || {
      overallScore: 0, tier: 'Limited' as const, summary: '', channels: [], signals: [], productMatches: [], contentCommerceRatio: 0, recommendation: '',
    },
    computedAt: String(row.computed_at ?? row.computedAt),
    avatar: row.avatar ? String(row.avatar) : undefined,
    avatarData: row.avatar_data ? String(row.avatar_data) : undefined,
    bio: row.bio ? String(row.bio) : undefined,
    followerCount: Number(row.follower_count ?? row.followerCount ?? 0),
    followingCount: Number(row.following_count ?? row.followingCount ?? 0),
    totalLikes: Number(row.total_likes ?? row.totalLikes ?? 0),
    videoCount: Number(row.video_count ?? row.videoCount ?? 0),
    verified: row.verified != null ? Boolean(row.verified) : undefined,
    region: row.region ? String(row.region) : undefined,
    posts: Array.isArray(parseJson<Evaluation['posts']>(row.posts)) ? parseJson<Evaluation['posts']>(row.posts) : [],
    formulaVersion: row.formula_version ? String(row.formula_version) as 'v2' : undefined,
    calculationMetadata: parseJson<Evaluation['calculationMetadata']>(row.calculation_metadata),
    dataQuality: row.data_quality ? String(row.data_quality) as Evaluation['dataQuality'] : undefined,
  })
}

// ── Freemium helpers ──

/** Find a free evaluation (24h TTL — reject stale results). */
export async function findFreeEvaluation(username: string): Promise<Evaluation | null> {
  const normalized = username.trim().replace(/^@/, '').toLowerCase()
  const type = await initStore()
  if (type === 'postgres') {
    const rows = await getSql()`
      SELECT * FROM evaluations
      WHERE username = ${normalized}
        AND is_free = true
        AND computed_at > NOW() - INTERVAL '24 hours'
      LIMIT 1`
    return rows[0] ? rowToEvaluation(rows[0]) : null
  }
  const found = await findEvaluation(normalized)
  if (!found || !((found as { isFree?: boolean }).isFree)) return null  // 加 isFree 校验，避免付费评估当免费缓存返回给未登录用户
  const hours = (Date.now() - new Date(found.computedAt).getTime()) / 36e5
  return hours < 24 ? found : null
}

/** Upgrade a free evaluation to paid — trigger AI enrichment externally. */
export async function upgradeEvaluation(username: string, evaluatedBy: string): Promise<boolean> {
  const normalized = username.trim().replace(/^@/, '').toLowerCase()
  const type = await initStore()
  if (type === 'postgres') {
    // RETURNING 直接返回受影响行：非空 = 升级成功，空 = 无匹配的免费记录，
    // 无需依赖 Neon 对无 RETURNING UPDATE 的返回行为，也省去一次 SELECT 读回
    const result = await getSql()`
      UPDATE evaluations
      SET is_free = false, upgraded_at = NOW(), evaluated_by = ${evaluatedBy}
      WHERE username = ${normalized} AND is_free = true
      RETURNING username`
    const rows = result as unknown as Array<Record<string, unknown>>
    return rows.length > 0
  }
  // File/memory: mark the record
  const evaluation = await findEvaluation(normalized)
  if (!evaluation) return false
  await saveEvaluation(evaluation, { evaluatedBy, isFree: false })
  return true
}

/**
 * IP-based free rate limiter.
 * Uses a simple in-memory sliding window. For production, swap to Redis or DB.
 */
const freeRateWindow = new Map<string, { count: number; windowStart: number }>()
const FREE_DAILY_LIMIT = 2

export async function checkFreeRateLimit(ip: string): Promise<{ allowed: boolean; remaining: number; resetMs: number }> {
  const now = Date.now()
  const windowMs = 24 * 60 * 60 * 1000
  const type = await initStore()
  if (type === 'postgres') {
    try {
      const ipHash = hashIp(ip)
      // IP_HASH_SECRET 未配置时 hashIp 返回空串：空串入限流表等于放行所有人，跳过入库直接放行
      if (!ipHash) {
        console.warn('[db] IP hash unavailable (IP_HASH_SECRET not set), skipping free rate limit')
        return { allowed: true, remaining: FREE_DAILY_LIMIT - 1, resetMs: windowMs }
      }
      const dateKey = new Date().toISOString().slice(0, 10)
      const rows = await getSql()`
        INSERT INTO free_rate_limits (ip_hash, date_key, count)
        VALUES (${ipHash}, ${dateKey}::date, 1)
        ON CONFLICT (ip_hash, date_key) DO UPDATE SET count = free_rate_limits.count + 1
        RETURNING count
      ` as Array<{ count: number }>
      const count = Number(rows[0]?.count || 0)
      const remaining = Math.max(0, FREE_DAILY_LIMIT - count)
      return { allowed: count <= FREE_DAILY_LIMIT, remaining, resetMs: windowMs }
    } catch (err) {
      console.warn('[db] Free rate limit check failed, allowing request', err)
      return { allowed: true, remaining: FREE_DAILY_LIMIT - 1, resetMs: windowMs }
    }
  }
  // file/memory 模式：保留内存限流逻辑（本地开发）
  const entry = freeRateWindow.get(ip)
  if (!entry || now - entry.windowStart > windowMs) {
    freeRateWindow.set(ip, { count: 1, windowStart: now })
    return { allowed: true, remaining: FREE_DAILY_LIMIT - 1, resetMs: windowMs }
  }
  entry.count++
  const remaining = Math.max(0, FREE_DAILY_LIMIT - entry.count)
  return { allowed: entry.count <= FREE_DAILY_LIMIT, remaining, resetMs: windowMs - (now - entry.windowStart) }
}

/**
 * 报告满意度评分：保存一条用户评分（1-5 星）。
 * ip_hash 用于同一 IP 去重（防止刷分），仅存 hash 不存明文。
 */
export async function saveReportRating(username: string, rating: number, ipHash: string): Promise<{ ok: boolean }> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false }
  const type = await initStore()
  if (type !== 'postgres') {
    // file/memory 模式：无真实持久化，静默返回 ok（不影响本地开发体验）
    return { ok: true }
  }
  const now = new Date()
  // upsert（唯一索引 idx_report_ratings_unique 见 initStore）：同一 IP 对同一报告重复投票
  // 改为更新评分而非新增行，防止无限刷分
  await getSql()`
    INSERT INTO report_ratings (username, rating, ip_hash, created_at)
    VALUES (${username}, ${rating}, ${ipHash || null}, ${now})
    ON CONFLICT (username, ip_hash) DO UPDATE SET rating = ${rating}, created_at = ${now}
    RETURNING rating`
  return { ok: true }
}

/**
 * 报告满意度统计：平均分 + 评分总数。
 * 用于首页社会证明（真实评分数据，评分太少时不展示以避免误导）。
 */
export async function getReportRatingStats(): Promise<{ average: number; count: number }> {
  const type = await initStore()
  if (type !== 'postgres') return { average: 0, count: 0 }
  let rows: Array<Record<string, unknown>> = []
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      rows = await getSql()`SELECT AVG(rating) as avg, COUNT(*)::int as cnt FROM report_ratings`
      break
    } catch (err) {
      if (attempt === 3) throw err
      await new Promise(r => setTimeout(r, attempt * 400))
    }
  }
  const average = Number(rows[0]?.avg || 0)
  const count = Number(rows[0]?.cnt || 0)
  return { average, count }
}
