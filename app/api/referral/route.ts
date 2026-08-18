import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken, getBearerToken } from '@/lib/auth'
import { getCommissionOverview } from '@/lib/referral'

export const dynamic = 'force-dynamic'

/**
 * GET /api/referral — 推荐人佣金概览（必须鉴权）。
 * 返回推荐码、推荐链接、settled/pending/voided 余额与最近明细。
 * 佣金为现金记账（USD），仅支持 USDC 提现（提现二期做）。
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
  if (!auth || !auth.email) {
    return NextResponse.json(
      { error: 'Invalid or expired token', code: 'UNAUTHORIZED' },
      { status: 401, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  }

  try {
    const overview = await getCommissionOverview(auth.email)
    return NextResponse.json(
      { ...overview, email: auth.email },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
    )
  } catch (err) {
    console.error('[referral] error:', err)
    return NextResponse.json(
      { error: 'Failed to load referral data', code: 'REFERRAL_ERROR' },
      { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  }
}
