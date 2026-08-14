/**
 * Server-side credits logic — PostgreSQL persistence.
 * Only import this from API routes / server components (never from client components).
 *
 * NOTE: Neon Serverless uses HTTP fetch, each SQL call is a separate request.
 * Do NOT use SELECT ... FOR UPDATE or RETURNING — they require transaction context.
 * Use atomic INSERT ON CONFLICT / UPDATE WHERE, then SELECT separately.
 */

import type { CreditBalance } from './credits'
import type { NeonQueryFunction } from '@neondatabase/serverless'

const DATABASE_URL = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').replace(/\s+/g, '')

let sql: NeonQueryFunction<false, false> | null = null
let initPromise: Promise<void> | null = null
let usageLogInitPromise: Promise<void> | null = null

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
        CREATE TABLE IF NOT EXISTS credit_balances (
          email TEXT PRIMARY KEY,
          credits INTEGER NOT NULL DEFAULT 0,
          total_purchased INTEGER NOT NULL DEFAULT 0,
          purchases JSONB NOT NULL DEFAULT '[]'::jsonb,
          verified_at BIGINT NOT NULL DEFAULT 0,
          disabled BOOLEAN NOT NULL DEFAULT false
        )
      `
      await s`ALTER TABLE credit_balances ADD COLUMN IF NOT EXISTS disabled BOOLEAN NOT NULL DEFAULT false`
    })()
  }
  return initPromise
}

export async function initUsageLogTable(): Promise<void> {
  if (!usageLogInitPromise) {
    usageLogInitPromise = (async () => {
      const s = await getSql()
      await s`
        CREATE TABLE IF NOT EXISTS credit_usage_logs (
          id SERIAL PRIMARY KEY,
          email TEXT NOT NULL,
          action TEXT NOT NULL,
          username TEXT,
          credits INTEGER NOT NULL DEFAULT 0,
          balance_after INTEGER NOT NULL,
          reason TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `
      await s`CREATE INDEX IF NOT EXISTS idx_usage_logs_email ON credit_usage_logs(email)`
      await s`CREATE INDEX IF NOT EXISTS idx_usage_logs_action ON credit_usage_logs(email, action)`
      await s`CREATE INDEX IF NOT EXISTS idx_usage_logs_created ON credit_usage_logs(created_at)`
    })()
  }
  return usageLogInitPromise
}

function rowToBalance(row: Record<string, unknown>): CreditBalance {
  return {
    email: String(row.email),
    credits: Number(row.credits),
    totalPurchased: Number(row.total_purchased),
    purchases: Array.isArray(row.purchases) ? row.purchases as CreditBalance['purchases'] : [],
    verifiedAt: Number(row.verified_at),
  }
}

export async function getBalance(email: string): Promise<CreditBalance | null> {
  const key = email.toLowerCase().trim()
  if (!key) return null
  await initTable()
  const s = await getSql()
  const rows = await s`SELECT * FROM credit_balances WHERE email = ${key}`
  return rows[0] ? rowToBalance(rows[0]) : null
}

export async function grantCredits(
  email: string,
  packageId: string,
  credits: number,
  amount: number,
  paymentId?: string,
): Promise<CreditBalance> {
  const key = email.toLowerCase().trim()
  if (!key || !Number.isFinite(credits) || credits <= 0) {
    throw new Error('Invalid grant credits request')
  }

  await initTable()
  const s = await getSql()

  // 幂等检查：同一 paymentId 不重复发放
  if (paymentId) {
    const existing = await s`SELECT purchases FROM credit_balances WHERE email = ${key}`
    if (existing[0]) {
      const purchases = Array.isArray(existing[0].purchases)
        ? existing[0].purchases as Array<{ paymentId?: string }>
        : []
      if (purchases.some(p => p.paymentId === paymentId)) {
        return getBalance(key) as Promise<CreditBalance>
      }
    }
  }

  const newPurchase = { packageId, credits, amount, purchasedAt: Date.now(), paymentId }
  const now = Date.now()

  // Atomic upsert: INSERT if new, UPDATE if exists
  await s`
    INSERT INTO credit_balances (email, credits, total_purchased, purchases, verified_at)
    VALUES (${key}, ${credits}, ${credits}, ${JSON.stringify([newPurchase])}::jsonb, ${now})
    ON CONFLICT (email) DO UPDATE SET
      credits = credit_balances.credits + ${credits},
      total_purchased = credit_balances.total_purchased + ${credits},
      purchases = ${JSON.stringify([newPurchase])}::jsonb || credit_balances.purchases
  `

  // Read back the updated row
  return getBalance(key) as Promise<CreditBalance>
}

// ── Pending Purchase (for payment callback fallback) ──

export interface PendingPurchase {
  email: string
  packageId: string
  credits: number
  amount: number
  checkoutId: string
  createdAt: number
}

async function initPendingTable(): Promise<void> {
  const s = await getSql()
  await s`
    CREATE TABLE IF NOT EXISTS pending_purchases (
      email TEXT PRIMARY KEY,
      package_id TEXT NOT NULL,
      credits INTEGER NOT NULL,
      amount NUMERIC NOT NULL,
      checkout_id TEXT NOT NULL,
      created_at BIGINT NOT NULL
    )
  `
}

export async function storePendingPurchase(purchase: PendingPurchase): Promise<void> {
  await initTable()
  await initPendingTable()
  const s = await getSql()
  const key = purchase.email.toLowerCase().trim()
  await s`
    INSERT INTO pending_purchases (email, package_id, credits, amount, checkout_id, created_at)
    VALUES (${key}, ${purchase.packageId}, ${purchase.credits}, ${purchase.amount}, ${purchase.checkoutId}, ${purchase.createdAt})
    ON CONFLICT (email) DO UPDATE SET
      package_id = ${purchase.packageId},
      credits = ${purchase.credits},
      amount = ${purchase.amount},
      checkout_id = ${purchase.checkoutId},
      created_at = ${purchase.createdAt}
  `
}

export async function claimPendingPurchase(email: string): Promise<CreditBalance | null> {
  const key = email.toLowerCase().trim()
  if (!key) return null

  await initTable()
  await initPendingTable()
  const s = await getSql()

  // Look up pending purchase
  const rows = await s`SELECT * FROM pending_purchases WHERE email = ${key}`
  if (!rows[0]) return null

  const pending = rows[0] as Record<string, unknown>
  const createdAt = Number(pending.created_at)
  const now = Date.now()

  // Expire after 30 minutes
  if (now - createdAt > 30 * 60 * 1000) {
    await s`DELETE FROM pending_purchases WHERE email = ${key}`
    return null
  }

  const credits = Number(pending.credits)
  const packageId = String(pending.package_id)
  const amount = Number(pending.amount)
  const checkoutId = String(pending.checkout_id)

  // Grant credits (idempotent via checkoutId)
  const balance = await grantCredits(key, packageId, credits, amount, checkoutId)

  // Delete pending purchase
  await s`DELETE FROM pending_purchases WHERE email = ${key}`

  return balance
}

// Get pending purchase without claiming — used for Creem verification before claim
export async function getPendingPurchase(email: string): Promise<PendingPurchase | null> {
  const key = email.toLowerCase().trim()
  if (!key) return null
  await initPendingTable()
  const s = await getSql()
  const rows = await s`SELECT * FROM pending_purchases WHERE email = ${key}`
  if (!rows[0]) return null
  const r = rows[0] as Record<string, unknown>
  const createdAt = Number(r.created_at)
  if (Date.now() - createdAt > 30 * 60 * 1000) {
    await s`DELETE FROM pending_purchases WHERE email = ${key}`
    return null
  }
  return {
    email: key,
    packageId: String(r.package_id),
    credits: Number(r.credits),
    amount: Number(r.amount),
    checkoutId: String(r.checkout_id),
    createdAt,
  }
}

export async function consumeCredit(email: string, username?: string): Promise<{ ok: boolean; balance?: CreditBalance; reason?: string }> {
  const key = email.toLowerCase().trim()
  if (!key) return { ok: false, reason: 'NOT_FOUND' }

  await initTable()
  await initUsageLogTable()
  const s = await getSql()

  // Atomic: decrement only if credits > 0 AND not disabled.
  // Neon serverless driver returns affected rows array for UPDATE
  // (empty array = no row matched, i.e. not found / disabled / no credits).
  // This single statement closes the TOCTOU race: concurrent requests cannot
  // both pass a pre-check SELECT and both succeed.
  const updateResult = await s`
    UPDATE credit_balances
    SET credits = credits - 1
    WHERE email = ${key} AND credits > 0 AND disabled = false
  `

  if (!updateResult || updateResult.length === 0) {
    // Decrement failed: distinguish the reason with a single SELECT.
    const row = await s`SELECT credits, disabled FROM credit_balances WHERE email = ${key}`
    if (!row[0]) return { ok: false, reason: 'NOT_FOUND' }
    if (row[0].disabled) return { ok: false, reason: 'DISABLED' }
    return { ok: false, reason: 'NO_CREDITS' }
  }

  // Read back the actual balance after UPDATE (avoids race condition on balance_after)
  const updated = await s`SELECT credits FROM credit_balances WHERE email = ${key}`
  const balanceAfter = Number(updated[0]?.credits || 0)

  // Write usage log for audit trail
  await s`
    INSERT INTO credit_usage_logs (email, action, username, credits, balance_after, reason)
    VALUES (${key}, 'consume', ${username || null}, 1, ${balanceAfter}, 'evaluate')
  `

  // Read back the updated row
  const balance = await getBalance(key)
  return { ok: true, balance: balance! }
}

/**
 * 退款 1 次额度。
 * 仅用于内部回滚（evaluate 流程中 fetchProfile 失败时退还已扣额度）。
 */
export async function refundCredit(email: string): Promise<void> {
  const key = email.toLowerCase().trim()
  if (!key) return

  await initTable()
  await initUsageLogTable()
  const s = await getSql()

  await s`
    UPDATE credit_balances
    SET credits = credits + 1
    WHERE email = ${key}
  `

  // Read back the actual balance after UPDATE (avoids race condition on balance_after)
  const updated = await s`SELECT credits FROM credit_balances WHERE email = ${key}`
  const balanceAfter = Number(updated[0]?.credits || 0)

  // Write refund log
  await s`
    INSERT INTO credit_usage_logs (email, action, username, credits, balance_after, reason)
    VALUES (${key}, 'refund', null, 1, ${balanceAfter}, 'evaluate_rollback')
  `
}

/**
 * 获取用户的积分使用次数（从日志表查询）
 */
export async function getUsageCountByEmail(email: string): Promise<number> {
  const key = email.toLowerCase().trim()
  if (!key) return 0

  await initUsageLogTable()
  const s = await getSql()

  const rows = await s`
    SELECT COUNT(*)::int AS count
    FROM credit_usage_logs
    WHERE email = ${key} AND action = 'consume' AND reason = 'evaluate'
  `
  return Number(rows[0]?.count || 0)
}

/**
 * 批量获取多个用户的积分使用次数
 */
export async function getUsageCountsByEmails(emails: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  if (!emails.length) return result

  await initUsageLogTable()
  const s = await getSql()

  const rows = await s`
    SELECT email, COUNT(*)::int AS count
    FROM credit_usage_logs
    WHERE action = 'consume' AND reason = 'evaluate'
    GROUP BY email
  `
  for (const r of rows as Array<Record<string, unknown>>) {
    const email = String(r.email).toLowerCase().trim()
    const count = Number(r.count)
    if (email) result.set(email, count)
  }
  return result
}