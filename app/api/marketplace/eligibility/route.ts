import { NextRequest, NextResponse } from 'next/server'
import { getBearerToken, verifySessionToken } from '@/lib/auth'
import { hasPaidReport } from '@/lib/marketplace-db'

export const dynamic = 'force-dynamic'

// GET /api/marketplace/eligibility?username=xxx —— 当前登录用户是否可登记该账号
export async function GET(req: NextRequest) {
  const token = getBearerToken(req)
  if (!token) return NextResponse.json({ eligible: false, code: 'UNAUTHORIZED' }, { status: 401 })
  const payload = await verifySessionToken(token)
  if (!payload?.email) return NextResponse.json({ eligible: false, code: 'UNAUTHORIZED' }, { status: 401 })

  const username = String(req.nextUrl.searchParams.get('username') || '').toLowerCase().trim()
  if (!username) return NextResponse.json({ eligible: false, code: 'MISSING_USERNAME' }, { status: 400 })

  const eligible = await hasPaidReport(payload.email, username)
  return NextResponse.json({ eligible, code: eligible ? 'OK' : 'LISTING_REQUIRES_PAID_REPORT' })
}
