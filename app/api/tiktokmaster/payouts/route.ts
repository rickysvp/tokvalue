import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth } from '@/lib/admin-auth'
import {
  listPayoutsAdmin,
  markPayoutPaid,
  markPayoutRejected,
  type PayoutStatus,
} from '@/lib/referral'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }

const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/

/** GET /api/tiktokmaster/payouts — 提现列表（可按状态过滤） */
export async function GET(req: NextRequest) {
  const authError = await requireAdminAuth(req)
  if (authError) return authError

  const url = new URL(req.url)
  const statusParam = url.searchParams.get('status')
  const status: PayoutStatus | undefined =
    statusParam === 'requested' || statusParam === 'processing' ||
    statusParam === 'paid' || statusParam === 'rejected'
      ? statusParam
      : undefined

  try {
    const payouts = await listPayoutsAdmin(status)
    return NextResponse.json({ payouts }, { headers: NO_STORE })
  } catch (err) {
    console.error('[admin-payouts] error:', err)
    return NextResponse.json({ error: 'Failed to fetch payouts' }, { status: 500, headers: NO_STORE })
  }
}

/** POST /api/tiktokmaster/payouts — 审核提现（paid / rejected） */
export async function POST(req: NextRequest) {
  const authError = await requireAdminAuth(req)
  if (authError) return authError

  try {
    const body = await req.json().catch(() => ({}))
    const { action, id, txHash, reason } = body as {
      action: 'paid' | 'rejected'
      id: number
      txHash?: string
      reason?: string
    }

    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid payout id' }, { status: 400, headers: NO_STORE })
    }

    if (action === 'paid') {
      const hash = String(txHash || '').trim()
      if (!TX_HASH_RE.test(hash)) {
        return NextResponse.json(
          { error: 'Invalid transaction hash (0x + 64 hex)' },
          { status: 400, headers: NO_STORE }
        )
      }
      const ok = await markPayoutPaid(id, hash)
      if (!ok) {
        return NextResponse.json(
          { error: 'Payout not found or already processed' },
          { status: 409, headers: NO_STORE }
        )
      }
      return NextResponse.json({ success: true }, { headers: NO_STORE })
    }

    if (action === 'rejected') {
      const r = String(reason || '').trim()
      if (!r || r.length > 500) {
        return NextResponse.json(
          { error: 'Reject reason is required (max 500 chars)' },
          { status: 400, headers: NO_STORE }
        )
      }
      const ok = await markPayoutRejected(id, r)
      if (!ok) {
        return NextResponse.json(
          { error: 'Payout not found or already processed' },
          { status: 409, headers: NO_STORE }
        )
      }
      return NextResponse.json({ success: true }, { headers: NO_STORE })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400, headers: NO_STORE })
  } catch (err) {
    console.error('[admin-payouts] error:', err)
    return NextResponse.json({ error: 'Failed to process payout' }, { status: 500, headers: NO_STORE })
  }
}
