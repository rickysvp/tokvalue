import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { verifySessionToken, getBearerToken } from '@/lib/auth'
import { listOwnedUsernames } from '@/lib/db'

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
        account_profile,
        business_value->'totalValue'->>'high' as bv_high,
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
        computedAt: String(r.computed_at || ''),
      }
    })

    return NextResponse.json(
      { evaluations, email: auth.email },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
    )
  } catch (err) {
    console.error('[history] error:', err)
    return NextResponse.json(
      { evaluations: [] },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  }
}
