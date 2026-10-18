import { NextRequest, NextResponse } from 'next/server'
import { getBearerToken, verifySessionToken } from '@/lib/auth'
import { getListingById, isUnlocked, updateListing, toPublicListing } from '@/lib/marketplace-db'

export const dynamic = 'force-dynamic'

async function authEmail(req: NextRequest): Promise<string | null> {
  const token = getBearerToken(req)
  if (!token) return null
  const payload = await verifySessionToken(token)
  return payload?.email ? payload.email.toLowerCase().trim() : null
}

// GET —— 公开字段 + unlocked 状态；仅已解锁者附带联系方式
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const listing = await getListingById(id)
  if (!listing || listing.status === 'removed') {
    return NextResponse.json({ error: 'Listing not found', code: 'NOT_FOUND' }, { status: 404 })
  }
  const email = await authEmail(req)
  const isSeller = !!email && email === listing.sellerEmail
  const unlocked = !!email && (isSeller || (await isUnlocked(listing.id, email)))
  const pub = toPublicListing(listing, !isSeller)
  return NextResponse.json({
    listing: pub,
    unlocked,
    isSeller,
    ...(unlocked ? { contact: { email: listing.contactEmail, socialType: listing.socialType, socialHandle: listing.socialHandle } } : {}),
  })
}

// PATCH —— 仅卖家：改价/描述/withdraw/mark_sold
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const email = await authEmail(req)
  if (!email) return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 })
  const listing = await getListingById(id)
  if (!listing) return NextResponse.json({ error: 'Listing not found', code: 'NOT_FOUND' }, { status: 404 })
  if (listing.sellerEmail !== email) return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const patch: Parameters<typeof updateListing>[2] = {}
  if (body.askingPriceUsd !== undefined) {
    const v = Number(body.askingPriceUsd)
    if (!Number.isFinite(v) || v < 1 || v > 10_000_000) return NextResponse.json({ error: 'INVALID_PRICE', code: 'INVALID_PRICE' }, { status: 400 })
    patch.askingPriceUsd = v
  }
  if (body.description !== undefined) {
    const d = body.description == null ? null : String(body.description).trim()
    if (d && d.length > 500) return NextResponse.json({ error: 'DESCRIPTION_TOO_LONG', code: 'DESCRIPTION_TOO_LONG' }, { status: 400 })
    patch.description = d
  }
  if (body.action === 'withdraw' || body.action === 'mark_sold') patch.action = body.action
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'EMPTY_PATCH', code: 'EMPTY_PATCH' }, { status: 400 })

  const updated = await updateListing(id, email, patch)
  if (!updated) return NextResponse.json({ error: 'Update failed', code: 'UPDATE_FAILED' }, { status: 500 })
  return NextResponse.json({ ok: true, listing: toPublicListing(updated, false) })
}
