import { NextRequest, NextResponse } from 'next/server'
import { getBearerToken, verifySessionToken } from '@/lib/auth'
import { addReport, getListingById } from '@/lib/marketplace-db'
import { checkIpRateLimit, ipBucketKey, rateLimitResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// POST { listingId, reason? } —— 需登录；每人每单一次；≥3 独立举报自动下架
export async function POST(req: NextRequest) {
  const token = getBearerToken(req)
  if (!token) return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 })
  const payload = await verifySessionToken(token)
  if (!payload?.email) return NextResponse.json({ error: 'Invalid session', code: 'UNAUTHORIZED' }, { status: 401 })
  const email = payload.email.toLowerCase().trim()

  if (!(await checkIpRateLimit(ipBucketKey('marketplace-report', req), { limit: 20, windowHours: 1 }))) {
    return rateLimitResponse('Too many reports, please try again later')
  }

  const body = await req.json().catch(() => ({}))
  const listingId = String(body.listingId || '').trim()
  const reason = body.reason ? String(body.reason).slice(0, 200) : null
  if (!listingId) return NextResponse.json({ error: 'listingId required', code: 'INVALID_INPUT' }, { status: 400 })

  const listing = await getListingById(listingId)
  if (!listing) return NextResponse.json({ error: 'Listing not found', code: 'NOT_FOUND' }, { status: 404 })
  if (listing.sellerEmail === email) return NextResponse.json({ error: 'Cannot report own listing', code: 'SELF_REPORT' }, { status: 400 })

  const { reported, removed } = await addReport(listingId, email, reason)
  return NextResponse.json({ ok: true, reported, removed })
}
