import { NextRequest, NextResponse } from 'next/server'
import { getPendingPurchase, claimPendingPurchase } from '@/lib/credits-server'
import { getBearerToken, verifySessionToken, createSessionToken } from '@/lib/auth'
import { getServerDict } from '@/lib/i18n/server'
import { recordEventFromRequest } from '@/lib/analytics'
import { checkIpRateLimit, ipBucketKey, rateLimitResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const CREEM_API_KEY = process.env.CREEM_API_KEY || ''

// 邮箱格式校验（与 checkout 路由保持一致）
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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

      // checkout.status 在支付完成前就会是 "completed"，不可信；
      // 唯一可信的支付凭证是 order.status === 'paid'（原 fallback 分支已删除）
      const orderStatus = data.order?.status || ''
      const checkoutStatus = data.status || ''

      if (orderStatus === 'paid') {
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
    const body = await req.json().catch(() => ({}))

    let email = ''
    let isGuest = false

    const token = getBearerToken(req)
    if (token) {
      // ── JWT 通道（老用户 / 已登录）：行为不变 ──
      const payload = await verifySessionToken(token)
      if (!payload) {
        return NextResponse.json({ error: getServerDict().api.balance.SESSION_EXPIRED, code: 'UNAUTHORIZED' }, { status: 401 })
      }
      email = payload.email.toLowerCase().trim()
    } else {
      // ── Guest 通道（Guest Checkout 回跳认领）──
      // 支付凭证 = (email + pending 记录存在 + Creem order 已支付)。
      // 威胁模型：冒用他人 email 的前提是受害者已支付且尚未认领——认领后 pending
      // 即被清除，可乘窗口极短；且 Creem 反查保证只发放真实已付款的订单。
      // IP 限流（10 次/小时）收敛爆破与探测面。
      isGuest = true

      const allowed = await checkIpRateLimit(ipBucketKey('claim', req), { limit: 10, windowHours: 1 })
      if (!allowed) {
        return rateLimitResponse('Too many claim attempts, please try again later')
      }

      email = String(body.email || '').toLowerCase().trim()
      if (!EMAIL_RE.test(email)) {
        return NextResponse.json({ error: 'Valid email required', code: 'INVALID_EMAIL' }, { status: 400 })
      }
    }

    // Step 1: Look up pending purchase
    const pending = await getPendingPurchase(email)
    if (!pending) {
      // 不区分"从未下单"与"已认领/已过期"，避免向探测方泄漏支付状态
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

    // Guest 通道：认领成功即签发会话 token，前端存储后转为登录态
    const sessionToken = isGuest ? await createSessionToken(email) : null

    // Track purchase event (metadata.checkout_id 与 webhook 一致)
    recordEventFromRequest(req, {
      event_type: 'purchase',
      email,
      metadata: { package_id: pending.packageId, credits: pending.credits, amount: pending.amount, checkout_id: pending.checkoutId, claimed_via: isGuest ? 'guest_success_page' : 'success_page' },
    }).catch(err => console.warn('[claim] analytics record failed:', err))

    return NextResponse.json({
      claimed: true,
      email: balance.email,
      credits: balance.credits,
      totalPurchased: balance.totalPurchased,
      // guest 认领成功后随响应下发会话 token（JWT 通道不需要）
      ...(sessionToken ? { token: sessionToken } : {}),
    })
  } catch (err) {
    console.error('[claim] CRASH:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: getServerDict().api.balance.BALANCE_ERROR, code: 'CLAIM_ERROR' }, { status: 500 })
  }
}
