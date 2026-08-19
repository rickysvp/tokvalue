// app/api/reviews/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getBearerToken, verifySessionToken } from '@/lib/auth'
import { getReview, reconcileInFlight } from '@/lib/reviews'
import { isStaleReview } from '@/lib/review-state'

export const dynamic = 'force-dynamic'

/**
 * Review 状态查询（前端轮询用）。
 * 附带惰性对账：活跃态超过 TTL → 判 failed + credits 自动返还（reconcileInFlight 内处理）。
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearerToken(req)
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }
  const payload = await verifySessionToken(token)
  if (!payload) {
    return NextResponse.json({ error: 'Session expired', code: 'NEED_VERIFY' }, { status: 401 })
  }

  const { id } = await params
  const row = await getReview(id)
  if (!row || row.email !== payload.email.toLowerCase().trim()) {
    return NextResponse.json({ error: 'Review not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  // 惰性对账：卡死状态超 TTL → failed + 返还
  if (!['completed', 'failed'].includes(row.status) && isStaleReview(row.status, row.state_entered_at)) {
    await reconcileInFlight(row.email, row.username)
    const fresh = await getReview(id)
    return NextResponse.json({ review: fresh ?? row })
  }

  return NextResponse.json({ review: row })
}
