import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { verifySessionToken, getBearerToken } from '@/lib/auth'
import { listOwnedUsernames, findEvaluation } from '@/lib/db'
import { hydrateCommercial } from '@/lib/scoring/commercial'

export const dynamic = 'force-dynamic'

/**
 * GET /api/history — 用户个人评估历史，必须鉴权。
 * 仅返回当前登录用户评估过的记录。
 */
export async function GET(req: NextRequest) {
  const token = getBearerToken(req)
  if (!token) {
    return NextResponse.json(
      { error: 'Authentication required', code: 'UNAUTHORIZED' },
      { status: 401, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  }

  const auth = await verifySessionToken(token)
  if (!auth) {
    return NextResponse.json(
      { error: 'Invalid or expired token', code: 'UNAUTHORIZED' },
      { status: 401, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  }

  try {
    const DATABASE_URL = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').replace(/\s+/g, '')
    if (!DATABASE_URL) {
      return NextResponse.json({ evaluations: [] }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
    }

    const sql = neon(DATABASE_URL)

    // 按用户收费、不共享：以 ownership 表为单一事实源，取当前用户拥有的账号列表
    const owned = await listOwnedUsernames(auth.email, 50)
    if (owned.length === 0) {
      return NextResponse.json({ evaluations: [] }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
    }

    const rows = await sql`
      SELECT
        username, nickname, avatar, tier, score,
        follower_count, total_likes, video_count, region, verified,
        account_profile, is_free,
        business_value->'totalValue'->>'high' as bv_high,
        business_value->'totalValue'->>'mid' as bv_mid,
        computed_at
      FROM evaluations
      WHERE username = ANY(${owned})
      ORDER BY created_at DESC
      LIMIT 50
    `

    const evaluations = rows.map((r: Record<string, unknown>) => {
      const profile = (r.account_profile || {}) as { categories?: string[]; personaType?: string }
      return {
        username: String(r.username || ''),
        nickname: String(r.nickname || r.username || ''),
        avatar: r.avatar ? String(r.avatar) : null,
        tier: String(r.tier || 'C'),
        score: Number(r.score || 0),
        followerCount: Number(r.follower_count || 0),
        totalLikes: Number(r.total_likes || 0),
        videoCount: Number(r.video_count || 0),
        region: r.region ? String(r.region) : null,
        verified: Boolean(r.verified),
        categories: Array.isArray(profile.categories) ? profile.categories.slice(0, 3) : [],
        personaType: profile.personaType || null,
        businessValueHigh: Number(r.bv_high || 0),
        businessValueMid: Number(r.bv_mid || 0),
        // access 标识：is_free=false（付费完整报告）才可分享/导出 PDF；NULL/true 视为免费
        isFree: r.is_free !== false,
        computedAt: String(r.computed_at || ''),
      }
    })

    // ── B5b Dashboard（Overview / Topbar）增强：computed_at 最近一条的全量数据 ──
    // 重评会刷新 computed_at（created_at 仅记录行首次插入），故按 computed_at 取最近；
    // 商业快照（primaryRateBlocker）在服务端 hydrate —— 客户端不得基于可篡改数值重算报价。
    let latest: Record<string, unknown> | null = null
    if (evaluations.length > 0) {
      const latestItem = evaluations.reduce((a, b) =>
        new Date(b.computedAt).getTime() > new Date(a.computedAt).getTime() ? b : a,
      )
      const full = await findEvaluation(latestItem.username)
      if (full) {
        const hydrated = hydrateCommercial(full)
        latest = {
          username: hydrated.username,
          nickname: hydrated.nickname,
          avatar: hydrated.avatar ?? null,
          computedAt: hydrated.computedAt,
          score: hydrated.score,
          tier: hydrated.tier,
          totalValue: hydrated.businessValue?.totalValue ?? null,
          valuationV2: hydrated.valuationV2 ?? null,
          pillars: hydrated.pillars ?? null,
          baselineReview: hydrated.baselineReview ?? null,
          previousReview: hydrated.previousReview ?? null,
          dimensions: hydrated.dimensions ?? null,
          primaryRateBlocker: hydrated.commercialSnapshot?.primaryRateBlocker ?? null,
        }
      }
    }

    return NextResponse.json(
      { evaluations, email: auth.email, latest },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
    )
  } catch (err) {
    console.error('[history] error:', err)
    return NextResponse.json(
      { evaluations: [] },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  }
}
