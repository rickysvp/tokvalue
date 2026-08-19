import { NextRequest, NextResponse } from 'next/server'
import { checkShareOwnership } from '@/lib/share-store'
import { verifySessionToken, getBearerToken } from '@/lib/auth'
import { completeTask } from '@/lib/growth-task-states'

export const dynamic = 'force-dynamic'

// POST /api/growth-tasks/[id]/complete?username=xxx — 标记任务完成（B6，Spec §9）
// id = task_key（路径参数）；Bearer 鉴权 + 付费所有权校验；幂等（重复完成也 200）。
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

    // Next.js 15：路由参数为 Promise
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'Task key is required' }, { status: 400 })
    }

    const username = req.nextUrl.searchParams.get('username')
    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 })
    }
    const normalized = username.trim().replace(/^@/, '').toLowerCase()

    // ── 2. 所有权校验：免费评估（未解锁 full）→ 402；无归属 → 404 ──
    const ownership = await checkShareOwnership(normalized, payload.email)
    if (ownership === 'forbidden') {
      return NextResponse.json({ error: 'Payment required' }, { status: 402 })
    }
    if (ownership === 'not_found') {
      return NextResponse.json({ error: 'Evaluation not found' }, { status: 404 })
    }

    // ── 3. 幂等完成（INSERT ON CONFLICT DO NOTHING）──
    await completeTask(payload.email, normalized, id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[growth-tasks] POST complete error:', err)
    return NextResponse.json({ error: 'Failed to complete task' }, { status: 500 })
  }
}
