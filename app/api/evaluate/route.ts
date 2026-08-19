import { NextRequest, NextResponse } from 'next/server'
import { fetchProfile } from '@/lib/tiktok'
import { fetchAndEncodeAvatar } from '@/lib/avatar'
import { scoreProfile } from '@/lib/scoring'
import { findEvaluation, findFreeEvaluation, saveEvaluation, isCacheValid, checkFreeRateLimit, hasOwnership, upsertOwnership, isEvaluationPaid } from '@/lib/db'
import { hydrateCommercial } from '@/lib/scoring/commercial'
import { generateTrendAnalysis, generateCommercializationAdvice, generateContentStrategy } from '@/lib/deepseek'
import { getBearerToken, verifySessionToken } from '@/lib/auth'
import { consumeCredit, refundCredit, consumeFreeAllowance } from '@/lib/credits-server'
import { getServerDict } from '@/lib/i18n/server'
import { recordEventFromRequest, recordFreeEvaluate } from '@/lib/analytics'
import { getClientIp } from '@/lib/ip'
import { createOrGetReview, transitionReview, failReview, reconcileInFlight, type AccountReviewRow } from '@/lib/reviews'
import { recordUsageEvent } from '@/lib/usage-events'
import { isTerminalReview, type ReviewStatus } from '@/lib/review-state'
import { getFreshSnapshot, upsertSnapshot } from '@/lib/snapshots'
import { hasFreeGrant, consumeFreeGrant } from '@/lib/free-grants'
import { isFreeBudgetExceeded } from '@/lib/api-governance'
import { stripForTeaser } from '@/lib/teaser'
import type { RawProfile } from '@/types'
import { ApiErrorResponse, Evaluation } from '@/types'

export const dynamic = 'force-dynamic'

// 合并 utm 到事件 metadata（服务端归因）
function withUtm(meta: Record<string, unknown>, utm?: Record<string, unknown>): Record<string, unknown> {
  return utm && Object.keys(utm).length > 0 ? { ...meta, utm } : meta
}

/** B1 状态机开关：默认关闭 = 行为与旧版完全一致 */
function reviewStateMachineEnabled(): boolean {
  return process.env.REVIEW_STATE_MACHINE === 'true'
}

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

/**
 * B5a Baseline（Spec §8）：保存前取被 UPSERT 覆盖的上一次评估。
 * 库中无该 username → 首评 baselineReview=true；有 → 附 previousReview 摘要（次评起显示 delta）。
 */
async function attachBaseline(evaluation: Evaluation, normalized: string) {
  const previous = await findEvaluation(normalized)
  if (previous) {
    evaluation.previousReview = {
      computedAt: previous.computedAt,
      score: previous.score,
      tier: previous.tier,
      valueMid: previous.businessValue?.totalValue?.mid ?? 0,
    }
  } else {
    evaluation.baselineReview = true
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
  let isFreeMode = false
  // 免费额度扣减结果（用于埋点；null = 未经过额度扣减，如 dev 无 token）
  let freeAllowance: { used: number; limit: number } | null = null

  // ── B1 review 状态机上下文（flag 关闭时恒为 null，走旧路径）──
  let reviewRow: AccountReviewRow | null = null
  let reviewQuotaReserved = false // credits 已预扣且未落定（用于 catch 精确返还）
  const advance = async (to: ReviewStatus) => {
    if (reviewRow) await transitionReview(reviewRow.id, to)
  }

  try {
    const body = await req.json().catch(() => ({}))
    const username = String(body.username || '').trim()
    // utm 归因：客户端从 sessionStorage 透传到 body（可选），服务端写入事件 metadata
    const utm = (body.utm && typeof body.utm === 'object') ? body.utm as Record<string, unknown> : undefined

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
          // 旧缓存缺 PMF 字段时服务端补建（客户端不得重算报价）
          return NextResponse.json({ ...hydrateCommercial(cached), cached: true, isFree: false, access_level: 'full' })
        }
      }

      // ── B1: 幂等 + in-flight 锁（仅 flag 开启时）──
      if (reviewStateMachineEnabled()) {
        await reconcileInFlight(userEmail, normalized) // 先清理超时僵尸
        const idemKey = typeof body.idempotency_key === 'string' && body.idempotency_key
          ? body.idempotency_key.slice(0, 64)
          : crypto.randomUUID() // 客户端未传则本次请求内生成（无跨请求幂等，行为同旧版）
        const res = await createOrGetReview(userEmail, normalized, idemKey, 'credits')
        if (res.kind === 'conflict') {
          return NextResponse.json(
            { error: 'A review for this account is already in progress.', code: 'REVIEW_IN_FLIGHT', review_id: res.review.id },
            { status: 409 }
          )
        }
        if (res.kind === 'reused' && res.review.status === 'completed') {
          // 幂等重放：直接返回已完成的报告，不重复扣费
          const cached = await findEvaluation(normalized)
          if (cached) {
            return NextResponse.json({ ...hydrateCommercial(cached), cached: true, isFree: false, access_level: 'full', review_id: res.review.id })
          }
        }
        if (res.kind === 'created' || res.kind === 'reused') {
          reviewRow = res.review
          await recordUsageEvent({
            email: userEmail, username: normalized, reviewId: reviewRow.id,
            eventType: res.kind === 'created' ? 'review_started' : 'review_reused',
            purchaseType: 'credits', status: reviewRow.status,
          })
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
        // B1 修复：降级前释放已创建的 credits review 行（未预扣额度，无需返还），
        // 否则 in-flight 锁会把随后的免费路径卡成 409
        if (reviewRow) {
          await failReview(reviewRow.id, 'downgraded_to_free_no_credits')
          reviewRow = null
        }
      }

      if (isPaidMode) {
        if (reviewRow) {
          reviewRow = (await transitionReview(reviewRow.id, 'quota_reserved')) ?? reviewRow
          reviewQuotaReserved = true
          await recordUsageEvent({
            email: userEmail, username: normalized, reviewId: reviewRow.id,
            eventType: 'quota_reserved', purchaseType: 'credits', status: 'quota_reserved',
          })
          await advance('fetching_data')
        }

        // ── B2: 24h 快照优先——命中跳过 RapidAPI（照常扣费）；force 刷新则跳过快照 ──
        let profile: RawProfile
        let dataRefreshedHoursAgo: number | undefined
        const snap = forceRefresh ? null : await getFreshSnapshot(normalized)
        if (snap) {
          profile = snap.profile
          dataRefreshedHoursAgo = Math.floor(snap.ageHours)
          await advance('data_saved')
        } else {
          profile = await fetchProfile(normalized, { reviewId: reviewRow?.id ?? undefined, purchaseType: 'credits' })
          await advance('data_saved')
          await upsertSnapshot(profile)
        }

        recordEventFromRequest(req, {
          event_type: 'evaluate_start',
          username: normalized,
          path: '/api/evaluate',
        }).catch(err => console.warn('[evaluate] recordEvent(start) failed:', err))

        let evaluation = scoreProfile(profile)
        await advance('analyzing')
        evaluation = await enrichWithAI(evaluation, lang)
        // 持久化头像：下载 TikTok CDN 图 → 转 base64 WebP（避免 24h 过期）
        evaluation.avatarData = (await fetchAndEncodeAvatar(evaluation.avatar)) ?? undefined
        await advance('report_generating')

        // ── B5a Baseline（Spec §8）：首评 / 次评对比摘要 ──
        await attachBaseline(evaluation, normalized)

        await saveEvaluation(evaluation, { evaluatedBy: userEmail, isFree: false })
        await upsertOwnership(userEmail, normalized, { isFree: false })

        if (reviewRow) {
          reviewRow = (await transitionReview(reviewRow.id, 'completed')) ?? reviewRow
          reviewQuotaReserved = false
          await recordUsageEvent({
            email: userEmail, username: normalized, reviewId: reviewRow.id,
            eventType: 'quota_consumed', purchaseType: 'credits', status: 'completed',
          })
          await recordUsageEvent({
            email: userEmail, username: normalized, reviewId: reviewRow.id,
            eventType: 'review_completed', purchaseType: 'credits', status: 'completed',
            meta: { score: evaluation.score, tier: evaluation.tier },
          })
        }

        recordEventFromRequest(req, {
          event_type: 'evaluate_done',
          username: normalized,
          metadata: { score: evaluation.score, tier: evaluation.tier, cached: false },
        }).catch(err => console.warn('[evaluate] recordEvent(done) failed:', err))

        return NextResponse.json({
          ...evaluation,
          isFree: false,
          access_level: 'full',
          ...(reviewRow ? { review_id: reviewRow.id } : {}),
          ...(dataRefreshedHoursAgo !== undefined ? { dataRefreshedHoursAgo } : {}),
        })
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
      // 免费缓存命中同样只下发 Teaser 白名单字段（缓存中是全量数据，必须裁剪）
      return NextResponse.json({ ...stripForTeaser(hydrateCommercial(freeCached)), cached: true, ...(reviewRow ? { review_id: reviewRow.id } : {}) })
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

    // ── B2: 免费预算闸——日/月 API 成本触达阈值 → 暂停免费生成（付费不受影响）──
    if (await isFreeBudgetExceeded()) {
      recordEventFromRequest(req, {
        event_type: 'api_error',
        path: '/api/evaluate',
        username: normalized,
        metadata: { error_code: 'FREE_BUDGET_PAUSED', ip: clientIp },
      }).catch(() => {})
      return NextResponse.json(
        { error: 'Free evaluations are temporarily paused due to high demand. Please try again later or upgrade to unlock yours now.', code: 'FREE_BUDGET_PAUSED' },
        { status: 503 }
      )
    }

    // ── B1: 免费路径幂等 + in-flight 锁（有 userEmail 时）。
    // 置于额度扣减之前：conflict 409 时不耗免费额度（幂等检查先于锁定额度）──
    if (reviewStateMachineEnabled() && userEmail) {
      await reconcileInFlight(userEmail, normalized)
      const idemKey = typeof body.idempotency_key === 'string' && body.idempotency_key
        ? body.idempotency_key.slice(0, 64)
        : crypto.randomUUID()
      const res = await createOrGetReview(userEmail, normalized, idemKey, 'free_trial')
      if (res.kind === 'conflict') {
        return NextResponse.json(
          { error: 'A review for this account is already in progress.', code: 'REVIEW_IN_FLIGHT', review_id: res.review.id },
          { status: 409 }
        )
      }
      if (res.kind === 'created' || res.kind === 'reused') {
        reviewRow = res.review
        await recordUsageEvent({
          email: userEmail, username: normalized, reviewId: reviewRow.id,
          eventType: res.kind === 'created' ? 'review_started' : 'review_reused',
          purchaseType: 'free_trial', status: reviewRow.status,
        })
      }
    }

    // ── B2 辅闸预检：该 username 已被免费生成过 → 直接拒（付费路径不受影响；
    // 本邮箱 24h 免费缓存命中已在更早处 return）──
    if (!IS_DEV || userEmail) {
      if (await hasFreeGrant(normalized)) {
        if (reviewStateMachineEnabled() && reviewRow && !isTerminalReview(reviewRow.status)) {
          await failReview(reviewRow.id, 'free_username_grant_used').catch(() => {})
          reviewRow = null
        }
        return NextResponse.json(
          { error: 'This account has already been analyzed with a free review. Upgrade to unlock a fresh one.', code: 'FREE_USERNAME_USED' },
          { status: 403 }
        )
      }
    }

    // 邮箱免费额度判定（IP 限流之后、fetchProfile 之前；24h 缓存命中已在更早处 return，不耗额度）
    // prod 下走到这里必有 userEmail（无 token 已被上方 NEED_VERIFY 挡掉，付费降级保留 userEmail）；
    // dev + 无 token 时跳过额度检查
    if (!IS_DEV) {
      const allowance = await consumeFreeAllowance(userEmail)
      if (!allowance.ok) {
        // B1 修复：额度耗尽时释放已创建的 review 行，避免 in-flight 锁残留
        if (reviewRow) {
          await failReview(reviewRow.id, 'free_allowance_exhausted')
          reviewRow = null
        }
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

    if (reviewRow) {
      // 免费额度已在上方 consumeFreeAllowance 原子扣减
      await advance('quota_reserved')
      await advance('fetching_data')
    }

    // ── B2: 快照优先——24h 内拉取过的账号直接复用，不调 RapidAPI、不耗辅闸 ──
    let profile: RawProfile | null = (await getFreshSnapshot(normalized))?.profile ?? null
    if (!profile) {
      // ── B2 辅闸原子消耗：并发下仅一个请求拿到该 username 的免费名额 ──
      const grant = await consumeFreeGrant(normalized, userEmail || undefined)
      if (!grant.ok) {
        if (reviewRow) {
          await failReview(reviewRow.id, 'free_username_grant_used').catch(() => {})
          reviewRow = null
        }
        return NextResponse.json(
          { error: 'This account has already been analyzed with a free review. Upgrade to unlock a fresh one.', code: 'FREE_USERNAME_USED' },
          { status: 403 }
        )
      }
      profile = await fetchProfile(normalized, { reviewId: reviewRow?.id ?? undefined, purchaseType: 'free_trial' })
      await upsertSnapshot(profile)
    }
    await advance('data_saved')
    await advance('analyzing') // 免费路径 scoreProfile 即全部计算

    recordEventFromRequest(req, {
      event_type: 'evaluate_start',
      username: normalized,
      path: '/api/evaluate',
      metadata: withUtm({ free: true }, utm),
    }).catch(err => console.warn('[evaluate] recordEvent(free-start) failed:', err))

    const evaluation = scoreProfile(profile)
    // 持久化头像：下载 TikTok CDN 图 → 转 base64 WebP（避免 24h 过期）
    evaluation.avatarData = (await fetchAndEncodeAvatar(evaluation.avatar)) ?? undefined
    // ── B5a Baseline（Spec §8）：首评 / 次评对比摘要 ──
    await attachBaseline(evaluation, normalized)
    // Free mode：不跑 AI 富化（估值/评分/维度/风险/收入均为算法产出，不依赖 AI）。
    // AI 富化（trendAnalysis/commercializationAdvice/contentStrategy 的个性化深度分析）
    // 是付费解锁内容，由 upgrade 或付费 evaluate 路径补跑，避免免费评估白白烧 DeepSeek 钱。

    // 免费评估不得覆盖已付费的报告快照（付费报告含 AI 富化深度分析）
    const alreadyPaid = await isEvaluationPaid(normalized)
    if (!alreadyPaid) {
      await saveEvaluation(evaluation, { evaluatedBy: userEmail, isFree: true, ip: clientIp })
    }
    await upsertOwnership(userEmail, normalized, { isFree: true })

    if (reviewRow) {
      reviewRow = (await transitionReview(reviewRow.id, 'completed')) ?? reviewRow
      await recordUsageEvent({
        email: userEmail, username: normalized, reviewId: reviewRow.id,
        eventType: 'quota_consumed', purchaseType: 'free_trial', status: 'completed',
      })
    }

    recordEventFromRequest(req, {
      event_type: 'evaluate_done',
      username: normalized,
      metadata: withUtm({
        score: evaluation.score,
        tier: evaluation.tier,
        cached: false,
        free: true,
        // 免费额度使用进度（"used/limit"，如 "1/2"）；dev 无 token 跳过额度检查时无此字段
        freeUsed: freeAllowance ? `${freeAllowance.used}/${freeAllowance.limit}` : undefined,
      }, utm),
    }).catch(err => console.warn('[evaluate] recordEvent(free-done) failed:', err))

    console.log(`[evaluate] FREE | user=${normalized} | tier=${evaluation.tier} | score=${evaluation.score} | ip=${clientIp}`)

    // 免费模式只下发 Teaser 白名单字段（数据库已存全量，付费升级后可取回完整报告）
    return NextResponse.json({ ...stripForTeaser(evaluation), ...(reviewRow ? { review_id: reviewRow.id } : {}) })

  } catch (err) {
    // ── B1: 精确返还——只有「review 行存在且仍活跃」才 fail + refund，
    // 修复旧路径"consume 之前出错也返还"的多退边界 ──
    if (reviewStateMachineEnabled() && reviewRow && !isTerminalReview(reviewRow.status)) {
      try {
        const detail = err instanceof Error ? err.message : String(err)
        const failed = await failReview(reviewRow.id, detail)
        if (failed && failed.purchase_type === 'credits' && reviewQuotaReserved) {
          await refundCredit(failed.email)
          await recordUsageEvent({
            email: failed.email, username: failed.username, reviewId: failed.id,
            eventType: 'quota_released', purchaseType: failed.purchase_type,
            status: 'failed', meta: { reason: detail.slice(0, 200) },
          })
        }
      } catch (cleanupErr) {
        // 清理失败不吞原始错误（reconcile 惰性对账兜底释放）
        console.error('[evaluate] B1 fail/refund cleanup failed:', cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr))
      }
    } else if (!reviewStateMachineEnabled() && userEmail && !isFreeMode) {
      // flag 关闭：保留旧行为（原样返还）
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
