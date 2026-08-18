import { NextRequest, NextResponse } from 'next/server'
import {
  getStatsOverview,
  getPVUV,
  getUsersList,
  getTrafficSources,
  getPvuvByDay,
  getConversionByDay,
  getRefundsByDay,
  getFunnel,
  getUtmAttribution,
} from '@/lib/analytics'
import { getEvaluationsByDay } from '@/lib/db'
import { requireAdminAuth } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const authError = await requireAdminAuth(req)
  if (authError) return authError
  const url = new URL(req.url)
  const period = url.searchParams.get('period') || '30d'
  // 支持 7/14/30/90 天窗口；兼容旧参数 today（1 天）
  const days = period === 'today' ? 1
    : period === '7d' ? 7
    : period === '14d' ? 14
    : period === '90d' ? 90
    : 30

  const noStore = { 'Cache-Control': 'no-store, max-age=0' }

  try {
    const [overview, pvuv, users, sources, evaluationsByDay, pvuvByDay, conversionByDay, refundsByDay, funnel, utmAttribution] = await Promise.all([
      getStatsOverview(),
      getPVUV(),
      getUsersList(),
      getTrafficSources(days),
      getEvaluationsByDay(days),
      getPvuvByDay(days),
      getConversionByDay(days),
      getRefundsByDay(days),
      getFunnel(days),
      getUtmAttribution(days),
    ])

    return NextResponse.json({
      overview,
      pvuv,
      users,
      sources,
      funnel,
      utmAttribution,
      // 趋势时序数据（按所选周期 days 填充连续日期）
      trends: {
        evaluationsByDay,
        pvuvByDay,
        conversionByDay,
        refundsByDay,
      },
    }, { headers: noStore })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[stats] error:', msg, err)
    return NextResponse.json({ error: 'Failed to fetch stats', detail: msg }, { status: 500, headers: noStore })
  }
}
