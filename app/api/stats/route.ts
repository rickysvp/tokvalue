import { NextResponse } from 'next/server'
import { getPVUV } from '@/lib/analytics'
import { getEvaluationStats, getAudienceReach } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // 评估统计走 lib/db 统一管道（确保 evaluations 表已初始化）
    const { count: accountsEvaluated, totalValueAssessed } = await getEvaluationStats()

    // 覆盖维度（粉丝数 + 国家数）
    const reach = await getAudienceReach()

    // 独立访客数走 lib/analytics 统一管道（确保 analytics_events 表已初始化）
    let uniqueVisitors = 0
    try {
      const pvuv = await getPVUV()
      uniqueVisitors = pvuv.totalUV
    } catch (e) {
      console.error('[stats] analytics query failed:', e instanceof Error ? e.message : String(e))
    }

    return NextResponse.json(
      { accountsEvaluated, totalValueAssessed, uniqueVisitors, totalFollowers: reach.totalFollowers, countriesReached: reach.countriesReached },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (err) {
    console.error('[stats] error:', err)
    return NextResponse.json(
      { accountsEvaluated: 0, totalValueAssessed: 0, uniqueVisitors: 0, totalFollowers: 0, countriesReached: 0 },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  }
}
