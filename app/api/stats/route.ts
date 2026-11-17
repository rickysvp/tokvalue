import { NextResponse } from 'next/server'
import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

export const dynamic = 'force-dynamic'

interface StatsPayload {
  accountsEvaluated: number
  totalValueAssessed: number
  uniqueVisitors: number
  totalFollowers: number
  countriesReached: number
}

const DATABASE_URL = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').replace(/\s+/g, '')
const TTL_MS = 60_000
const ATTEMPT_TIMEOUT_MS = 7_000
const ATTEMPTS = 2

// 首页社会证明：成功后缓存 60s；查询失败/超时返回上一次成功值（stale），绝不返回编造的 0。
let cached: { at: number; data: StatsPayload } | null = null
let sql: NeonQueryFunction<false, false> | null = null

function db() {
  if (!sql) sql = neon(DATABASE_URL)
  return sql
}

// 只读聚合：一条查询拿齐五个数字。
// 这里刻意不走 lib/db 的 initStore——它为了建表/迁移要跑 30 条 DDL，
// 在跨境链路上单次往返就要 1-3s，首页统计会被拖到十几秒并超时。
// evaluations / analytics_events 两张表在正常部署里已存在，统计不需要 bootstrap。
async function loadStats(): Promise<StatsPayload> {
  const rows = (await db()`
    SELECT
      (SELECT COUNT(*) FROM evaluations) AS accounts,
      (SELECT COALESCE(SUM((business_value->'totalValue'->>'mid')::numeric), 0) FROM evaluations) AS value,
      (SELECT COALESCE(SUM(follower_count), 0) FROM evaluations) AS followers,
      (SELECT COUNT(DISTINCT UPPER(TRIM(region))) FROM evaluations WHERE region IS NOT NULL AND TRIM(region) <> '') AS countries,
      (SELECT COUNT(DISTINCT COALESCE(NULLIF(ip_hash, ''), session_id)) FROM analytics_events WHERE event_type = 'page_view') AS uv
  `) as Array<Record<string, string | number>>
  const r = rows[0] || {}
  return {
    accountsEvaluated: Number(r.accounts || 0),
    totalValueAssessed: Math.round(Number(r.value || 0)),
    uniqueVisitors: Number(r.uv || 0),
    totalFollowers: Number(r.followers || 0),
    countriesReached: Number(r.countries || 0),
  }
}

function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)
  })
  return Promise.race([work, timeout]).finally(() => { if (timer) clearTimeout(timer) }) as Promise<T>
}

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }

function respond(data: StatsPayload, source: 'fresh' | 'cache' | 'stale') {
  return NextResponse.json(data, { headers: { ...NO_STORE, 'X-Stats-Source': source } })
}

export async function GET() {
  if (cached && Date.now() - cached.at < TTL_MS) return respond(cached.data, 'cache')

  let lastErr: unknown = null
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const data = await withTimeout(loadStats(), ATTEMPT_TIMEOUT_MS, `[stats] attempt ${attempt}`)
      cached = { at: Date.now(), data }
      return respond(data, 'fresh')
    } catch (err) {
      lastErr = err
      console.error('[stats] query failed:', err instanceof Error ? err.message : err)
    }
  }

  if (cached) return respond(cached.data, 'stale')
  console.error('[stats] no cached value available; last error:', lastErr instanceof Error ? lastErr.message : lastErr)
  return NextResponse.json({ error: 'stats_unavailable' }, { status: 503, headers: NO_STORE })
}
