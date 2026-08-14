import { NextRequest, NextResponse } from 'next/server'
import { saveReportRating, getReportRatingStats } from '@/lib/db'
import { hashIp } from '@/lib/analytics'

export const dynamic = 'force-dynamic'

/**
 * 报告满意度评分端点。
 * - POST：保存一条 1-5 星评分（同一 IP 对同一 username 去重）
 * - GET：返回满意度统计（平均分 + 总数）
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const username = String(body.username || '').trim()
    const rating = Number(body.rating)
    if (!username || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ ok: false, error: 'Invalid rating' }, { status: 400 })
    }

    // 同一 IP 对同一账号去重（防止刷分）
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'local'
    const ipHash = hashIp(ip)

    await saveReportRating(username, rating, ipHash)
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[rating] POST error:', err)
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const stats = await getReportRatingStats()
    return NextResponse.json(stats, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (err) {
    console.error('[rating] GET error:', err)
    return NextResponse.json({ average: 0, count: 0 }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  }
}
