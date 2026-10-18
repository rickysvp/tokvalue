import { NextRequest, NextResponse } from 'next/server'
import { getBearerToken, verifySessionToken } from '@/lib/auth'
import { findEvaluation } from '@/lib/db'
import { checkIpRateLimit, ipBucketKey, rateLimitResponse } from '@/lib/rate-limit'
import { validateListingInput, buildSnapshot, MAX_ACTIVE_LISTINGS_PER_EMAIL, type ListingInput, type SocialType } from '@/lib/marketplace'
import { createListing, countActiveListingsByEmail, listActiveListings, getListingsBySeller, getActiveListingByUsername, toPublicListing, hasPaidReport, type ListingSort } from '@/lib/marketplace-db'

export const dynamic = 'force-dynamic'

const SORTS = ['latest', 'valuation_desc', 'valuation_asc', 'followers_desc'] as const

// GET /api/marketplace/listings?page=1&pageSize=24&sort=latest —— 公开，无 contact 字段
// GET /api/marketplace/listings?mine=1 —— JWT 鉴权，返回当前卖家全部 listing（含非 active 状态）
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('mine') === '1') {
    const token = getBearerToken(req)
    if (!token) return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 })
    const payload = await verifySessionToken(token)
    if (!payload?.email) return NextResponse.json({ error: 'Invalid session', code: 'UNAUTHORIZED' }, { status: 401 })
    const items = await getListingsBySeller(payload.email.toLowerCase().trim())
    return NextResponse.json({ items: items.map(l => toPublicListing(l, false, true)) })
  }
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1', 10) || 1)
  const pageSize = Math.min(48, Math.max(1, parseInt(req.nextUrl.searchParams.get('pageSize') || '24', 10) || 24))
  const sortParam = req.nextUrl.searchParams.get('sort') || 'latest'
  const sort = (SORTS as readonly string[]).includes(sortParam) ? sortParam : 'latest'
  const { items, total } = await listActiveListings(page, pageSize, sort as ListingSort)
  return NextResponse.json({ items: items.map(l => toPublicListing(l)), total, page, pageSize })
}

// POST /api/marketplace/listings —— JWT + 付费报告资格
export async function POST(req: NextRequest) {
  const token = getBearerToken(req)
  if (!token) return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 })
  const payload = await verifySessionToken(token)
  if (!payload?.email) return NextResponse.json({ error: 'Invalid session', code: 'UNAUTHORIZED' }, { status: 401 })
  const email = payload.email.toLowerCase().trim()

  if (!(await checkIpRateLimit(ipBucketKey('marketplace-list', req), { limit: 10, windowHours: 1 }))) {
    return rateLimitResponse('Too many listing attempts, please try again later')
  }

  const body = await req.json().catch(() => ({}))
  const input: ListingInput = {
    username: String(body.username || '').toLowerCase().trim(),
    askingPriceUsd: Number(body.askingPriceUsd),
    description: body.description ? String(body.description).trim() : null,
    contactEmail: String(body.contactEmail || '').toLowerCase().trim(),
    socialType: (body.socialType as SocialType | undefined) || null,
    socialHandle: body.socialHandle ? String(body.socialHandle).trim() : null,
  }

  const validation = validateListingInput(input)
  if (!validation.ok) return NextResponse.json({ error: validation.error, code: validation.error }, { status: 400 })

  const evaluation = await findEvaluation(input.username)
  if (!evaluation) return NextResponse.json({ error: 'Evaluate this account first', code: 'NO_EVALUATION' }, { status: 400 })
  // 资格硬约束：ownership 且已升级付费完整报告
  if (!(await hasPaidReport(email, input.username))) {
    return NextResponse.json({ error: 'Paid report required', code: 'LISTING_REQUIRES_PAID_REPORT' }, { status: 403 })
  }

  if (await countActiveListingsByEmail(email) >= MAX_ACTIVE_LISTINGS_PER_EMAIL) {
    return NextResponse.json({ error: 'Listing limit reached', code: 'MAX_LISTINGS' }, { status: 403 })
  }
  if (await getActiveListingByUsername(input.username)) {
    return NextResponse.json({ error: 'This account is already listed', code: 'LISTING_EXISTS' }, { status: 409 })
  }

  try {
    const listing = await createListing(input, buildSnapshot(evaluation), email)
    return NextResponse.json({ ok: true, listing: toPublicListing(listing, false, true) }, { status: 201 })
  } catch (err) {
    if (err instanceof Error && err.message === 'LISTING_EXISTS_FOR_USERNAME') {
      return NextResponse.json({ error: 'This account is already listed', code: 'LISTING_EXISTS' }, { status: 409 })
    }
    console.error('[marketplace/listings] create failed:', err)
    return NextResponse.json({ error: 'Listing failed', code: 'LISTING_ERROR' }, { status: 500 })
  }
}
