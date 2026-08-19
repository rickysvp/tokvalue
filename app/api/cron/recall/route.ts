// app/api/cron/recall/route.ts
// Day-10 召回 cron 入口（vercel.json 由主控集成阶段统一配置）。
// 鉴权：Authorization header 必须等于 `Bearer ${CRON_SECRET}`；
// CRON_SECRET 未配置时放行并 console.warn（dev 手动触发友好）。

import { NextResponse } from 'next/server'
import { runRecall } from '@/lib/recall'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.warn('[cron/recall] CRON_SECRET not set — allowing unauthenticated request (dev mode)')
  } else if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runRecall()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[cron/recall] failed:', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
