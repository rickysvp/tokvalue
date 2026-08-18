import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken, getBearerToken } from '@/lib/auth'
import {
  getWithdrawableBalance,
  requestWithdrawal,
  listPayouts,
  USDC_ADDRESS_RE,
} from '@/lib/referral'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }

async function authEmail(req: NextRequest): Promise<string | NextResponse> {
  const token = getBearerToken(req)
  if (!token) {
    return NextResponse.json(
      { error: 'Authentication required', code: 'UNAUTHORIZED' },
      { status: 401, headers: NO_STORE }
    )
  }
  const payload = await verifySessionToken(token)
  if (!payload || !payload.email) {
    return NextResponse.json(
      { error: 'Invalid or expired token', code: 'UNAUTHORIZED' },
      { status: 401, headers: NO_STORE }
    )
  }
  return payload.email
}

/** GET /api/referral/withdraw — 可提现余额 + 提现历史 */
export async function GET(req: NextRequest) {
  const email = await authEmail(req)
  if (typeof email !== 'string') return email

  try {
    const [balance, payouts] = await Promise.all([
      getWithdrawableBalance(email),
      listPayouts(email),
    ])
    return NextResponse.json(
      { ...balance, payouts, email },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
    )
  } catch (err) {
    console.error('[referral/withdraw] error:', err)
    return NextResponse.json(
      { error: 'Failed to load withdrawal data', code: 'WITHDRAW_ERROR' },
      { status: 500, headers: NO_STORE }
    )
  }
}

/** POST /api/referral/withdraw — 发起 USDC 提现请求 */
export async function POST(req: NextRequest) {
  const email = await authEmail(req)
  if (typeof email !== 'string') return email

  try {
    const body = await req.json().catch(() => ({}))
    const amount = Number(body.amount)
    const address = String(body.address || '').trim()

    if (!USDC_ADDRESS_RE.test(address)) {
      return NextResponse.json(
        { error: 'Invalid USDC address', code: 'INVALID_ADDRESS' },
        { status: 400, headers: NO_STORE }
      )
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount', code: 'INVALID_AMOUNT' },
        { status: 400, headers: NO_STORE }
      )
    }

    const result = await requestWithdrawal(email, amount, address)
    if (!result.ok) {
      const status = result.code === 'INVALID_ADDRESS' ? 400 : 400
      const message =
        result.code === 'BELOW_MIN' ? 'Amount below minimum withdrawal' :
        result.code === 'INSUFFICIENT_BALANCE' ? 'Insufficient withdrawable balance' :
        result.code === 'INVALID_ADDRESS' ? 'Invalid USDC address' : 'Withdrawal failed'
      return NextResponse.json(
        { error: message, code: result.code },
        { status, headers: NO_STORE }
      )
    }

    return NextResponse.json(
      { success: true, payout: result.payout },
      { headers: NO_STORE }
    )
  } catch (err) {
    console.error('[referral/withdraw] error:', err)
    return NextResponse.json(
      { error: 'Withdrawal failed', code: 'WITHDRAW_ERROR' },
      { status: 500, headers: NO_STORE }
    )
  }
}
