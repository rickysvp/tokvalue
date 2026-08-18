import { NextRequest, NextResponse } from 'next/server'
import { fetchProfile } from '@/lib/tiktok'
import { fetchAndEncodeAvatar } from '@/lib/avatar'
import { scoreProfile } from '@/lib/scoring'
import { findEvaluation, findFreeEvaluation, saveEvaluation, isCacheValid, checkFreeRateLimit, hasOwnership, upsertOwnership, isEvaluationPaid } from '@/lib/db'
import { generateTrendAnalysis, generateCommercializationAdvice, generateContentStrategy } from '@/lib/deepseek'
import { getBearerToken, verifySessionToken } from '@/lib/auth'
import { consumeCredit, refundCredit, consumeFreeAllowance } from '@/lib/credits-server'
import { getServerDict } from '@/lib/i18n/server'
import { recordEventFromRequest, recordFreeEvaluate } from '@/lib/analytics'
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
  // 免费额度扣减结果（用于埋点；null = 未经过额度扣减，如 dev 无 token）
  let freeAllowance: { used: number; limit: number } | null = null

  try {
    const body = await req.json().catch(() => ({}))
    const username = String(body.username || '').trim()

    if (!username) {
      return errorResponse('INVALID_USERNAME', getServerDict().api.evaluate.INVALID_USERNAME, 400)
    }

    normalized = username.replace(/^@/, '').toLowerCase()
    const lang = 'en' // Fixed to English until multi-language dictionaries are ready

    // ── Mode detection: token present & valid → paid, no token → free ──
    const token = getBearerToken(req)
    let isPaidMode = false

    if (token) {
      const payload = await verifySessionToken(token)
      if (!payload) {
        // token 存在但无效（过期/伪造）→ 401，不再静默降级到免费模式
        //（静默降级等于给"无效 token"留了一条绕过邮箱验证的白嫖通道）
        return NextResponse.json(
          { error: 'Session expired. Please verify your email again.', code: 'NEED_VERIFY' },
          { status: 401 }
        )
      }
      userEmail = payload.email
      isPaidMode = true
    }

    // ═══════════════════════════════════════════
    // PAID MODE — 30-day cache, force=true to skip
    // ═══════════════════════════════════════════
    if (isPaidMode) {
      const forceRefresh = body.force === true
      // 30-day cache to save RapidAPI + DeepSeek quota
      // 按用户收费：缓存命中只认「当前用户已付费拥有此账号」，跨用户不共享。
      if (!forceRefresh && await isCacheValid(normalized) && await hasOwnership(userEmail, normalized, { paidOnly: true })) {
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
        if (consumeResult.reason !== 'NO_CREDITS' && consumeResult.reason !== 'NOT_FOUND') {
          // 非"无余额"类失败（DISABLED 等）仍直接报错返回
          return NextResponse.json(
            { error: getServerDict().api.errors.CONSUME_ERROR, code: consumeResult.reason || 'CONSUME_ERROR' },
            { status: 400 }
          )
        }
        // credits=0 的已验证用户：不再直接 402，跳出付费分支落入免费额度流程
        //（保留 userEmail，免费 24h 缓存检查 / 邮箱终身额度判定照走）
        isPaidMode = false
      }

      if (isPaidMode) {
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
        await upsertOwnership(userEmail, normalized, { isFree: false })

        recordEventFromRequest(req, {
          event_type: 'evaluate_done',
          username: normalized,
          metadata: { score: evaluation.score, tier: evaluation.tier, cached: false },
        }).catch(err => console.warn('[evaluate] recordEvent(done) failed:', err))

        return NextResponse.json({ ...evaluation, isFree: false })
      }
    }

    // ═══════════════════════════════════════════
    // FREE MODE — new freemium flow
    // ═══════════════════════════════════════════
    isFreeMode = true
    // 本地开发保留无 token 免费通道（开发便利）
    const IS_DEV = process.env.NODE_ENV === 'development'

    // 免费评估需要已验证邮箱的 session（消灭纯游客白嫖；
    // 到达此处的无 token 请求只可能是 dev 环境，或上方付费降级的已验证用户）
    if (!token && !IS_DEV) {
      return NextResponse.json(
        { error: 'Email verification required for free evaluations.', code: 'NEED_VERIFY' },
        { status: 401 }
      )
    }

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

    // 邮箱免费额度判定（IP 限流之后、fetchProfile 之前；24h 缓存命中已在更早处 return，不耗额度）
    // prod 下走到这里必有 userEmail（无 token 已被上方 NEED_VERIFY 挡掉，付费降级保留 userEmail）；
    // dev + 无 token 时跳过额度检查
    if (!IS_DEV) {
      const allowance = await consumeFreeAllowance(userEmail)
      if (!allowance.ok) {
        return NextResponse.json(
          {
            error: `You've used all ${allowance.limit} free evaluations. Upgrade to unlock more.`,
            code: 'FREE_LIMIT_EXHAUSTED',
          },
          { status: 402 }
        )
      }
      freeAllowance = allowance
      // 记录免费评估事件（与 free_evaluations 表 1:1 对齐，作为用户级转化率分母 + 按天趋势）
      if (userEmail) {
        recordFreeEvaluate({ email: userEmail, username: normalized }).catch(err =>
          console.warn('[evaluate] recordFreeEvaluate failed:', err)
        )
      }
    }

    const profile = await fetchProfile(normalized)

    recordEventFromRequest(req, {
      event_type: 'evaluate_start',
      username: normalized,
      path: '/api/evaluate',
      metadata: { free: true },
    }).catch(err => console.warn('[evaluate] recordEvent(free-start) failed:', err))

    const evaluation = scoreProfile(profile)
    // 持久化头像：下载 TikTok CDN 图 → 转 base64 WebP（避免 24h 过期）
    evaluation.avatarData = (await fetchAndEncodeAvatar(evaluation.avatar)) ?? undefined
    // Free mode：不跑 AI 富化（估值/评分/维度/风险/收入均为算法产出，不依赖 AI）。
    // AI 富化（trendAnalysis/commercializationAdvice/contentStrategy 的个性化深度分析）
    // 是付费解锁内容，由 upgrade 或付费 evaluate 路径补跑，避免免费评估白白烧 DeepSeek 钱。

    // 免费评估不得覆盖已付费的报告快照（付费报告含 AI 富化深度分析）
    const alreadyPaid = await isEvaluationPaid(normalized)
    if (!alreadyPaid) {
      await saveEvaluation(evaluation, { evaluatedBy: userEmail, isFree: true, ip: clientIp })
    }
    await upsertOwnership(userEmail, normalized, { isFree: true })

    recordEventFromRequest(req, {
      event_type: 'evaluate_done',
      username: normalized,
      metadata: {
        score: evaluation.score,
        tier: evaluation.tier,
        cached: false,
        free: true,
        // 免费额度使用进度（"used/limit"，如 "1/2"）；dev 无 token 跳过额度检查时无此字段
        freeUsed: freeAllowance ? `${freeAllowance.used}/${freeAllowance.limit}` : undefined,
      },
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
