/**
 * Referral commission — server-side persistence (Neon).
 *
 * 推荐佣金：推荐人通过专属链接（`?ref=<CODE>`）带新用户成交，得成交额 40% 佣金。
 * 佣金为「现金记账（USD）」，仅支持 USDC 提现（提现二期做，一期只记账 + 余额展示）。
 *
 * 关键决策（已拍板）：
 * - 佣金比例 40%，基于成交金额（实付 USD）
 * - 退款保护期 60 天：pending 佣金保护期内被退款/拒付即 voided，到期无退款自动 settled
 * - 自购禁止：referrer_email === buyer_email 时跳过佣金
 * - 推荐码：系统随机生成（6 位短串，去易混淆字符），email 绑定、唯一
 *
 * Neon 无多语句事务，依赖单条语句原子性：
 * - 推荐码生成用 INSERT ... ON CONFLICT (code) DO NOTHING RETURNING 抢唯一码
 * - 佣金写入用 payment_id 主键 ON CONFLICT DO NOTHING 幂等（防 webhook 重试重复入账）
 * - 撤销/结算用 UPDATE ... WHERE status = 'pending' 条件写
 */

import type { NeonQueryFunction } from '@neondatabase/serverless'
import crypto from 'crypto'

const DATABASE_URL = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').replace(/\s+/g, '')

/** 佣金比例（推荐人分成） */
export const COMMISSION_RATE = 0.4
/** 退款保护期：60 天（覆盖 Creem 官方退款窗口） */
export const PROTECTION_PERIOD_MS = 60 * 24 * 60 * 60 * 1000

/** 推荐码字符集：去易混淆字符（0/O、1/I/L） */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

// ── USDC 提现（二期）──

/** 首次提现门槛（USD） */
export const WITHDRAW_MIN_FIRST = 50
/** 后续每次最低提现（USD） */
export const WITHDRAW_MIN_SUBSEQUENT = 100
/** USDC 地址校验：BSC/BEP-20（0x + 40 hex），拒绝 Solana/其他链 */
export const USDC_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/

export type PayoutStatus = 'requested' | 'processing' | 'paid' | 'rejected'

export interface PayoutItem {
  id: number
  email: string
  amount: number
  usdc_address: string
  status: PayoutStatus
  tx_hash: string | null
  reject_reason: string | null
  created_at: string
  processed_at: string | null
}

let initPayoutPromise: Promise<void> | null = null

async function initPayoutTable(): Promise<void> {
  if (!initPayoutPromise) {
    initPayoutPromise = (async () => {
      let lastErr: unknown = null
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const s = await getSql()
          await s`
            CREATE TABLE IF NOT EXISTS referral_payouts (
              id SERIAL PRIMARY KEY,
              email TEXT NOT NULL,
              amount NUMERIC NOT NULL,
              usdc_address TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'requested',
              tx_hash TEXT,
              reject_reason TEXT,
              created_at TIMESTAMPTZ DEFAULT NOW(),
              processed_at TIMESTAMPTZ
            )
          `
          await s`CREATE INDEX IF NOT EXISTS idx_payouts_email ON referral_payouts(email)`
          await s`CREATE INDEX IF NOT EXISTS idx_payouts_status ON referral_payouts(status)`
          return
        } catch (err) {
          lastErr = err
          sql = null
          if (attempt < 3) {
            await new Promise(r => setTimeout(r, attempt * 500))
          }
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error('Failed to init payout table')
    })()
    initPayoutPromise.catch(() => {
      initPayoutPromise = null
    })
  }
  return initPayoutPromise
}

/**
 * 可提现余额 = settled 佣金总和 - 已发起且未拒绝的提现（requested/processing/paid 占用额度）。
 * rejected 提现释放额度，不计入占用。
 */
export interface WithdrawableBalance {
  settledTotal: number
  reserved: number // requested + processing + paid 占用
  withdrawable: number
  hasPriorPayout: boolean
  minWithdraw: number // 本次最低提现门槛（首次 $50 / 后续 $100）
}

export async function getWithdrawableBalance(email: string): Promise<WithdrawableBalance> {
  const key = email.toLowerCase().trim()
  if (!key) {
    return { settledTotal: 0, reserved: 0, withdrawable: 0, hasPriorPayout: false, minWithdraw: WITHDRAW_MIN_FIRST }
  }
  await initPayoutTable()
  const s = await getSql()

  const settledRow = await withRetry(() => s`
    SELECT COALESCE(SUM(commission), 0)::float AS total
    FROM referral_commissions
    WHERE referrer_email = ${key} AND status = 'settled'
  `)
  const reservedRow = await withRetry(() => s`
    SELECT COALESCE(SUM(amount), 0)::float AS total
    FROM referral_payouts
    WHERE email = ${key} AND status IN ('requested', 'processing', 'paid')
  `)
  const priorRow = await withRetry(() => s`
    SELECT id FROM referral_payouts WHERE email = ${key} LIMIT 1
  `)

  const settledTotal = Number(settledRow[0]?.total || 0)
  const reserved = Number(reservedRow[0]?.total || 0)
  const hasPriorPayout = !!priorRow[0]
  const withdrawable = Math.max(settledTotal - reserved, 0)

  return {
    settledTotal,
    reserved,
    withdrawable,
    hasPriorPayout,
    minWithdraw: hasPriorPayout ? WITHDRAW_MIN_SUBSEQUENT : WITHDRAW_MIN_FIRST,
  }
}

export type RequestWithdrawalResult =
  | { ok: true; payout: PayoutItem }
  | { ok: false; code: 'INVALID_ADDRESS' | 'BELOW_MIN' | 'INSUFFICIENT_BALANCE' | 'INTERNAL' }

/**
 * 发起 USDC 提现请求。
 * - 地址校验：BSC/BEP-20（0x + 40 hex）
 * - 门槛校验：首次 $50 / 后续 $100
 * - 防超提现：单条 INSERT ... SELECT ... WHERE（原子性），可提现余额不足时 RETURNING 空
 */
export async function requestWithdrawal(
  email: string,
  amount: number,
  usdcAddress: string,
): Promise<RequestWithdrawalResult> {
  const key = email.toLowerCase().trim()
  if (!key) return { ok: false, code: 'INTERNAL' }

  if (!USDC_ADDRESS_RE.test(usdcAddress)) {
    return { ok: false, code: 'INVALID_ADDRESS' }
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, code: 'BELOW_MIN' }
  }

  const bal = await getWithdrawableBalance(key)
  if (amount < bal.minWithdraw) {
    return { ok: false, code: 'BELOW_MIN' }
  }

  await initPayoutTable()
  const s = await getSql()

  // 单条原子语句：可提现余额（settled - 占用）>= amount 才插入
  const inserted = await withRetry(() => s`
    INSERT INTO referral_payouts (email, amount, usdc_address, status)
    SELECT ${key}, ${amount}, ${usdcAddress}, 'requested'
    WHERE (
      (SELECT COALESCE(SUM(commission), 0) FROM referral_commissions WHERE referrer_email = ${key} AND status = 'settled')
      - (SELECT COALESCE(SUM(amount), 0) FROM referral_payouts WHERE email = ${key} AND status IN ('requested', 'processing', 'paid')
      )
    ) >= ${amount}
    RETURNING id, email, amount, usdc_address, status, tx_hash, reject_reason, created_at, processed_at
  `)

  if (!inserted || inserted.length === 0) {
    return { ok: false, code: 'INSUFFICIENT_BALANCE' }
  }
  const r = inserted[0] as Record<string, unknown>
  return {
    ok: true,
    payout: {
      id: Number(r.id),
      email: String(r.email),
      amount: Number(r.amount),
      usdc_address: String(r.usdc_address),
      status: r.status as PayoutStatus,
      tx_hash: r.tx_hash ? String(r.tx_hash) : null,
      reject_reason: r.reject_reason ? String(r.reject_reason) : null,
      created_at: String(r.created_at),
      processed_at: r.processed_at ? String(r.processed_at) : null,
    },
  }
}

/** 查询用户提现历史。 */
export async function listPayouts(email: string): Promise<PayoutItem[]> {
  const key = email.toLowerCase().trim()
  if (!key) return []
  await initPayoutTable()
  const s = await getSql()
  const rows = await withRetry(() => s`
    SELECT id, email, amount, usdc_address, status, tx_hash, reject_reason, created_at, processed_at
    FROM referral_payouts
    WHERE email = ${key}
    ORDER BY created_at DESC
    LIMIT 50
  `)
  return (rows as Array<Record<string, unknown>>).map(r => ({
    id: Number(r.id),
    email: String(r.email),
    amount: Number(r.amount),
    usdc_address: String(r.usdc_address),
    status: r.status as PayoutStatus,
    tx_hash: r.tx_hash ? String(r.tx_hash) : null,
    reject_reason: r.reject_reason ? String(r.reject_reason) : null,
    created_at: String(r.created_at),
    processed_at: r.processed_at ? String(r.processed_at) : null,
  }))
}

// ── 管理端提现审核 ──

export async function listPayoutsAdmin(status?: PayoutStatus): Promise<PayoutItem[]> {
  await initPayoutTable()
  const s = await getSql()
  const rows = status
    ? await withRetry(() => s`
        SELECT id, email, amount, usdc_address, status, tx_hash, reject_reason, created_at, processed_at
        FROM referral_payouts WHERE status = ${status} ORDER BY created_at ASC LIMIT 200
      `)
    : await withRetry(() => s`
        SELECT id, email, amount, usdc_address, status, tx_hash, reject_reason, created_at, processed_at
        FROM referral_payouts ORDER BY created_at DESC LIMIT 200
      `)
  return (rows as Array<Record<string, unknown>>).map(r => ({
    id: Number(r.id),
    email: String(r.email),
    amount: Number(r.amount),
    usdc_address: String(r.usdc_address),
    status: r.status as PayoutStatus,
    tx_hash: r.tx_hash ? String(r.tx_hash) : null,
    reject_reason: r.reject_reason ? String(r.reject_reason) : null,
    created_at: String(r.created_at),
    processed_at: r.processed_at ? String(r.processed_at) : null,
  }))
}

/** 标记提现已支付（附链上 tx_hash）。仅 requested/processing → paid。 */
export async function markPayoutPaid(id: number, txHash: string): Promise<boolean> {
  await initPayoutTable()
  const s = await getSql()
  const rows = await withRetry(() => s`
    UPDATE referral_payouts
    SET status = 'paid', tx_hash = ${txHash}, processed_at = NOW()
    WHERE id = ${id} AND status IN ('requested', 'processing')
    RETURNING id
  `)
  return (rows as Array<unknown>).length > 0
}

/** 标记提现已拒绝（附原因，释放额度）。仅 requested/processing → rejected。 */
export async function markPayoutRejected(id: number, reason: string): Promise<boolean> {
  await initPayoutTable()
  const s = await getSql()
  const rows = await withRetry(() => s`
    UPDATE referral_payouts
    SET status = 'rejected', reject_reason = ${reason}, processed_at = NOW()
    WHERE id = ${id} AND status IN ('requested', 'processing')
    RETURNING id
  `)
  return (rows as Array<unknown>).length > 0
}

let sql: NeonQueryFunction<false, false> | null = null
let initPromise: Promise<void> | null = null

async function getSql(): Promise<NeonQueryFunction<false, false>> {
  if (sql) return sql
  const { neon } = await import('@neondatabase/serverless')
  sql = neon(DATABASE_URL)
  return sql
}

/** 单条查询重试：Neon 无服务器连接可能瞬时抖动（ECONNRESET），与 db.ts 对齐重试 3 次。 */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, attempt * 400))
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Referral query failed')
}

async function initTable(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      // 冷启动/网络抖动（ECONNRESET）重试 3 次，与 db.ts initStore 对齐
      let lastErr: unknown = null
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const s = await getSql()
          await s`
            CREATE TABLE IF NOT EXISTS referral_codes (
              code TEXT PRIMARY KEY,
              email TEXT NOT NULL,
              created_at TIMESTAMPTZ DEFAULT NOW()
            )
          `
          await s`CREATE INDEX IF NOT EXISTS idx_referral_codes_email ON referral_codes(email)`
          await s`
            CREATE TABLE IF NOT EXISTS referral_commissions (
              id SERIAL PRIMARY KEY,
              code TEXT NOT NULL,
              referrer_email TEXT NOT NULL,
              buyer_email TEXT NOT NULL,
              payment_id TEXT UNIQUE NOT NULL,
              order_id TEXT,
              package_id TEXT NOT NULL,
              amount NUMERIC NOT NULL,
              commission NUMERIC NOT NULL,
              status TEXT NOT NULL DEFAULT 'pending',
              settled_at TIMESTAMPTZ,
              created_at TIMESTAMPTZ DEFAULT NOW()
            )
          `
          await s`CREATE INDEX IF NOT EXISTS idx_commissions_referrer ON referral_commissions(referrer_email)`
          await s`CREATE INDEX IF NOT EXISTS idx_commissions_status ON referral_commissions(status)`
          await s`CREATE INDEX IF NOT EXISTS idx_commissions_order ON referral_commissions(order_id)`
          return
        } catch (err) {
          lastErr = err
          sql = null
          if (attempt < 3) {
            await new Promise(r => setTimeout(r, attempt * 500))
          }
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error('Failed to init referral tables')
    })()
    // 失败时清除缓存，允许下次重试（防首次建表遇网络抖动后进程内永久 500）
    initPromise.catch(() => {
      initPromise = null
    })
  }
  return initPromise
}

// ── 推荐码 ──

function randomCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH)
  let out = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  }
  return out
}

/**
 * 获取或创建推荐人的推荐码（幂等：已有则返回已有码，不重复生成）。
 * 新码用 INSERT ON CONFLICT (code) DO NOTHING RETURNING 抢唯一码，冲突（极小概率）则重试。
 */
export async function getOrCreateReferralCode(email: string): Promise<string> {
  const key = email.toLowerCase().trim()
  if (!key) throw new Error('Invalid referral email')

  await initTable()
  const s = await getSql()

  // 已有码直接返回
  const existing = await withRetry(() => s`SELECT code FROM referral_codes WHERE email = ${key}`)
  if (existing[0]) return String(existing[0].code)

  // 生成唯一码（重试至多 5 次，碰撞概率极低）
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode()
    const inserted = await withRetry(() => s`
      INSERT INTO referral_codes (code, email)
      VALUES (${code}, ${key})
      ON CONFLICT (code) DO NOTHING
      RETURNING code
    `)
    if (inserted && inserted.length > 0) {
      return code
    }
    // 极小概率：同一 email 已被并发创建（code 冲突而非 email 冲突），重新查一次
    const again = await withRetry(() => s`SELECT code FROM referral_codes WHERE email = ${key}`)
    if (again[0]) return String(again[0].code)
  }
  throw new Error('Failed to generate referral code')
}

/** 按推荐码解析推荐人 email（无效码返回 null）。 */
export async function resolveReferralCode(code: string): Promise<string | null> {
  const key = String(code || '').trim().toUpperCase()
  if (!key) return null
  await initTable()
  const s = await getSql()
  const rows = await withRetry(() => s`SELECT email FROM referral_codes WHERE code = ${key}`)
  return rows[0] ? String(rows[0].email).toLowerCase().trim() : null
}

// ── 佣金 ──

export type CommissionStatus = 'pending' | 'settled' | 'voided'

export interface CommissionItem {
  id: number
  referrer_email: string
  buyer_email: string
  package_id: string
  amount: number
  commission: number
  status: CommissionStatus
  created_at: string
  settled_at: string | null
}

export type CreateCommissionResult =
  | { created: true; commission: number }
  | { created: false; reason: 'self_purchase' | 'duplicate' }

/**
 * 支付成功后写入 pending 佣金（webhook checkout.completed 的 grantCredits 成功后调用）。
 * - 自购拦截：referrer === buyer 跳过
 * - 幂等：payment_id 主键 ON CONFLICT DO NOTHING（webhook 重试/claim 重放不重复入账）
 */
export async function createCommission(params: {
  code: string
  referrerEmail: string
  buyerEmail: string
  paymentId: string
  orderId?: string
  packageId: string
  amount: number
}): Promise<CreateCommissionResult> {
  const referrer = params.referrerEmail.toLowerCase().trim()
  const buyer = params.buyerEmail.toLowerCase().trim()

  // 自购禁止
  if (!referrer || !buyer || referrer === buyer) {
    return { created: false, reason: 'self_purchase' }
  }

  const commission = Math.round(params.amount * COMMISSION_RATE * 100) / 100
  if (!Number.isFinite(commission) || commission <= 0) {
    return { created: false, reason: 'self_purchase' }
  }

  await initTable()
  const s = await getSql()

  const orderId = params.orderId ? params.orderId : null
  const inserted = await withRetry(() => s`
    INSERT INTO referral_commissions (code, referrer_email, buyer_email, payment_id, order_id, package_id, amount, commission)
    VALUES (${params.code.toUpperCase()}, ${referrer}, ${buyer}, ${params.paymentId}, ${orderId}, ${params.packageId}, ${params.amount}, ${commission})
    ON CONFLICT (payment_id) DO NOTHING
    RETURNING commission
  `)
  if (!inserted || inserted.length === 0) {
    return { created: false, reason: 'duplicate' }
  }
  return { created: true, commission }
}

/** 按 checkout_id（payment_id）撤销佣金（pending → voided）。 */
export async function voidCommission(paymentId: string): Promise<void> {
  if (!paymentId) return
  await initTable()
  const s = await getSql()
  await withRetry(() => s`
    UPDATE referral_commissions
    SET status = 'voided'
    WHERE payment_id = ${paymentId} AND status = 'pending'
  `)
}

/** 按 order_id 撤销佣金（pending → voided）。用于 chargeback/dispute（无 checkout.id，只有 order id）。 */
export async function voidCommissionByOrder(orderId: string): Promise<void> {
  if (!orderId) return
  await initTable()
  const s = await getSql()
  await withRetry(() => s`
    UPDATE referral_commissions
    SET status = 'voided'
    WHERE order_id = ${orderId} AND status = 'pending'
  `)
}

/** 惰性结算：保护期（60 天）届满且仍为 pending 的佣金 → settled。返回结算笔数。 */
export async function settleDueCommissions(): Promise<number> {
  await initTable()
  const s = await getSql()
  const rows = await withRetry(() => s`
    UPDATE referral_commissions
    SET status = 'settled', settled_at = NOW()
    WHERE status = 'pending' AND created_at <= NOW() - INTERVAL '60 days'
    RETURNING id
  `)
  return (rows as Array<unknown>).length
}

// ── 余额 / 概览 ──

export interface CommissionOverview {
  referralCode: string | null
  referralLink: string | null
  settled: number
  pending: number
  voided: number
  totalEarned: number // settled + pending（可预期总收益）
  commissions: CommissionItem[]
}

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  )
}

/**
 * 查询推荐人佣金概览（先惰性结算到期佣金，再汇总）。
 * 返回推荐码、推荐链接、settled/pending/voided 余额与最近明细。
 */
export async function getCommissionOverview(email: string): Promise<CommissionOverview> {
  const key = email.toLowerCase().trim()
  if (!key) {
    return { referralCode: null, referralLink: null, settled: 0, pending: 0, voided: 0, totalEarned: 0, commissions: [] }
  }

  await settleDueCommissions()
  await initTable()
  const s = await getSql()

  const code = await getOrCreateReferralCode(key)
  const link = code ? `${appBaseUrl()}/?ref=${code}` : null

  const agg = await withRetry(() => s`
    SELECT
      COALESCE(SUM(commission) FILTER (WHERE status = 'settled'), 0)::float AS settled,
      COALESCE(SUM(commission) FILTER (WHERE status = 'pending'), 0)::float AS pending,
      COALESCE(SUM(commission) FILTER (WHERE status = 'voided'), 0)::float AS voided
    FROM referral_commissions
    WHERE referrer_email = ${key}
  `)

  const rows = await withRetry(() => s`
    SELECT id, referrer_email, buyer_email, package_id, amount, commission, status, created_at, settled_at
    FROM referral_commissions
    WHERE referrer_email = ${key}
    ORDER BY created_at DESC
    LIMIT 50
  `)

  const a = agg[0] as Record<string, unknown> | undefined
  const settled = Number(a?.settled || 0)
  const pending = Number(a?.pending || 0)
  const voided = Number(a?.voided || 0)

  const commissions: CommissionItem[] = (rows as Array<Record<string, unknown>>).map(r => ({
    id: Number(r.id),
    referrer_email: String(r.referrer_email),
    buyer_email: String(r.buyer_email),
    package_id: String(r.package_id),
    amount: Number(r.amount),
    commission: Number(r.commission),
    status: r.status as CommissionStatus,
    created_at: String(r.created_at),
    settled_at: r.settled_at ? String(r.settled_at) : null,
  }))

  return {
    referralCode: code,
    referralLink: link,
    settled,
    pending,
    voided,
    totalEarned: settled + pending,
    commissions,
  }
}
