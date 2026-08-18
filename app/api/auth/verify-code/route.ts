import { NextRequest, NextResponse } from 'next/server'
import { grantCredits, storePendingPurchase } from '@/lib/credits-server'
import { verifyCode, createSessionToken } from '@/lib/auth'
import { recordEventFromRequest } from '@/lib/analytics'
import { getServerDict, t as serverT } from '@/lib/i18n/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 25 // Vercel Pro: extend to 25s

const CREEM_API_KEY = process.env.CREEM_API_KEY || ''
const CREEM_WEBHOOK_SECRET = process.env.CREEM_WEBHOOK_SECRET || ''
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'))
// DEV_SKIP_PAYMENT 仅在本地开发环境生效，生产环境（Vercel）永远走支付流程
// 注意：使用 DEV_SKIP_PAYMENT（非 NEXT_PUBLIC_）避免暴露给客户端
const IS_DEV = process.env.NODE_ENV === 'development'
const SKIP_PAYMENT = IS_DEV && process.env.DEV_SKIP_PAYMENT === 'true'

// Creem product ID mapping: packageId → product_id
const PRODUCT_ID_MAP: Record<string, string> = {
  pack1: process.env.CREEM_PRODUCT_ID_PACK1 || '',
  pack6: process.env.CREEM_PRODUCT_ID_PACK6 || '',
  pack30: process.env.CREEM_PRODUCT_ID_PACK30 || '',
}

function getCreemApiBase(): string {
  if (CREEM_API_KEY.startsWith('creem_test_')) {
    return 'https://test-api.creem.io'
  }
  return 'https://api.creem.io'
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const email = String(body.email || '').trim().toLowerCase()
    const code = String(body.code || '').trim()
    // utm 归因：客户端透传，写入 pending + Creem metadata + checkout_start
    const utm = (body.utm && typeof body.utm === 'object') ? body.utm as Record<string, unknown> : undefined

    if (!email) return NextResponse.json({ error: getServerDict().api.auth.NO_EMAIL, code: 'INVALID_EMAIL' }, { status: 400 })
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: getServerDict().api.auth.INVALID_CODE, code: 'INVALID_CODE' }, { status: 400 })
    }

    // Create session token first — if JWT_SECRET is misconfigured, fail before consuming the code
    let token: string
    try {
      token = await createSessionToken(email)
    } catch (tokenErr) {
      console.error('[verify-code] createSessionToken FAILED:', tokenErr instanceof Error ? tokenErr.message : String(tokenErr))
      return NextResponse.json({
        error: 'Session token creation failed. Please contact support.',
        code: 'TOKEN_ERROR',
        detail: tokenErr instanceof Error ? tokenErr.message : String(tokenErr),
      }, { status: 500 })
    }

    const result = await verifyCode(email, code)
    console.log('[verify-code] verifyCode result:', JSON.stringify({ email, ok: result.ok, reason: result.ok ? 'ok' : result.reason }))
    if (!result.ok) {
      const messages: Record<string, { msg: string; status: number }> = {
        expired:    { msg: getServerDict().api.auth.VERIFY_EXPIRED, status: 410 },
        wrong:      { msg: getServerDict().api.auth.VERIFY_WRONG, status: 401 },
        not_found:  { msg: getServerDict().api.auth.VERIFY_NOT_FOUND, status: 404 },
        too_many:   { msg: getServerDict().api.auth.VERIFY_TOO_MANY, status: 429 },
      }
      const err = messages[result.reason] || { msg: getServerDict().api.auth.VERIFY_FAILED, status: 400 }
      return NextResponse.json({ error: err.msg, code: 'VERIFY_FAILED', reason: result.reason }, { status: err.status })
    }

    const { entry } = result

    // ── Returning user flow (no purchase) ────────────────────────────
    // credits === 0 means this was a "Verify Existing Email" request, not a purchase
    if (entry.credits === 0) {
      return NextResponse.json({
        ok: true,
        email,
        returning: true,
        token,
      })
    }

    // ── Payment flow ──────────────────────────────────────────────────
    // 生产环境必须有 Creem 配置；本地开发可选跳过
    if (!SKIP_PAYMENT && (!CREEM_API_KEY || !CREEM_WEBHOOK_SECRET)) {
      console.error('[verify-code] Creem not configured — CREEM_API_KEY or CREEM_WEBHOOK_SECRET is empty')
      return NextResponse.json({ error: 'Payment service not configured. Please contact support.', code: 'CREEM_CONFIG_ERROR' }, { status: 503 })
    }

    if (!SKIP_PAYMENT) {
      const productId = PRODUCT_ID_MAP[entry.packageId]
      if (!productId) {
        console.error(`[verify-code] No Creem product ID for package: ${entry.packageId}`)
        return NextResponse.json({ error: getServerDict().api.creem.NOT_CONFIGURED, code: 'CREEM_CONFIG_ERROR' }, { status: 503 })
      }

      const apiBase = getCreemApiBase()
      let creemRes: Response
      try {
        creemRes = await fetchWithTimeout(`${apiBase}/v1/checkouts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': CREEM_API_KEY,
          },
          body: JSON.stringify({
            product_id: productId,
            success_url: `${APP_URL}/?paid=success&email=${encodeURIComponent(email)}`,
            customer: { email },
            metadata: {
              email,
              packageId: entry.packageId,
              credits: String(entry.credits),
              amount: String(entry.amount),
              ...(utm ? { utm: JSON.stringify(utm) } : {}),
            },
          }),
        })
      } catch (fetchErr) {
        console.error('[verify-code] Creem fetch error:', fetchErr)
        return NextResponse.json({ error: 'Payment service temporarily unavailable. Please try again.', code: 'CREEM_TIMEOUT' }, { status: 502 })
      }

      if (!creemRes.ok) {
        const errBody = await creemRes.text().catch(() => '')
        console.error('[verify-code] Creem checkout failed:', creemRes.status, errBody)
        return NextResponse.json({ error: getServerDict().api.creem.CHECKOUT_FAILED, code: 'CREEM_CHECKOUT_FAILED' }, { status: 502 })
      }

      const session = await creemRes.json()
      console.log('[verify-code] Creem checkout created:', JSON.stringify({
        id: session.id,
        checkout_url: session.checkout_url ? '(present)' : '(missing)',
        status: session.status,
        orderStatus: session.order?.status,
      }))
      const checkoutId = session.id || ''
      // Store pending purchase so success page can claim credits without webhook
      if (checkoutId) {
        await storePendingPurchase({
          email,
          packageId: entry.packageId,
          credits: entry.credits,
          amount: entry.amount,
          checkoutId,
          createdAt: Date.now(),
          ...(utm ? { utm } : {}),
        })
        console.log('[verify-code] Pending purchase stored for:', email, 'checkoutId:', checkoutId)
        // 漏斗事件（结账发起，不算收入）
        recordEventFromRequest(req, {
          event_type: 'checkout_start',
          email,
          metadata: { packageId: entry.packageId, credits: entry.credits, amount: entry.amount, checkoutId, ...(utm ? { utm } : {}) },
        }).catch(err => console.warn('[verify-code] recordEvent(checkout_start) failed:', err))
      } else {
        console.error('[verify-code] No checkout ID in Creem response!', JSON.stringify(session).slice(0, 200))
      }
      return NextResponse.json({
        ok: true,
        requiresPayment: true,
        checkoutUrl: session.checkout_url,
        token,
      })
    }

    // DEV MODE / Creem 未配置: 直接发放额度
    const balance = await grantCredits(email, entry.packageId, entry.credits, entry.amount)
    return NextResponse.json({
      ok: true,
      email,
      granted: entry.credits,
      packageId: entry.packageId,
      balance: balance.balance.credits,
      token,
      message: serverT(getServerDict().api.auth.VERIFY_SUCCESS, { count: entry.credits }),
    })
  } catch (err) {
    console.error('[verify-code] CRASH:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: getServerDict().api.auth.VERIFY_ERROR, code: 'VERIFY_ERROR' }, { status: 500 })
  }
}