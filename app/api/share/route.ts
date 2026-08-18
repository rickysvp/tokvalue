import { NextRequest, NextResponse } from 'next/server'
import { createShare, getShare, checkShareRateLimit, checkShareOwnership } from '@/lib/share-store'
import { findEvaluation } from '@/lib/db'
import { verifySessionToken, getBearerToken } from '@/lib/auth'
import { recordEventFromRequest } from '@/lib/analytics'

export const dynamic = 'force-dynamic'

// POST /api/share — create a share link for an evaluation
// 鉴权 + 所有权校验 + 限流，防止对任意已评估账号批量创建分享链接（付费墙后门）
export async function POST(req: NextRequest) {
  try {
    // ── 1. 鉴权：必须携带有效 Bearer session token ──
    const token = getBearerToken(req)
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    const payload = await verifySessionToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const { username } = body

    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 })
    }

    const normalized = String(username).trim().replace(/^@/, '').toLowerCase()

    // ── 2. 限流：per-email 每日 ≤10 次（尝试即计数，防批量枚举）──
    const allowed = await checkShareRateLimit(payload.email)
    if (!allowed) {
      return NextResponse.json({ error: 'Daily share limit reached. Try again tomorrow.' }, { status: 429 })
    }

    const evaluation = await findEvaluation(normalized)

    if (!evaluation) {
      return NextResponse.json({ error: 'Evaluation not found' }, { status: 404 })
    }

    // ── 3. 所有权校验：该账号必须是当前邮箱用户付费评估过的（免费评估不可分享）──
    const ownership = await checkShareOwnership(normalized, payload.email)
    if (ownership === 'forbidden') {
      return NextResponse.json({ error: 'You can only share paid evaluations you purchased' }, { status: 403 })
    }
    if (ownership === 'not_found') {
      return NextResponse.json({ error: 'Evaluation not found' }, { status: 404 })
    }

    const shareId = await createShare(evaluation)
    const shareUrl = `${req.nextUrl.protocol}//${req.nextUrl.host}/share/${shareId}`

    // 漏斗/传播事件：分享创建（测病毒系数 K 因子的分母）
    recordEventFromRequest(req, {
      event_type: 'share_create',
      email: payload.email,
      username: normalized,
      metadata: { shareId },
    }).catch(err => console.warn('[share] recordEvent(share_create) failed:', err))

    return NextResponse.json({ shareId, shareUrl })
  } catch (err) {
    console.error('[share] POST error:', err)
    return NextResponse.json({ error: 'Failed to create share link' }, { status: 500 })
  }
}

// GET /api/share?id=xxx — get a shared evaluation by ID
// 只返回白名单裁剪后的分享快照（不含付费模块数据），过期返回 410
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Share ID is required' }, { status: 400 })
    }

    const result = await getShare(id)
    if (!result) {
      return NextResponse.json({ error: 'Share not found or expired' }, { status: 404 })
    }

    if (result.expired) {
      return NextResponse.json({ error: 'Share link has expired' }, { status: 410 })
    }

    return NextResponse.json(result.evaluation)
  } catch (err) {
    console.error('[share] GET error:', err)
    return NextResponse.json({ error: 'Failed to get share' }, { status: 500 })
  }
}
