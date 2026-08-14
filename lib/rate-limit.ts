/**
 * 通用 IP 限流模块（公网 API 滥用防护）。
 *
 * 设计参照 lib/db.ts 的 free_rate_limits 模式：
 * - 原子计数：INSERT ... ON CONFLICT DO UPDATE SET count = count + 1 RETURNING count
 * - 窗口语义：按窗口起点截断（如每小时一个窗口），简单可靠，无滑动窗口的边界复杂度
 * - fail-open：限流服务故障时放行并 console.warn，不阻断正常业务
 * - 不存明文 IP：bucket 中只含 HMAC 哈希（lib/analytics.ts 的 hashIp）
 */

import { NextResponse } from 'next/server'
import type { NeonQueryFunction } from '@neondatabase/serverless'
import { getClientIp } from '@/lib/ip'
import { hashIp } from '@/lib/analytics'

const DATABASE_URL = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').replace(/\s+/g, '')

// ── DB init ──

let sql: NeonQueryFunction<false, false> | null = null
let dbReady = false
let dbInitPromise: Promise<boolean> | null = null

async function initDb(): Promise<boolean> {
  if (dbReady) return true
  if (dbInitPromise) return dbInitPromise

  dbInitPromise = (async () => {
    if (!DATABASE_URL) {
      console.warn('[rate-limit] DATABASE_URL is not configured — rate limiting disabled (fail-open)')
      return false
    }
    try {
      const { neon } = await import('@neondatabase/serverless')
      sql = neon(DATABASE_URL)
      // CREATE TABLE IF NOT EXISTS — 幂等
      await sql`
        CREATE TABLE IF NOT EXISTS ip_rate_limits (
          bucket TEXT,
          window_start TIMESTAMPTZ,
          count INTEGER,
          PRIMARY KEY (bucket, window_start)
        )
      `
      dbReady = true
      return true
    } catch (err) {
      // 失败时清除缓存，允许下次请求重试
      console.warn('[rate-limit] Postgres init failed:', err instanceof Error ? err.message : String(err))
      sql = null
      dbInitPromise = null
      return false
    }
  })()

  return dbInitPromise
}

/**
 * IP 限流检查：窗口内首次请求插入计数 1，后续原子自增。
 * 超限时计数照加（让攻击者持续消耗自己的窗口配额），返回 false。
 *
 * @param key   bucket 标识，格式如 `send-code:{ipHash}` / `search:{ipHash}`（见 ipBucketKey）
 * @param opts  limit：窗口内最大次数；windowHours：窗口时长（小时）
 * @returns     true = 放行，false = 超限；DB 异常时 fail-open 返回 true
 */
export async function checkIpRateLimit(
  key: string,
  opts: { limit: number; windowHours: number }
): Promise<boolean> {
  const useDb = await initDb()
  if (!useDb || !sql) return true

  try {
    // 按窗口起点截断：windowHours=1 时即 date_trunc('hour', now()) 的整点窗口
    const windowMs = Math.max(1, opts.windowHours) * 3600_000
    const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs).toISOString()

    const rows = await sql`
      INSERT INTO ip_rate_limits (bucket, window_start, count)
      VALUES (${key}, ${windowStart}::timestamptz, 1)
      ON CONFLICT (bucket, window_start) DO UPDATE SET count = ip_rate_limits.count + 1
      RETURNING count
    ` as Array<{ count: number }>

    // 低概率顺带清理过期窗口，避免表无限增长（清理失败不影响本次判定）
    if (Math.random() < 0.02) {
      await sql`DELETE FROM ip_rate_limits WHERE window_start < NOW() - INTERVAL '2 days'`.catch(() => {})
    }

    return Number(rows[0]?.count || 0) <= opts.limit
  } catch (err) {
    console.warn('[rate-limit] check failed, allowing request:', err instanceof Error ? err.message : String(err))
    return true
  }
}

/**
 * 构造限流 bucket key：`{prefix}:{ipHash}`。
 * IP 经 HMAC 哈希后入 key（不存明文）；hashIp 异常或返回空串时兜底 'unknown' 并告警
 * （所有匿名请求会共享该 bucket，安全性降级但服务可用）。
 */
export function ipBucketKey(prefix: string, req: Request): string {
  const ip = getClientIp(req)
  try {
    const hashed = hashIp(ip)
    if (!hashed) {
      console.warn(`[rate-limit] hashIp returned empty string for prefix=${prefix}, falling back to 'unknown'`)
      return `${prefix}:unknown`
    }
    return `${prefix}:${hashed}`
  } catch (err) {
    console.warn(`[rate-limit] hashIp failed for prefix=${prefix}, falling back to 'unknown':`,
      err instanceof Error ? err.message : String(err))
    return `${prefix}:unknown`
  }
}

/**
 * 统一的 429 响应（当前所有限流均为小时级窗口，Retry-After 取 3600）。
 */
export function rateLimitResponse(reason: string): NextResponse {
  return NextResponse.json(
    { error: reason, code: 'RATE_LIMIT' },
    { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': '3600' } }
  )
}
