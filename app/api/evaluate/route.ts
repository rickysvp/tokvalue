import { NextRequest, NextResponse } from 'next/server'
import { fetchProfile } from '@/lib/tiktok'
import { fetchAndEncodeAvatar } from '@/lib/avatar'
import { scoreProfile } from '@/lib/scoring'
import { findEvaluation, findFreeEvaluation, saveEvaluation, isCacheValid, checkFreeRateLimit } from '@/lib/db'
import { generateTrendAnalysis, generateCommercializationAdvice, generateContentStrategy } from '@/lib/deepseek'
import { getBearerToken, verifySessionToken } from '@/lib/auth'
import { consumeCredit, refundCredit } from '@/lib/credits-server'
import { getServerDict } from '@/lib/i18n/server'
import { recordEventFromRequest } from '@/lib/analytics'
import { getClientIp } from '@/lib/ip'
import { ApiErrorResponse, Evaluation } from '@/types'

export const dynamic = 'force-dynamic'

function buildSnapshot(evaluation: Evaluation) {
  return {
    username: evaluation.username,
    nickname: evaluation.nickname,
    followerCount: evaluation.followerCount,
    videoCount: evaluation.videoCount,
    totalLikes: evaluation.totalLikes,
    engagementRate: evaluation.metrics.engagementRate,
    avgPlays: evaluation.metrics.avgPlays,
    playGrowth: evaluation.metrics.playGrowth,
    region: evaluation.region || 'US',
    categories: evaluation.accountProfile?.categories || ['泛娱乐'],
    tier: evaluation.tier,
    score: evaluation.score,
    videoDescriptions: evaluation.posts?.slice(0, 10).map((p) => p.desc || '').filter(Boolean) || [],
  }
}

function isValidTrendAnalysis(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false
  const t = v as Record<string, unknown>
  return Array.isArray(t.trendingTopics) && Array.isArray(t.trendingSounds) && typeof t.summary === 'string'
}

function isValidCommercializationAdvice(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false
  const c = v as Record<string, unknown>
  return Array.isArray(c.directions) && typeof c.summary === 'string'
}

function isValidContentStrategy(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false
  const c = v as Record<string, unknown>
  return Array.isArray(c.pillars) && Array.isArray(c.recommendedHashtags)
}

async function enrichWithAI(evaluation: Evaluation, lang = 'en'): Promise<Evaluation> {
  const snapshot = buildSnapshot(evaluation)

  try {
    const [trendRes, commerceRes, strategyRes] = await Promise.allSettled([
      generateTrendAnalysis(snapshot, lang),
      generateCommercializationAdvice(snapshot, lang),
      generateContentStrategy(snapshot, lang),
    ])

    if (trendRes.status === 'fulfilled' && trendRes.value && isValidTrendAnalysis(trendRes.value)) {
      evaluation.trendAnalysis = trendRes.value
    }
    if (commerceRes.status === 'fulfilled' && commerceRes.value && isValidCommercializationAdvice(commerceRes.value)) {
      evaluation.commercializationAdvice = commerceRes.value
    }
    if (strategyRes.status === 'fulfilled' && strategyRes.value && isValidContentStrategy(strategyRes.value)) {
      evaluation.contentStrategy = strategyRes.value
    }
  } catch (err) {
    console.warn('[evaluate] AI enrichment failed:', err)
  }

  return evaluation
}

type ApiCode = ApiErrorResponse['code']

/**
 * 免费模式字段白名单裁剪（付费墙核心修复）：
 * 只下发免费用户界面实际渲染的字段（账号头部卡 + Overview tab + 评分卡/雷达图/风险列表）。
 * 付费模块数据（增长计划/内容策略/趋势分析/收入预估/变现路线/品牌匹配/带货分析/深度分析/同业排名等）
 * 一律不下发，防止通过 devtools Network 响应绕过付费墙白嫖。
 * 注意：数据库仍存全量（saveEvaluation 不变），用户付费升级后由 upgrade 路由从缓存补发完整报告。
 */
function stripForFreeMode(evaluation: Evaluation): Partial<Evaluation> & { isFree: true } {
  return {
    isFree: true,
    // ── 账号基础信息（头部卡片 + 基础统计）──
    username: evaluation.username,
    nickname: evaluation.nickname,
    avatar: evaluation.avatar,
    avatarData: evaluation.avatarData,
    bio: evaluation.bio,
    verified: evaluation.verified,
    mock: evaluation.mock,
    region: evaluation.region,
    followerCount: evaluation.followerCount,
    followingCount: evaluation.followingCount,
    totalLikes: evaluation.totalLikes,
    videoCount: evaluation.videoCount,
    accountProfile: evaluation.accountProfile,
    // ── 评分与 Overview 免费区 ──
    score: evaluation.score,
    tier: evaluation.tier,
    summary: evaluation.summary,
    verdict: evaluation.verdict,
    advice: evaluation.advice,
    priceAdvice: evaluation.priceAdvice,
    dimensions: evaluation.dimensions,
    metrics: evaluation.metrics,
    riskFlags: evaluation.riskFlags,
    businessValue: evaluation.businessValue,
    brandDealPerVideo: evaluation.brandDealPerVideo,
    brandPotential: evaluation.brandPotential,
    peerBenchmark: evaluation.peerBenchmark,
    // peerRanking 在免费 Overview step 04 实际渲染（PeerRankingSection），必须下发
    peerRanking: evaluation.peerRanking,
    computedAt: evaluation.computedAt,
  }
}

function errorResponse(code: ApiCode, message: string, httpStatus: number, detail?: string) {
  const body: ApiErrorResponse = { error: message, code }
  if (detail) body.detail = detail
  return NextResponse.json<ApiErrorResponse>(body, { status: httpStatus })
}

const CODE_TO_HTTP: Record<ApiCode, { status: number; message: string }> = {
  INVALID_USERNAME: { status: 400, message: getServerDict().api.evaluate.INVALID_USERNAME },
  USER_NOT_FOUND: { status: 404, message: getServerDict().api.evaluate.USER_NOT_FOUND },
  RATE_LIMIT: { status: 429, message: getServerDict().api.evaluate.RATE_LIMIT },
  MISSING_API_KEY: { status: 503, message: getServerDict().api.evaluate.MISSING_API_KEY },
  NETWORK_ERROR: { status: 502, message: getServerDict().api.evaluate.NETWORK_ERROR },
  API_ERROR: { status: 500, message: getServerDict().api.evaluate.API_ERROR },
  UNAUTHORIZED: { status: 401, message: getServerDict().api.evaluate.UNAUTHORIZED },
  CONSUME_ERROR: { status: 500, message: getServerDict().api.evaluate.CONSUME_ERROR },
  BALANCE_ERROR: { status: 500, message: getServerDict().api.evaluate.BALANCE_ERROR },
}

export async function POST(req: NextRequest) {
  let userEmail = ''
  let normalized = ''
  let isFreeMode = false

  try {
    const body = await req.json().catch(() => ({}))
    const username = String(body.username || '').trim()

    if (!username) {
      return errorResponse('INVALID_USERNAME', getServerDict().api.evaluate.INVALID_USERNAME, 400)
    }

    normalized = username.replace(/^@/, '').toLowerCase()
    const lang = 'en' // Fixed to English until multi-language dictionaries are ready

    // ── Mode detection: token present & valid → paid, else → free ──
    const token = getBearerToken(req)
    let isPaidMode = false

    if (token) {
      const payload = await verifySessionToken(token)
      if (payload) {
        userEmail = payload.email
        isPaidMode = true
      }
    }

    // ═══════════════════════════════════════════
    // PAID MODE — 30-day cache, force=true to skip
    // ═══════════════════════════════════════════
    if (isPaidMode) {
      const forceRefresh = body.force === true
      // 30-day cache to save RapidAPI + DeepSeek quota
      if (!forceRefresh && await isCacheValid(normalized)) {
        const cached = await findEvaluation(normalized)
        if (cached) {
          recordEventFromRequest(req, {
            event_type: 'evaluate_done',
            username: normalized,
            metadata: { score: cached.score, tier: cached.tier, cached: true },
          }).catch(err => console.warn('[evaluate] recordEvent(cached) failed:', err))
          return NextResponse.json({ ...cached, cached: true, isFree: false })
        }
      }

      const consumeResult = await consumeCredit(userEmail, normalized)
      if (!consumeResult.ok) {
        const msgs: Record<string, { msg: string; status: number }> = {
          NOT_FOUND:  { msg: getServerDict().api.errors.NO_CREDITS, status: 402 },
          NO_CREDITS: { msg: getServerDict().api.errors.NO_CREDITS, status: 402 },
        }
        const err = msgs[consumeResult.reason || ''] || { msg: getServerDict().api.errors.CONSUME_ERROR, status: 400 }
        return NextResponse.json({ error: err.msg, code: consumeResult.reason }, { status: err.status })
      }

      const profile = await fetchProfile(normalized)

      recordEventFromRequest(req, {
        event_type: 'evaluate_start',
        username: normalized,
        path: '/api/evaluate',
      }).catch(err => console.warn('[evaluate] recordEvent(start) failed:', err))

      let evaluation = scoreProfile(profile)
      evaluation = await enrichWithAI(evaluation, lang)
      // 持久化头像：下载 TikTok CDN 图 → 转 base64 WebP（避免 24h 过期）
      evaluation.avatarData = (await fetchAndEncodeAvatar(evaluation.avatar)) ?? undefined

      await saveEvaluation(evaluation, { evaluatedBy: userEmail, isFree: false })

      recordEventFromRequest(req, {
        event_type: 'evaluate_done',
        username: normalized,
        metadata: { score: evaluation.score, tier: evaluation.tier, cached: false },
      }).catch(err => console.warn('[evaluate] recordEvent(done) failed:', err))

      return NextResponse.json({ ...evaluation, isFree: false })
    }

    // ═══════════════════════════════════════════
    // FREE MODE — new freemium flow
    // ═══════════════════════════════════════════
    isFreeMode = true
    const clientIp = getClientIp(req)

    // Check free 24h cache (same username was evaluated recently for free)
    const freeCached = await findFreeEvaluation(normalized)
    if (freeCached) {
      recordEventFromRequest(req, {
        event_type: 'evaluate_done',
        username: normalized,
        metadata: { score: freeCached.score, tier: freeCached.tier, cached: true, free: true },
      }).catch(err => console.warn('[evaluate] recordEvent(free-cached) failed:', err))
      // 免费缓存命中同样只下发白名单字段（缓存中是全量数据，必须裁剪）
      return NextResponse.json({ ...stripForFreeMode(freeCached), cached: true })
    }

    // IP-based daily rate limit
    const rateLimit = await checkFreeRateLimit(clientIp)
    if (!rateLimit.allowed) {
      recordEventFromRequest(req, {
        event_type: 'api_error',
        path: '/api/evaluate',
        username: normalized,
        metadata: { error_code: 'FREE_RATE_LIMIT', ip: clientIp },
      }).catch(() => {})
      return NextResponse.json(
        {
          error: 'Daily free evaluation limit reached. Upgrade to Premium for unlimited evaluations.',
          code: 'FREE_RATE_LIMIT',
          detail: `Remaining: ${rateLimit.remaining}. Resets in ${Math.ceil(rateLimit.resetMs / 3600000)}h.`,
        },
        { status: 429 }
      )
    }

    const profile = await fetchProfile(normalized)

    recordEventFromRequest(req, {
      event_type: 'evaluate_start',
      username: normalized,
      path: '/api/evaluate',
      metadata: { free: true },
    }).catch(err => console.warn('[evaluate] recordEvent(free-start) failed:', err))

    let evaluation = scoreProfile(profile)
    // 持久化头像：下载 TikTok CDN 图 → 转 base64 WebP（避免 24h 过期）
    evaluation.avatarData = (await fetchAndEncodeAvatar(evaluation.avatar)) ?? undefined
    // Free mode: also run AI enrichment so free users experience full product value.
    // DeepSeek cost is minimal (~cents/call); P0-1 fixed free rate limit (2/day) bounds cost.
    // If AI fails, fall back to base scoring — don't block the free evaluation.
    try {
      evaluation = await enrichWithAI(evaluation, lang)
    } catch (aiErr) {
      console.warn('[evaluate] Free AI enrichment failed, returning base score:', aiErr instanceof Error ? aiErr.message : String(aiErr))
    }

    await saveEvaluation(evaluation, { isFree: true, ip: clientIp })

    recordEventFromRequest(req, {
      event_type: 'evaluate_done',
      username: normalized,
      metadata: { score: evaluation.score, tier: evaluation.tier, cached: false, free: true },
    }).catch(err => console.warn('[evaluate] recordEvent(free-done) failed:', err))

    console.log(`[evaluate] FREE | user=${normalized} | tier=${evaluation.tier} | score=${evaluation.score} | ip=${clientIp}`)

    // 免费模式只下发白名单字段（数据库已存全量，付费升级后可取回完整报告）
    return NextResponse.json(stripForFreeMode(evaluation))

  } catch (err) {
    // ── Refund for paid mode ──
    if (userEmail && !isFreeMode) {
      refundCredit(userEmail).catch(e =>
        console.error('[evaluate] refund failed:', e instanceof Error ? e.message : String(e))
      )
    }

    const code: ApiCode = (err && typeof err === 'object' && 'code' in err)
      ? (err as { code: ApiCode }).code
      : 'API_ERROR'
    const detail = err instanceof Error ? err.message : String(err)
    const mapping = CODE_TO_HTTP[code] || CODE_TO_HTTP.API_ERROR

    console.error(`[evaluate] ${code} | user=${normalized || 'N/A'} | ${detail}`)
    recordEventFromRequest(req, {
      event_type: 'api_error',
      path: '/api/evaluate',
      username: normalized || undefined,
      metadata: {
        error_code: code,
        error_message: detail.slice(0, 200),
        free: isFreeMode,
      },
    }).catch(err => console.warn('[evaluate] recordEvent(error) failed:', err))
    return errorResponse(code, mapping.message, mapping.status)
  }
}
