import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth } from '@/lib/admin-auth'
import { getRecentEvents } from '@/lib/analytics'
import { getRecentApiCalls, getCostSummary } from '@/lib/api-governance'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const authError = await requireAdminAuth(req)
  if (authError) return authError

  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 200)
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0)

  // ── B2: ?source=api → RapidAPI 调用审计 + 成本汇总（单次 Review 成本可查）──
  if (url.searchParams.get('source') === 'api') {
    try {
      const [result, cost] = await Promise.all([getRecentApiCalls(limit, offset), getCostSummary()])
      return NextResponse.json({ items: result.items, total: result.total, cost })
    } catch (err) {
      console.error('[admin-logs] api source error:', err)
      return NextResponse.json({ items: [], total: 0, cost: null, error: '获取 API 日志失败' }, { status: 500 })
    }
  }

  try {
    // 走 lib/analytics 统一管道，确保 initDb() 已执行（表已创建）
    const { items, total } = await getRecentEvents(limit, offset)
    return NextResponse.json({ items, total })
  } catch (err) {
    console.error('[admin-logs] error:', err)
    return NextResponse.json({ items: [], total: 0, error: '获取日志失败' }, { status: 500 })
  }
}
