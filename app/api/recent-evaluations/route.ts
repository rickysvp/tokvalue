import { NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import type { RecentEvaluation } from '@/types'

export const dynamic = 'force-dynamic'
export const revalidate = 60

/**
 * GET /api/recent-evaluations
 *
 * 公开端点：着陆页社会证明卡片。仅返回最近 12 条评估的脱敏摘要数据。
 * 不包含用户身份信息，只展示公开的 TikTok 账号数据。
 */
export async function GET() {
  try {
    const DATABASE_URL = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').replace(/\s+/g, '')
    if (!DATABASE_URL) {
      return NextResponse.json({ evaluations: [] }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
    }

    const sql = neon(DATABASE_URL)

    const rows = await sql`
      SELECT
        username,
        nickname,
        avatar,
        tier,
        score,
        follower_count,
        total_likes,
        video_count,
        region,
        verified,
        account_profile,
        business_value->'totalValue'->>'high' as bv_high,
        computed_at
      FROM evaluations
      WHERE username IS NOT NULL
        AND follower_count > 1000
      ORDER BY created_at DESC
      LIMIT 100
    `

    const evaluations: RecentEvaluation[] = rows.map((r: Record<string, unknown>) => {
      const profile = (r.account_profile || {}) as {
        categories?: string[]
        personaType?: string
      }
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
      { evaluations },
      { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } }
    )
  } catch (err) {
    console.error('[recent-evaluations] error:', err)
    return NextResponse.json(
      { evaluations: [] },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  }
}
