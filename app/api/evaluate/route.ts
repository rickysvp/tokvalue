import { NextRequest, NextResponse } from 'next/server'
import { fetchProfile } from '@/lib/tiktok'
import { scoreProfile } from '@/lib/scoring'
import { findEvaluation, saveEvaluation, isCacheValid } from '@/lib/db'
import { generateTrendAnalysis, generateCommercializationAdvice, generateContentStrategy, getLangFromAcceptLanguage } from '@/lib/deepseek'
import { getBearerToken, verifySessionToken } from '@/lib/auth'
import { consumeCredit, refundCredit } from '@/lib/credits-server'
import { getServerDict } from '@/lib/i18n/server'
import { recordEventFromRequest } from '@/lib/analytics'
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
  try {
    const body = await req.json().catch(() => ({}))
    const username = String(body.username || '').trim()

    if (!username) {
      return errorResponse('INVALID_USERNAME', getServerDict().api.evaluate.INVALID_USERNAME, 400)
    }

    normalized = username.replace(/^@/, '').toLowerCase()

    // 认证校验（前置）：评估必须先登录（即邮箱已验证），无论是否命中缓存
    const token = getBearerToken(req)
    if (!token) {
      return NextResponse.json({ error: getServerDict().api.errors.NO_CREDITS, code: 'NO_CREDITS' }, { status: 402 })
    }
    const payload = await verifySessionToken(token)
    if (!payload) {
      return NextResponse.json({ error: getServerDict().api.errors.SESSION_EXPIRED, code: 'NO_CREDITS' }, { status: 402 })
    }
    userEmail = payload.email

    // 24h cache to save RapidAPI quota
    // 缓存命中时不扣减额度（节省 RapidAPI 配额），但鉴权必须通过（已在上文校验）
    if (await isCacheValid(normalized, 24)) {
      const cached = await findEvaluation(normalized)
      if (cached) {
        // 缓存命中也记录 evaluate_done（口径与非缓存一致，metadata.cached=true 区分）
        recordEventFromRequest(req, {
          event_type: 'evaluate_done',
          username: normalized,
          metadata: { score: cached.score, tier: cached.tier, cached: true },
        }).catch(err => console.warn('[evaluate] recordEvent(cached) failed:', err))
        return NextResponse.json({ ...cached, cached: true })
      }
    }

    // 扣减 1 次额度（仅缓存未命中时消耗），传入username用于日志记录
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

    // Record evaluate_start event
    recordEventFromRequest(req, {
      event_type: 'evaluate_start',
      username: normalized,
      path: '/api/evaluate',
    }).catch(err => console.warn('[evaluate] recordEvent(start) failed:', err))

    let evaluation = scoreProfile(profile)
    const lang = getLangFromAcceptLanguage(req.headers.get('Accept-Language'))
    evaluation = await enrichWithAI(evaluation, lang)

    await saveEvaluation(evaluation, userEmail)

    // Record evaluate_done event
    recordEventFromRequest(req, {
      event_type: 'evaluate_done',
      username: normalized,
      metadata: { score: evaluation.score, tier: evaluation.tier, cached: false },
    }).catch(err => console.warn('[evaluate] recordEvent(done) failed:', err))

    return NextResponse.json(evaluation)
  } catch (err) {
    // ── 额度回滚：fetchProfile/评分/保存失败时退还已扣额度 ──
    if (userEmail) {
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
    // Record api_error event
    recordEventFromRequest(req, {
      event_type: 'api_error',
      path: '/api/evaluate',
      username: normalized || undefined,
      metadata: {
        error_code: code,
        error_message: detail.slice(0, 200),
      },
    }).catch(err => console.warn('[evaluate] recordEvent(error) failed:', err))
    return errorResponse(code, mapping.message, mapping.status)
  }
}