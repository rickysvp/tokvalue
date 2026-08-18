/**
 * Server-side credits logic — PostgreSQL persistence.
 * Only import this from API routes / server components (never from client components).
 *
 * NOTE: Neon Serverless uses HTTP fetch, each SQL call is a separate request.
 * 没有多语句事务 — 依赖单条语句的原子性保证正确性：
 * INSERT ... ON CONFLICT 做幂等抢锁，UPDATE ... WHERE 做条件写，
 * RETURNING 原子读回受影响行（扣减后余额 / 抢锁结果），避免"写后再 SELECT"的读回竞态。
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
      // 积分发放幂等表：payment_id 主键原子抢锁，防止并发重复发放
      // （db.ts 的 initStore 也会幂等建此表；此处再建一次，保证 webhook 路径不依赖 db.ts 初始化）
      await s`
        CREATE TABLE IF NOT EXISTS credit_grants (
          payment_id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          credits INTEGER NOT NULL,
          created_at BIGINT NOT NULL
        )
      `
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
): Promise<{ balance: CreditBalance; granted: boolean }> {
  const key = email.toLowerCase().trim()
  if (!key || !Number.isFinite(credits) || credits <= 0) {
    throw new Error('Invalid grant credits request')
  }

  await initTable()
  const s = await getSql()

  // 幂等抢锁：INSERT ... ON CONFLICT DO NOTHING 以 payment_id 主键原子判定是否已发放。
  // 旧实现"先 SELECT purchases JSONB 再 UPDATE"是两条独立请求，存在 TOCTOU：
  // 并发重放 webhook / webhook 与 claim 并发 / 两个并发 claim 均可双倍发放。
  // Neon 对 INSERT ... RETURNING 返回行数组：
  //   空数组   = 该 paymentId 已发放过（冲突未插入）→ 幂等成功，直接查余额返回，不重复加积分；
  //   非空数组 = 本请求抢锁成功，独占发放权，继续执行下方加积分 upsert。
  // 无 paymentId 的调用方（DEV 模式直接发放）不走此表，保持原逻辑。
  if (paymentId) {
    const locked = await s`
      INSERT INTO credit_grants (payment_id, email, credits, created_at)
      VALUES (${paymentId}, ${key}, ${credits}, ${Date.now()})
      ON CONFLICT (payment_id) DO NOTHING
      RETURNING payment_id
    `
    if (!locked || locked.length === 0) {
      // 幂等重放：该 paymentId 已发放过，直接返回余额，granted=false（供 webhook/claim 埋点去重）
      const balance = await getBalance(key)
      return { balance: balance!, granted: false }
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
  const balance = await getBalance(key)
  return { balance: balance!, granted: true }
}

// ── Pending Purchase (for payment callback fallback) ──

export interface PendingPurchase {
  email: string
  packageId: string
  credits: number
  amount: number
  checkoutId: string
  createdAt: number
  utm?: Record<string, unknown>
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
  await s`ALTER TABLE pending_purchases ADD COLUMN IF NOT EXISTS utm JSONB`
}

export async function storePendingPurchase(purchase: PendingPurchase): Promise<void> {
  await initTable()
  await initPendingTable()
  const s = await getSql()
  const key = purchase.email.toLowerCase().trim()
  await s`
    INSERT INTO pending_purchases (email, package_id, credits, amount, checkout_id, created_at, utm)
    VALUES (${key}, ${purchase.packageId}, ${purchase.credits}, ${purchase.amount}, ${purchase.checkoutId}, ${purchase.createdAt}, ${purchase.utm ? JSON.stringify(purchase.utm) : null}::jsonb)
    ON CONFLICT (email) DO UPDATE SET
      package_id = ${purchase.packageId},
      credits = ${purchase.credits},
      amount = ${purchase.amount},
      checkout_id = ${purchase.checkoutId},
      created_at = ${purchase.createdAt},
      utm = ${purchase.utm ? JSON.stringify(purchase.utm) : null}::jsonb
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
  const { balance } = await grantCredits(key, packageId, credits, amount, checkoutId)

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
  let utm: Record<string, unknown> | undefined
  if (r.utm) {
    try { utm = typeof r.utm === 'string' ? JSON.parse(r.utm) : (r.utm as Record<string, unknown>) } catch { utm = undefined }
  }
  return {
    email: key,
    packageId: String(r.package_id),
    credits: Number(r.credits),
    amount: Number(r.amount),
    checkoutId: String(r.checkout_id),
    createdAt,
    ...(utm ? { utm } : {}),
  }
}

export async function consumeCredit(email: string, username?: string): Promise<{ ok: boolean; balance?: CreditBalance; reason?: string }> {
  const key = email.toLowerCase().trim()
  if (!key) return { ok: false, reason: 'NOT_FOUND' }

  await initTable()
  await initUsageLogTable()
  const s = await getSql()

  // 原子扣减：仅当 credits > 0 且未禁用时 -1。
  // RETURNING 直接返回扣减后的行：非空数组 = 扣减成功（行内 credits 即 balance_after），
  // 空数组 = WHERE 未命中（不存在 / 被禁用 / 无余额），走下方原因区分。
  // 单条语句既关闭 TOCTOU 竞态（并发请求不可能同时通过预检再同时成功），
  // 又省去一次 SELECT 读回的 RTT 与"写后读"的二次竞态。
  const updateResult = await s`
    UPDATE credit_balances
    SET credits = credits - 1
    WHERE email = ${key} AND credits > 0 AND disabled = false
    RETURNING credits
  `

  if (!updateResult || updateResult.length === 0) {
    // Decrement failed: distinguish the reason with a single SELECT.
    const row = await s`SELECT credits, disabled FROM credit_balances WHERE email = ${key}`
    if (!row[0]) return { ok: false, reason: 'NOT_FOUND' }
    if (row[0].disabled) return { ok: false, reason: 'DISABLED' }
    return { ok: false, reason: 'NO_CREDITS' }
  }

  // balance_after 直接取自 RETURNING 行，与扣减同一原子快照，无读回竞态
  const balanceAfter = Number(updateResult[0].credits)

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

// ── Free evaluation allowance（免费评估额度：每邮箱终身 2 次）──

// 免费评估额度：每邮箱终身 2 次
export const FREE_ALLOWANCE_LIMIT = 2

let freeAllowanceInitPromise: Promise<void> | null = null

async function initFreeAllowanceTable(): Promise<void> {
  if (!freeAllowanceInitPromise) {
    freeAllowanceInitPromise = (async () => {
      const s = await getSql()
      await s`
        CREATE TABLE IF NOT EXISTS free_evaluations (
          email TEXT PRIMARY KEY,
          used_count INTEGER NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ DEFAULT now()
        )
      `
    })()
  }
  return freeAllowanceInitPromise
}

/**
 * 原子扣减一次免费评估额度（email 已验证过的 session 才会调用）。
 * 返回 ok=false 表示该邮箱终身免费额度已用完。
 *
 * 单条 upsert 原子完成"建行 + 条件自增 + 读回"（无多语句事务，依赖单语句原子性）：
 * - RETURNING 非空 = 扣减成功，used_count 即本次扣减后的已用次数
 * - RETURNING 空   = ON CONFLICT 的 WHERE 未命中（已用满终身额度），不扣减、不超记
 *
 * DB 异常时 fail-closed 返回 ok=false（与 rate-limit 的 fail-open 相反）：
 * 免费额度是成本控制闸门，每次放行都实打实烧 TikTok API + DeepSeek 配额，
 * 记账失败若放行等于退化回"无限免费"，宁严勿漏。
 */
export async function consumeFreeAllowance(email: string): Promise<{ ok: boolean; used: number; limit: number }> {
  const key = email.toLowerCase().trim()
  if (!key) return { ok: false, used: FREE_ALLOWANCE_LIMIT, limit: FREE_ALLOWANCE_LIMIT }

  try {
    await initFreeAllowanceTable()
    const s = await getSql()
    const rows = await s`
      INSERT INTO free_evaluations (email, used_count)
      VALUES (${key}, 1)
      ON CONFLICT (email) DO UPDATE SET
        used_count = free_evaluations.used_count + 1,
        updated_at = now()
      WHERE free_evaluations.used_count < ${FREE_ALLOWANCE_LIMIT}
      RETURNING used_count
    `
    if (!rows || rows.length === 0) {
      // WHERE 未命中：终身额度已用满（首次写入除外，首次必为 INSERT 路径成功）
      return { ok: false, used: FREE_ALLOWANCE_LIMIT, limit: FREE_ALLOWANCE_LIMIT }
    }
    return { ok: true, used: Number(rows[0].used_count), limit: FREE_ALLOWANCE_LIMIT }
  } catch (err) {
    // fail-closed：额度记账失败不得变成无限免费（成本控制场景，宁严勿漏）
    console.warn('[credits] consumeFreeAllowance failed, denying request (fail-closed):', err instanceof Error ? err.message : String(err))
    return { ok: false, used: FREE_ALLOWANCE_LIMIT, limit: FREE_ALLOWANCE_LIMIT }
  }
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