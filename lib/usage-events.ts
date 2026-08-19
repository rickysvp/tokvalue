// lib/usage-events.ts
/**
 * Review 计量事件流水（审计与对账用）。
 * 事件只追加、不修改；记录失败只 warn 不抛——审计不得阻断主交易流程。
 * postgres-only：file/memory 开发模式静默跳过。
 */
import type { NeonQueryFunction } from '@neondatabase/serverless'

const DATABASE_URL = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').replace(/\s+/g, '')

let sql: NeonQueryFunction<false, false> | null = null
let initPromise: Promise<void> | null = null

async function getSql(): Promise<NeonQueryFunction<false, false>> {
  if (sql) return sql
  const { neon } = await import('@neondatabase/serverless')
  sql = neon(DATABASE_URL)
  return sql
}

export type UsageEventType =
  | 'review_started'      // review 行创建（幂等命中时为 reused）
  | 'review_reused'       // 幂等键命中已存在 review
  | 'quota_reserved'      // credits 预扣成功 / 免费额度预扣成功
  | 'quota_consumed'      // Review 成功完成，扣减落定
  | 'quota_released'      // Review 失败/超时，额度返还
  | 'review_failed'
  | 'review_completed'

async function initTable(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const s = await getSql()
      await s`
        CREATE TABLE IF NOT EXISTS usage_events (
          id SERIAL PRIMARY KEY,
          email TEXT NOT NULL,
          username TEXT NOT NULL,
          review_id TEXT,
          event_type TEXT NOT NULL,
          purchase_type TEXT,
          status TEXT,
          meta JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
      await s`CREATE INDEX IF NOT EXISTS idx_usage_events_email ON usage_events(email, created_at)`
      await s`CREATE INDEX IF NOT EXISTS idx_usage_events_review ON usage_events(review_id)`
    })()
  }
  return initPromise
}

export interface UsageEventInput {
  email: string
  username: string
  reviewId?: string | null
  eventType: UsageEventType
  purchaseType?: string | null
  status?: string | null
  meta?: Record<string, unknown>
}

/** fire-and-forget 安全：任何失败只打日志，绝不影响主流程 */
export async function recordUsageEvent(event: UsageEventInput): Promise<void> {
  if (!DATABASE_URL) return
  try {
    await initTable()
    const s = await getSql()
    await s`
      INSERT INTO usage_events (email, username, review_id, event_type, purchase_type, status, meta)
      VALUES (
        ${event.email.toLowerCase().trim()},
        ${event.username},
        ${event.reviewId || null},
        ${event.eventType},
        ${event.purchaseType || null},
        ${event.status || null},
        ${event.meta ? JSON.stringify(event.meta) : null}::jsonb
      )
    `
  } catch (err) {
    console.warn('[usage-events] record failed (non-fatal):', err instanceof Error ? err.message : String(err))
  }
}
