import { NextRequest, NextResponse } from 'next/server'
import { getBearerToken, verifySessionToken } from '@/lib/auth'
import { storePendingPurchase } from '@/lib/credits-server'
import { getListingById, isUnlocked } from '@/lib/marketplace-db'
import { UNLOCK_PACKAGE_ID, UNLOCK_PRICE_USD } from '@/lib/marketplace'
import { recordEventFromRequest } from '@/lib/analytics'

export const dynamic = 'force-dynamic'
export const maxDuration = 25

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CREEM_API_KEY = process.env.CREEM_API_KEY || ''
const CREEM_WEBHOOK_SECRET = process.env.CREEM_WEBHOOK_SECRET || ''
const UNLOCK1_PRODUCT_ID = process.env.CREEM_PRODUCT_ID_UNLOCK1 || ''
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'))
const IS_DEV = process.env.NODE_ENV === 'development'
const SKIP_PAYMENT = IS_DEV && process.env.DEV_SKIP_PAYMENT === 'true'

function getCreemApiBase(): string {
  return CREEM_API_KEY.startsWith('creem_test_') ? 'https://test-api.creem.io' : 'https://api.creem.io'
}

// POST { listingId, email? } —— JWT 或 guest email；返回 checkoutUrl 或直接已解锁
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const listingId = String(body.listingId || '').trim()
  if (!listingId) return NextResponse.json({ error: 'listingId required', code: 'INVALID_INPUT' }, { status: 400 })

  let email = ''
  const token = getBearerToken(req)
  if (token) {
    const payload = await verifySessionToken(token)
    if (!payload?.email) return NextResponse.json({ error: 'Invalid session', code: 'UNAUTHORIZED' }, { status: 401 })
    email = payload.email.toLowerCase().trim()
  } else {
    email = String(body.email || '').toLowerCase().trim()
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Valid email required', code: 'INVALID_EMAIL' }, { status: 400 })
  }

  const listing = await getListingById(listingId)
  if (!listing || listing.status !== 'active') return NextResponse.json({ error: 'Listing not available', code: 'NOT_AVAILABLE' }, { status: 404 })
  if (await isUnlocked(listingId, email)) return NextResponse.json({ ok: true, alreadyUnlocked: true })

  if (SKIP_PAYMENT) {
    // 本地联调：直接发放（与 checkout DEV 模式语义一致，仅限 development）
    const { recordUnlock } = await import('@/lib/marketplace-db')
    await recordUnlock(listingId, email)
    return NextResponse.json({ ok: true, devMode: true, unlocked: true })
  }

  if (!CREEM_API_KEY || !CREEM_WEBHOOK_SECRET || !UNLOCK1_PRODUCT_ID) {
    return NextResponse.json({ error: 'Payment service not configured', code: 'CREEM_CONFIG_ERROR' }, { status: 503 })
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  let creemRes: Response
  try {
    creemRes = await fetch(`${getCreemApiBase()}/v1/checkouts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': CREEM_API_KEY },
      body: JSON.stringify({
        product_id: UNLOCK1_PRODUCT_ID,
        success_url: `${APP_URL}/marketplace/${listingId}?paid=success&email=${encodeURIComponent(email)}`,
        customer: { email },
        metadata: { email, packageId: UNLOCK_PACKAGE_ID, type: 'unlock', listingId, amount: String(UNLOCK_PRICE_USD) },
      }),
      signal: controller.signal,
    })
  } catch (err) {
    console.error('[marketplace/unlock] Creem fetch error:', err)
    return NextResponse.json({ error: 'Payment service temporarily unavailable', code: 'CREEM_TIMEOUT' }, { status: 502 })
  } finally {
    clearTimeout(timer)
  }

  if (!creemRes.ok) {
    console.error('[marketplace/unlock] Creem checkout failed:', creemRes.status, await creemRes.text().catch(() => ''))
    return NextResponse.json({ error: 'Checkout failed', code: 'CREEM_CHECKOUT_FAILED' }, { status: 502 })
  }

  const session = await creemRes.json()
  const checkoutId = session.id || ''
  if (checkoutId) {
    await storePendingPurchase({ email, packageId: UNLOCK_PACKAGE_ID, credits: 0, amount: UNLOCK_PRICE_USD, checkoutId, createdAt: Date.now(), listingId })
    recordEventFromRequest(req, { event_type: 'checkout_start', email, metadata: { packageId: UNLOCK_PACKAGE_ID, listingId, amount: UNLOCK_PRICE_USD, checkoutId } }).catch(() => {})
  }
  return NextResponse.json({ ok: true, checkoutUrl: session.checkout_url })
}
