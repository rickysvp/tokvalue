import { NextRequest, NextResponse } from 'next/server'
import { checkShareOwnership } from '@/lib/share-store'
import { findEvaluation } from '@/lib/db'
import { verifySessionToken, getBearerToken } from '@/lib/auth'
import { buildGrowthTasks } from '@/lib/growth-tasks'
import { listCompleted } from '@/lib/growth-task-states'

export const dynamic = 'force-dynamic'

// GET /api/growth-plan?username=xxx — B6 Growth Plan（Spec §9）
// Bearer 鉴权 + 付费所有权（evaluation_ownership is_free=false，模式同 checkShareOwnership）
// → 规则模板任务 + 完成状态。未解锁付 full → 402（付费墙语义）。
export async function GET(req: NextRequest) {
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

    const username = req.nextUrl.searchParams.get('username')
    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 })
    }
    const normalized = username.trim().replace(/^@/, '').toLowerCase()

    // ── 2. 所有权校验：免费评估（未解锁 full）→ 402 引导付费；无归属 → 404 ──
    const ownership = await checkShareOwnership(normalized, payload.email)
    if (ownership === 'forbidden') {
      return NextResponse.json({ error: 'Payment required' }, { status: 402 })
    }
    if (ownership === 'not_found') {
      return NextResponse.json({ error: 'Evaluation not found' }, { status: 404 })
    }

    const evaluation = await findEvaluation(normalized)
    if (!evaluation) {
      return NextResponse.json({ error: 'Evaluation not found' }, { status: 404 })
    }

    // ── 3. 规则模板任务（零 LLM）+ 该用户该账号的完成状态 ──
    const { tasks, limitedData } = buildGrowthTasks({ evaluation })
    const completedKeys = await listCompleted(payload.email, normalized)

    return NextResponse.json(
      { tasks, completedKeys, limitedData },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    )
  } catch (err) {
    console.error('[growth-plan] GET error:', err)
    return NextResponse.json({ error: 'Failed to load growth plan' }, { status: 500 })
  }
}
