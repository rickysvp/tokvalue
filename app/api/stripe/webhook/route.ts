import { NextRequest, NextResponse } from 'next/server'
import { grantCredits } from '@/lib/credits-server'
import { adminDeductCredits } from '@/lib/admin-credits'
import { findPackage, CREDIT_PACKAGES } from '@/lib/credits'
import { getServerDict } from '@/lib/i18n/server'
import { recordRefund } from '@/lib/analytics'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

const CREEM_API_KEY = process.env.CREEM_API_KEY || ''
const CREEM_WEBHOOK_SECRET = process.env.CREEM_WEBHOOK_SECRET || ''

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

interface CreemCheckoutInfo {
  checkoutStatus: string
  orderStatus: string
  orderAmount: number // Creem 金额为最小货币单位（分），如 9900 = $99.00
  currency: string
  productId: string
}

// 反查 Creem 订单（与 app/api/credits/claim 的 verifyCreemCheckout 同一端点/逻辑）。
// webhook 发放积分前必须以此为准，绝不信任 event.object.metadata。
async function fetchCreemCheckout(checkoutId: string): Promise<CreemCheckoutInfo | null> {
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
        console.warn('[creem-webhook] Creem checkout lookup failed:', res.status, errBody)
        return null
      }
      const data = await res.json()

      const order = (data.order || {}) as Record<string, unknown>
      let productId = ''
      const product = data.product
      if (typeof product === 'string') {
        productId = product
      } else if (product && typeof product === 'object') {
        productId = String((product as Record<string, unknown>).id || '')
      }

      return {
        checkoutStatus: String(data.status || ''),
        orderStatus: String(order.status || ''),
        orderAmount: Number(order.amount || 0),
        currency: String(order.currency || ''),
        productId,
      }
    } finally {
      clearTimeout(timer)
    }
  } catch (err) {
    console.error('[creem-webhook] Creem checkout lookup error:', err instanceof Error ? err.message : String(err))
    return null
  }
}

function verifyCreemSignature(payload: string, signature: string): boolean {
  if (!CREEM_WEBHOOK_SECRET) return false
  try {
    const computed = crypto.createHmac('sha256', CREEM_WEBHOOK_SECRET).update(payload).digest('hex')
    // timingSafeEqual crashes if buffers have different lengths — guard first
    if (computed.length !== signature.length) return false
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature))
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!CREEM_API_KEY || !CREEM_WEBHOOK_SECRET) {
      console.warn('[creem-webhook] missing API key or webhook secret')
      return NextResponse.json({ error: getServerDict().api.creem.NOT_CONFIGURED }, { status: 503 })
    }

    const payload = await req.text()
    const sig = req.headers.get('creem-signature') || ''

    if (!sig || !verifyCreemSignature(payload, sig)) {
      console.warn('[creem-webhook] signature verification failed')
      return NextResponse.json({ error: getServerDict().api.creem.SIGNATURE_FAILED }, { status: 400 })
    }

    let event: { id: string; eventType: string; object: Record<string, unknown> }
    try {
      event = JSON.parse(payload)
    } catch {
      console.error('[creem-webhook] invalid JSON payload')
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }

    // Handle checkout.completed — grant credits to purchaser
    if (event.eventType === 'checkout.completed') {
      const obj = event.object as Record<string, unknown>
      const metadata = (obj.metadata || {}) as Record<string, string>
      const email = metadata.email || ''
      const packageId = metadata.packageId || ''

      if (!email || !packageId) {
        console.warn('[creem-webhook] missing metadata fields:', { hasEmail: !!email, hasPackageId: !!packageId })
        return NextResponse.json({ received: true })
      }

      // 发放数额只信服务端包定义，绝不采信 metadata.credits / metadata.amount
      const pkg = findPackage(packageId)
      if (!pkg) {
        console.warn('[creem-webhook] unknown packageId in metadata:', packageId)
        return NextResponse.json({ received: true })
      }

      // 幂等键统一用 checkout_id（obj.id），与 claim 路径一致，避免 webhook+claim 双发放
      const checkoutId = (obj.id as string) || event.id

      // 反查 Creem：真实支付状态与金额以 Creem API 返回为准
      const info = await fetchCreemCheckout(checkoutId)
      if (!info) {
        // 反查失败（网络/Creem API 异常）：返回 500 触发 Creem 重试，绝不盲发
        console.error('[creem-webhook] checkout lookup failed, refusing to grant credits. checkout:', checkoutId)
        return NextResponse.json({ error: 'Checkout verification unavailable' }, { status: 500 })
      }

      // 只认 order.status === 'paid'（checkout.status 在支付前也会是 completed）
      if (info.orderStatus !== 'paid') {
        console.warn('[creem-webhook] order not paid, refusing.', { checkout: checkoutId, orderStatus: info.orderStatus, checkoutStatus: info.checkoutStatus })
        return NextResponse.json({ received: true })
      }

      // 金额校验：Creem 金额为最小货币单位（分），实付必须 >= 包价（USD * 100）
      if (info.currency !== 'USD' || info.orderAmount < Math.round(pkg.price * 100)) {
        console.warn('[creem-webhook] paid amount below package price, refusing.', { checkout: checkoutId, orderAmount: info.orderAmount, currency: info.currency, expectedCents: Math.round(pkg.price * 100) })
        return NextResponse.json({ received: true })
      }

      // 商品校验：实付 product 必须与该包配置的 Creem product id 一致（未配置则跳过）
      const expectedProductId = PRODUCT_ID_MAP[packageId]
      if (expectedProductId && info.productId && info.productId !== expectedProductId) {
        console.warn('[creem-webhook] product mismatch, refusing.', { checkout: checkoutId, productId: info.productId, expectedProductId })
        return NextResponse.json({ received: true })
      }

      try {
        const paidAmountUsd = info.orderAmount / 100
        await grantCredits(email.toLowerCase(), packageId, pkg.credits, paidAmountUsd, checkoutId)
        console.log('[creem-webhook] credits granted for', email, 'checkout:', checkoutId)
        // 收款事件已停写（收款统计整体下线，以 Creem 账单为准；此前的 purchase 事件已不再作为收入口径）
      } catch (err) {
        console.error('[creem-webhook] failed to grant credits:', err)
        return NextResponse.json({ error: getServerDict().api.creem.FAILED_GRANT }, { status: 500 })
      }
    } else if (event.eventType === 'refund.created') {
      // 退款：按实退金额扣回积分（adminDeductCredits 原子扣减，只扣到 0 不会为负）
      const obj = event.object as Record<string, unknown>
      const customer = (obj.customer || {}) as Record<string, unknown>
      const email = String(customer.email || '').toLowerCase().trim()
      const refundId = String(obj.id || event.id)
      const refundStatus = String(obj.status || '')
      const refundAmount = Number(obj.refund_amount || 0)
      const refundCurrency = String(obj.refund_currency || '')

      if (!email) {
        console.warn('[creem-webhook] refund event without customer email, skipping. refund:', refundId)
        return NextResponse.json({ received: true })
      }
      if (refundStatus && refundStatus !== 'succeeded') {
        console.log('[creem-webhook] refund not succeeded yet, skipping. refund:', refundId, 'status:', refundStatus)
        return NextResponse.json({ received: true })
      }

      // 退款金额→积分：全额退款应精确匹配包价（分）；
      // 部分退款按最高单价包保守折算（只少扣不多扣），折算不出则转人工
      const exactMatch = CREDIT_PACKAGES.find(p => Math.round(p.price * 100) === refundAmount)
      const highestPricePkg = CREDIT_PACKAGES.reduce((a, b) => (b.price > a.price ? b : a))
      const creditsToDeduct = exactMatch
        ? exactMatch.credits
        : Math.floor((refundAmount / 100 / highestPricePkg.price) * highestPricePkg.credits)

      if (refundCurrency !== 'USD' || !Number.isFinite(refundAmount) || refundAmount <= 0 || creditsToDeduct <= 0) {
        console.warn('[creem-webhook] refund amount not mappable to credits, manual review needed.', { refund: refundId, email, refundAmount, refundCurrency, creditsToDeduct })
        return NextResponse.json({ received: true })
      }

      try {
        // 幂等：先写结构化退款事件（refund_id 唯一索引），首次才执行扣积分，防 webhook 重试重复扣
        const isFirst = await recordRefund({ refundId, email, creditsDeducted: creditsToDeduct })
        if (!isFirst) {
          console.log('[creem-webhook] refund already recorded, skipping deduction. refund:', refundId)
          return NextResponse.json({ received: true })
        }
        await adminDeductCredits(email, creditsToDeduct, `system:refund refund:${refundId} amount:${refundAmount}`)
        console.log('[creem-webhook] refund processed, deducted', creditsToDeduct, 'credits from', email, 'refund:', refundId)
      } catch (err) {
        console.error('[creem-webhook] refund credit deduction failed:', err)
        return NextResponse.json({ error: 'Refund processing failed' }, { status: 500 })
      }
    } else {
      console.log('[creem-webhook] unhandled event type:', event.eventType)
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('[creem-webhook] CRASH:', err instanceof Error ? err.message : String(err), err instanceof Error ? err.stack : '')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
