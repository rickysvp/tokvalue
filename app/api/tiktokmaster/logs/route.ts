import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth } from '@/lib/admin-auth'
import { getRecentEvents } from '@/lib/analytics'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const authError = await requireAdminAuth(req)
  if (authError) return authError

  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 200)
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0)

  try {
    // 走 lib/analytics 统一管道，确保 initDb() 已执行（表已创建）
    const { items, total } = await getRecentEvents(limit, offset)
    return NextResponse.json({ items, total })
  } catch (err) {
    console.error('[admin-logs] error:', err)
    return NextResponse.json({ items: [], total: 0, error: '获取日志失败' }, { status: 500 })
  }
}
