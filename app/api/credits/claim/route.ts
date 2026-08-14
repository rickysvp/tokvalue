import { NextRequest, NextResponse } from 'next/server'
import { getPendingPurchase, claimPendingPurchase } from '@/lib/credits-server'
import { getBearerToken, verifySessionToken } from '@/lib/auth'
import { getServerDict } from '@/lib/i18n/server'
import { recordEventFromRequest } from '@/lib/analytics'

export const dynamic = 'force-dynamic'

const CREEM_API_KEY = process.env.CREEM_API_KEY || ''

function getCreemApiBase(): string {
  if (CREEM_API_KEY.startsWith('creem_test_')) {
    return 'https://test-api.creem.io'
  }
  return 'https://api.creem.io'
}

async function verifyCreemCheckout(checkoutId: string): Promise<boolean> {
  if (!CREEM_API_KEY) {
    console.warn('[claim] No CREEM_API_KEY configured')
    return false
  }
  try {
    const apiBase = getCreemApiBase()
    const url = `${apiBase}/v1/checkouts?checkout_id=${encodeURIComponent(checkoutId)}`

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    try {
      const res = await fetch(url, {
        headers: { 'x-api-key': CREEM_API_KEY },
        signal: controller.signal,
      })
      if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        console.warn('[claim] Creem checkout lookup failed:', res.status, errBody)
        return false
      }
      const data = await res.json()

      // checkout.status is "completed" even before payment
      // real payment status is in order.status: "pending" → "paid"
      const orderStatus = data.order?.status || ''
      const checkoutStatus = data.status || ''

      if (orderStatus === 'paid') {
        return true
      }

      // Fallback: some one-time payments may not have order.status
      if (checkoutStatus === 'completed' && data.order && orderStatus !== 'pending') {
        return true
      }

      console.warn('[claim] Payment NOT verified:', { checkoutStatus, orderStatus })
      return false
    } finally {
      clearTimeout(timer)
    }
  } catch (err) {
    console.error('[claim] Creem verification error:', err instanceof Error ? err.message : String(err))
    return false
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req)
    if (!token) {
      return NextResponse.json({ error: getServerDict().api.balance.UNAUTHORIZED, code: 'UNAUTHORIZED' }, { status: 401 })
    }
    const payload = await verifySessionToken(token)
    if (!payload) {
      return NextResponse.json({ error: getServerDict().api.balance.SESSION_EXPIRED, code: 'UNAUTHORIZED' }, { status: 401 })
    }

    const email = payload.email.toLowerCase().trim()

    // Step 1: Look up pending purchase
    const pending = await getPendingPurchase(email)
    if (!pending) {
      return NextResponse.json({
        claimed: false,
        email,
        credits: 0,
        totalPurchased: 0,
      })
    }

    // Step 2: Verify payment with Creem before granting credits
    const isPaid = await verifyCreemCheckout(pending.checkoutId)
    if (!isPaid) {
      console.warn('[claim] Creem checkout not paid for', email, 'checkout:', pending.checkoutId)
      return NextResponse.json({
        claimed: false,
        email,
        credits: 0,
        totalPurchased: 0,
        reason: 'PAYMENT_NOT_COMPLETED',
      })
    }

    // Step 3: Grant credits (claimPendingPurchase 内部用 checkoutId 作为幂等键，
    // 与 webhook 路径一致，避免双发放)
    const balance = await claimPendingPurchase(email)
    if (!balance) {
      return NextResponse.json({
        claimed: false,
        email,
        credits: 0,
        totalPurchased: 0,
      })
    }

    // Track purchase event (metadata.checkout_id 与 webhook 一致)
    recordEventFromRequest(req, {
      event_type: 'purchase',
      email,
      metadata: { package_id: pending.packageId, credits: pending.credits, amount: pending.amount, checkout_id: pending.checkoutId, claimed_via: 'success_page' },
    }).catch(err => console.warn('[claim] analytics record failed:', err))

    return NextResponse.json({
      claimed: true,
      email: balance.email,
      credits: balance.credits,
      totalPurchased: balance.totalPurchased,
    })
  } catch (err) {
    console.error('[claim] CRASH:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: getServerDict().api.balance.BALANCE_ERROR, code: 'CLAIM_ERROR' }, { status: 500 })
  }
}
