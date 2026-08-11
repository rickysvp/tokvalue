import { NextRequest, NextResponse } from 'next/server'
import { findEvaluation, saveEvaluation } from '@/lib/db'
import { generateTrendAnalysis, generateCommercializationAdvice, generateContentStrategy } from '@/lib/deepseek'
import { getBearerToken, verifySessionToken } from '@/lib/auth'
import { consumeCredit, refundCredit } from '@/lib/credits-server'
import { getServerDict } from '@/lib/i18n/server'
import { recordEventFromRequest } from '@/lib/analytics'
import type { Evaluation } from '@/types'

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
    console.warn('[upgrade] AI enrichment failed:', err)
  }

  return evaluation
}

/**
 * POST /api/evaluate/upgrade
 * Upgrade a free evaluation to premium. Requires auth token.
 * Body: { username: string }
 */
export async function POST(req: NextRequest) {
  let userEmail = ''
  let normalized = ''

  try {
    const token = getBearerToken(req)
    if (!token) {
      return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 })
    }

    const payload = await verifySessionToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Session expired', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    userEmail = payload.email

    const body = await req.json().catch(() => ({}))
    const username = String(body.username || '').trim()
    if (!username) {
      return NextResponse.json({ error: 'Username required', code: 'INVALID_USERNAME' }, { status: 400 })
    }

    normalized = username.replace(/^@/, '').toLowerCase()

    const evaluation = await findEvaluation(normalized)
    if (!evaluation) {
      return NextResponse.json(
        { error: 'Evaluation not found. Please evaluate the account first.', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    const consumeResult = await consumeCredit(userEmail, normalized)
    if (!consumeResult.ok) {
      const msgs: Record<string, { msg: string; status: number }> = {
        NOT_FOUND:  { msg: getServerDict().api.errors.NO_CREDITS, status: 402 },
        NO_CREDITS: { msg: getServerDict().api.errors.NO_CREDITS, status: 402 },
      }
      const err = msgs[consumeResult.reason || ''] || {
        msg: getServerDict().api.errors.CONSUME_ERROR, status: 400,
      }
      return NextResponse.json({ error: err.msg, code: consumeResult.reason }, { status: err.status })
    }

    const lang = 'en' // Fixed to English until multi-language dictionaries are ready
    const enriched = await enrichWithAI(evaluation, lang)

    await saveEvaluation(enriched, { evaluatedBy: userEmail, isFree: false })

    recordEventFromRequest(req, {
      event_type: 'evaluate_done',
      username: normalized,
      metadata: { score: enriched.score, tier: enriched.tier, upgraded: true },
    }).catch(err => console.warn('[upgrade] recordEvent failed:', err))

    console.log(`[upgrade] ${normalized} | email=${userEmail}`)

    return NextResponse.json({ ...enriched, isFree: false })

  } catch (err) {
    if (userEmail) {
      refundCredit(userEmail).catch(e =>
        console.error('[upgrade] refund failed:', e instanceof Error ? e.message : String(e))
      )
    }

    const detail = err instanceof Error ? err.message : String(err)
    console.error(`[upgrade] error | user=${normalized || 'N/A'} | ${detail}`)
    return NextResponse.json(
      { error: 'Upgrade failed', code: 'API_ERROR', detail },
      { status: 500 }
    )
  }
}
