import { NextRequest, NextResponse } from 'next/server'
import { getBearerToken, verifySessionToken } from '@/lib/auth'
import { getUnlocksByEmail } from '@/lib/marketplace-db'

export const dynamic = 'force-dynamic'

// GET /api/marketplace/my-unlocks —— JWT 鉴权，返回当前买家已解锁的联系方式
// （解锁是已购商品：listing 下架/售出后仍可见）
export async function GET(req: NextRequest) {
  const token = getBearerToken(req)
  if (!token) return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 })
  const payload = await verifySessionToken(token)
  if (!payload?.email) return NextResponse.json({ error: 'Invalid session', code: 'UNAUTHORIZED' }, { status: 401 })
  const items = await getUnlocksByEmail(payload.email.toLowerCase().trim())
  return NextResponse.json({ items })
}
