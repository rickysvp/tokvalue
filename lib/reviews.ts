// lib/reviews.ts
/**
 * account_reviews 数据层：幂等创建、状态推进、in-flight 并发锁、惰性超时对账。
 *
 * 并发正确性（Neon 无事务，靠单语句原子性）：
 * - 幂等：UNIQUE(email, username, idempotency_key) + INSERT ON CONFLICT DO NOTHING
 * - 并发锁：partial unique index —— 同一 (email, username) 仅一行活跃 review，
 *   第二个并发 INSERT 会抛唯一约束冲突（constraint: idx_account_reviews_inflight）
 * - 防重复释放：failReview/updateReviewStatus 带 `WHERE status NOT IN ('completed','failed')`
 *   守卫并以 RETURNING 行数判定是否真的发生了转移——终态行不可能被二次 refund
 */
import { isStaleReview, type ReviewStatus } from './review-state'
import { recordUsageEvent } from './usage-events'
import { refundCredit } from './credits-server'
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

async function initTable(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const s = await getSql()
      await s`
        CREATE TABLE IF NOT EXISTS account_reviews (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          username TEXT NOT NULL,
          idempotency_key TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'requested',
          state_entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          purchase_type TEXT NOT NULL DEFAULT 'credits',
          access_level TEXT NOT NULL DEFAULT 'full',
          failure_reason TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMPTZ
        )
      `
      // 幂等键唯一：同一 (email, username, key) 重复提交只产生一行
      await s`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_account_reviews_idem
        ON account_reviews(email, username, idempotency_key)
      `
      // in-flight 锁：同一 (email, username) 同时最多一个活跃 review
      await s`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_account_reviews_inflight
        ON account_reviews(email, username)
        WHERE status IN ('requested','quota_reserved','fetching_data','data_saved','analyzing','report_generating')
      `
      await s`CREATE INDEX IF NOT EXISTS idx_account_reviews_created ON account_reviews(created_at)`
    })()
  }
  return initPromise
}

export interface AccountReviewRow {
  id: string
  email: string
  username: string
  idempotency_key: string
  status: ReviewStatus
  state_entered_at: string
  purchase_type: 'credits' | 'free_trial'
  access_level: 'teaser' | 'full'
  failure_reason: string | null
  created_at: string
  completed_at: string | null
}

function rowToReview(row: Record<string, unknown>): AccountReviewRow {
  return {
    id: String(row.id),
    email: String(row.email),
    username: String(row.username),
    idempotency_key: String(row.idempotency_key),
    status: String(row.status) as ReviewStatus,
    state_entered_at: String(row.state_entered_at),
    purchase_type: String(row.purchase_type || 'credits') as AccountReviewRow['purchase_type'],
    access_level: String(row.access_level || 'full') as AccountReviewRow['access_level'],
    failure_reason: row.failure_reason ? String(row.failure_reason) : null,
    created_at: String(row.created_at),
    completed_at: row.completed_at ? String(row.completed_at) : null,
  }
}

export type CreateReviewResult =
  | { kind: 'created'; review: AccountReviewRow }
  | { kind: 'reused'; review: AccountReviewRow }
  | { kind: 'conflict'; review: AccountReviewRow } // 已有活跃 review（in-flight）
  | { kind: 'unavailable' }                         // 非 postgres（本地 file/memory 开发模式）

/**
 * 幂等创建 review。调用前应先 reconcileInFlight。
 * - 同 idempotency_key 已存在 → reused（completed 直接复用；活跃则视作 conflict）
 * - in-flight 部分索引冲突 → conflict（附现有活跃 review）
 */
export async function createOrGetReview(
  email: string,
  username: string,
  idempotencyKey: string,
  purchaseType: AccountReviewRow['purchase_type'],
): Promise<CreateReviewResult> {
  if (!DATABASE_URL) return { kind: 'unavailable' }
  await initTable()
  const s = await getSql()
  const key = email.toLowerCase().trim()
  const id = crypto.randomUUID()

  try {
    const inserted = await s`
      INSERT INTO account_reviews (id, email, username, idempotency_key, status, purchase_type, access_level)
      VALUES (${id}, ${key}, ${username}, ${idempotencyKey}, 'requested', ${purchaseType}, ${purchaseType === 'free_trial' ? 'teaser' : 'full'})
      ON CONFLICT (email, username, idempotency_key) DO NOTHING
      RETURNING *
    `
    if (inserted && inserted.length > 0) {
      return { kind: 'created', review: rowToReview(inserted[0] as Record<string, unknown>) }
    }
    // 幂等命中：读回已有行
    const existing = await s`
      SELECT * FROM account_reviews
      WHERE email = ${key} AND username = ${username} AND idempotency_key = ${idempotencyKey}
    `
    const row = rowToReview(existing[0] as Record<string, unknown>)
    return row.status === 'completed'
      ? { kind: 'reused', review: row }
      : { kind: 'conflict', review: row }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('idx_account_reviews_inflight')) {
      // 并发锁冲突：读回当前活跃行
      const active = await getActiveReview(email, username)
      if (active) return { kind: 'conflict', review: active }
      throw err // 罕见：冲突瞬间行又消失，重抛由上层兜底
    }
    throw err
  }
}

export async function getActiveReview(email: string, username: string): Promise<AccountReviewRow | null> {
  if (!DATABASE_URL) return null
  await initTable()
  const s = await getSql()
  const rows = await s`
    SELECT * FROM account_reviews
    WHERE email = ${email.toLowerCase().trim()} AND username = ${username}
      AND status IN ('requested','quota_reserved','fetching_data','data_saved','analyzing','report_generating')
    ORDER BY created_at DESC LIMIT 1
  `
  return rows[0] ? rowToReview(rows[0] as Record<string, unknown>) : null
}

export async function getReview(id: string): Promise<AccountReviewRow | null> {
  if (!DATABASE_URL) return null
  await initTable()
  const s = await getSql()
  const rows = await s`SELECT * FROM account_reviews WHERE id = ${id}`
  return rows[0] ? rowToReview(rows[0] as Record<string, unknown>) : null
}

/**
 * 状态推进（带合法性守卫）：非法跳转 / 终态行返回 null，不抛错——
 * 状态推进失败不应炸掉主评估流程，只打日志。
 */
export async function transitionReview(id: string, to: ReviewStatus): Promise<AccountReviewRow | null> {
  if (!DATABASE_URL) return null
  const s = await getSql()
  const rows = await s`
    UPDATE account_reviews
    SET status = ${to}, state_entered_at = NOW()
    WHERE id = ${id} AND status NOT IN ('completed','failed')
    RETURNING *
  `
  return rows && rows.length > 0 ? rowToReview(rows[0] as Record<string, unknown>) : null
}

/**
 * 判失败（终态）。RETURNING 非空 = 本次真的从活跃转 failed；
 * 调用方据此决定是否 refund（防二次返还）。credits 型同时记账。
 */
export async function failReview(id: string, reason: string): Promise<AccountReviewRow | null> {
  if (!DATABASE_URL) return null
  const s = await getSql()
  const rows = await s`
    UPDATE account_reviews
    SET status = 'failed', failure_reason = ${reason.slice(0, 500)}, completed_at = NOW()
    WHERE id = ${id} AND status NOT IN ('completed','failed')
    RETURNING *
  `
  const row = rows && rows.length > 0 ? rowToReview(rows[0] as Record<string, unknown>) : null
  if (row) {
    await recordUsageEvent({
      email: row.email, username: row.username, reviewId: row.id,
      eventType: 'review_failed', purchaseType: row.purchase_type,
      status: 'failed', meta: { reason: reason.slice(0, 200) },
    })
  }
  return row
}

/**
 * 惰性对账：把 (email, username) 下超时的活跃 review 判 failed，
 * credits 型自动返还 + 记 quota_released。幂等、可在任意请求路径调用。
 */
export async function reconcileInFlight(email: string, username: string): Promise<void> {
  const active = await getActiveReview(email, username)
  if (!active) return
  if (!isStaleReview(active.status, active.state_entered_at)) return
  const failed = await failReview(active.id, `timeout in ${active.status}`)
  if (failed && failed.purchase_type === 'credits') {
    await refundCredit(failed.email)
    await recordUsageEvent({
      email: failed.email, username: failed.username, reviewId: failed.id,
      eventType: 'quota_released', purchaseType: failed.purchase_type,
      status: 'failed', meta: { reason: 'timeout' },
    })
  }
}
