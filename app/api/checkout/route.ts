import { NextRequest, NextResponse } from 'next/server'
import { recordEventFromRequest } from '@/lib/analytics'
import { verifySessionToken, getBearerToken } from '@/lib/auth'
import { storePendingPurchase } from '@/lib/credits-server'
import { findPackage } from '@/lib/credits'
import { getServerDict } from '@/lib/i18n/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 25

// 邮箱格式校验（与前端 PaidWall 保持一致）
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const CREEM_API_KEY = process.env.CREEM_API_KEY || ''
const CREEM_WEBHOOK_SECRET = process.env.CREEM_WEBHOOK_SECRET || ''
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'))

const IS_DEV = process.env.NODE_ENV === 'development'
const SKIP_PAYMENT = IS_DEV && process.env.DEV_SKIP_PAYMENT === 'true'

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
    const packageId = String(body.packageId || '').trim()
    // utm 归因：客户端从 sessionStorage 透传到 body，存 pending + Creem metadata，webhook 回读
    const utm = (body.utm && typeof body.utm === 'object') ? body.utm as Record<string, unknown> : undefined

    if (!packageId) {
      return NextResponse.json({ error: 'Package ID required', code: 'INVALID_PACKAGE' }, { status: 400 })
    }

    // ── 双通道身份解析（Guest Checkout）──
    // 1) JWT 通道：携带 Bearer token 的老用户，从 token 解出 email（行为不变）
    // 2) Guest 通道：无 token 时直接采信 body.email（仅格式校验），
    //    先支付、回跳后凭 pending 记录 + Creem 反查认领，移除付费前的验证码往返
    let email = ''
    const token = getBearerToken(req)
    if (token) {
      const payload = await verifySessionToken(token)
      if (!payload || !payload.email) {
        return NextResponse.json({ error: 'Invalid or expired session', code: 'UNAUTHORIZED' }, { status: 401 })
      }
      email = payload.email.toLowerCase().trim()
    } else {
      email = String(body.email || '').toLowerCase().trim()
      if (!EMAIL_RE.test(email)) {
        return NextResponse.json({ error: 'Valid email required', code: 'INVALID_EMAIL' }, { status: 400 })
      }
    }

    // Resolve package
    const pkg = findPackage(packageId)
    if (!pkg) {
      return NextResponse.json({ error: 'Invalid package', code: 'INVALID_PACKAGE' }, { status: 400 })
    }

    // ── Payment flow ──────────────────────────────────────────────────
    if (!SKIP_PAYMENT && (!CREEM_API_KEY || !CREEM_WEBHOOK_SECRET)) {
      console.error('[checkout] Creem not configured')
      return NextResponse.json({ error: 'Payment service not configured', code: 'CREEM_CONFIG_ERROR' }, { status: 503 })
    }

    if (!SKIP_PAYMENT) {
      const productId = PRODUCT_ID_MAP[packageId]
      if (!productId) {
        console.error('[checkout] No Creem product ID for package:', packageId)
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
              packageId,
              credits: String(pkg.credits),
              amount: String(pkg.price),
              ...(utm ? { utm: JSON.stringify(utm) } : {}),
            },
          }),
        })
      } catch (fetchErr) {
        console.error('[checkout] Creem fetch error:', fetchErr)
        return NextResponse.json({ error: 'Payment service temporarily unavailable', code: 'CREEM_TIMEOUT' }, { status: 502 })
      }

      if (!creemRes.ok) {
        const errBody = await creemRes.text().catch(() => '')
        console.error('[checkout] Creem checkout failed:', creemRes.status, errBody)
        return NextResponse.json({ error: getServerDict().api.creem.CHECKOUT_FAILED, code: 'CREEM_CHECKOUT_FAILED' }, { status: 502 })
      }

      const session = await creemRes.json()
      console.log('[checkout] Creem checkout created:', JSON.stringify({
        id: session.id,
        checkout_url: session.checkout_url ? '(present)' : '(missing)',
      }))

      const checkoutId = session.id || ''
      if (checkoutId) {
        await storePendingPurchase({
          email,
          packageId,
          credits: pkg.credits,
          amount: pkg.price,
          checkoutId,
          createdAt: Date.now(),
          ...(utm ? { utm } : {}),
        })
        console.log('[checkout] Pending purchase stored for:', email, 'checkoutId:', checkoutId)
        // 漏斗事件（结账发起，不算收入）
        recordEventFromRequest(req, {
          event_type: 'checkout_start',
          email,
          metadata: { packageId, credits: pkg.credits, amount: pkg.price, checkoutId, ...(utm ? { utm } : {}) },
        }).catch(err => console.warn('[checkout] recordEvent(checkout_start) failed:', err))
      }

      return NextResponse.json({
        ok: true,
        checkoutUrl: session.checkout_url,
      })
    }

    // DEV MODE: directly grant credits
    return NextResponse.json({
      ok: true,
      devMode: true,
      message: 'Dev mode — no checkout needed',
    })
  } catch (err) {
    console.error('[checkout] CRASH:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Checkout failed', code: 'CHECKOUT_ERROR' }, { status: 500 })
  }
}
