// lib/api-governance.ts
/**
 * API 治理：成本审计（api_call_logs / api_cost_daily）+ 免费预算闸 + 供应商熔断（provider_health，熔断函数后续任务追加）。
 *
 * 设计约定（对齐 lib/rate-limit.ts / lib/reviews.ts 既有模式）：
 * - 无 DATABASE_URL（本地 file/memory 开发模式）→ 全部 no-op / fail-open，行为与旧版一致
 * - env 每次调用动态读取（支持 Vercel 部署后热更新，不重启进程）
 * - 记账失败只 warn 不抛（治理模块自身故障不得中断评估主链路）
 * - 成本口径：仅成功调用计费（costUsd > 0 时同步累加 api_cost_daily）
 */
import type { NeonQueryFunction } from '@neondatabase/serverless'

const DATABASE_URL = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').replace(/\s+/g, '')

let sql: NeonQueryFunction<false, false> | null = null
let tablesReady = false
let initPromise: Promise<boolean> | null = null

async function getSql(): Promise<NeonQueryFunction<false, false> | null> {
  if (!DATABASE_URL) return null
  if (tablesReady && sql) return sql
  if (initPromise) return (await initPromise) ? sql : null
  initPromise = (async () => {
    try {
      const { neon } = await import('@neondatabase/serverless')
      sql = neon(DATABASE_URL)
      await sql`
        CREATE TABLE IF NOT EXISTS api_call_logs (
          id BIGSERIAL PRIMARY KEY,
          host TEXT NOT NULL,
          endpoint TEXT NOT NULL,
          ok BOOLEAN NOT NULL,
          duration_ms INTEGER,
          cost_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
          review_id TEXT,
          purchase_type TEXT,
          meta JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
      await sql`CREATE INDEX IF NOT EXISTS idx_api_call_logs_created ON api_call_logs(created_at)`
      await sql`
        CREATE TABLE IF NOT EXISTS api_cost_daily (
          date_key DATE PRIMARY KEY,
          cost_usd NUMERIC(10,4) NOT NULL DEFAULT 0
        )
      `
      await sql`
        CREATE TABLE IF NOT EXISTS provider_health (
          host TEXT PRIMARY KEY,
          consecutive_failures INTEGER NOT NULL DEFAULT 0,
          open_until TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
      tablesReady = true
      return true
    } catch (err) {
      console.warn('[api-governance] init failed (fail-open):', err instanceof Error ? err.message : String(err))
      sql = null
      initPromise = null
      return false
    }
  })()
  return (await initPromise) ? sql : null
}

// ── 纯函数（可测） ──

export function isOverBudget(
  dailyCostUsd: number,
  monthlyCostUsd: number,
  cfg: { dailyUsd: number; monthlyUsd: number },
): boolean {
  return dailyCostUsd >= cfg.dailyUsd || monthlyCostUsd >= cfg.monthlyUsd
}

export const BREAKER_FAILURE_THRESHOLD = 3

export function nextCooldownMs(consecutiveFailures: number): number {
  const base = 5 * 60_000
  const exp = Math.max(0, consecutiveFailures - BREAKER_FAILURE_THRESHOLD)
  return Math.min(base * 2 ** exp, 30 * 60_000)
}

export function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export function monthStartKey(now = new Date()): string {
  return now.toISOString().slice(0, 8) + '01'
}

// ── env 动态读取 ──

function readBudgetConfig() {
  return {
    dailyUsd: Number(process.env.FREE_DAILY_BUDGET_USD) > 0 ? Number(process.env.FREE_DAILY_BUDGET_USD) : 10,
    monthlyUsd: Number(process.env.FREE_MONTHLY_BUDGET_USD) > 0 ? Number(process.env.FREE_MONTHLY_BUDGET_USD) : 150,
  }
}

export function readCostPerCallUsd(): number {
  const v = Number(process.env.RAPIDAPI_COST_PER_CALL_USD)
  return v > 0 ? v : 0.01
}

// ── 成本记账 ──

export interface ApiCallRecord {
  host: string
  endpoint: string
  ok: boolean
  durationMs?: number
  costUsd?: number
  reviewId?: string | null
  purchaseType?: string | null
  meta?: Record<string, unknown>
}

export async function recordApiCall(record: ApiCallRecord): Promise<void> {
  const s = await getSql()
  if (!s) return
  try {
    await s`
      INSERT INTO api_call_logs (host, endpoint, ok, duration_ms, cost_usd, review_id, purchase_type, meta)
      VALUES (
        ${record.host}, ${record.endpoint}, ${record.ok},
        ${record.durationMs ?? null}, ${record.costUsd ?? 0},
        ${record.reviewId ?? null}, ${record.purchaseType ?? null},
        ${record.meta ? JSON.stringify(record.meta) : null}::jsonb
      )
    `
    const cost = record.ok ? (record.costUsd ?? 0) : 0
    if (cost > 0) {
      const key = todayKey()
      await s`
        INSERT INTO api_cost_daily (date_key, cost_usd)
        VALUES (${key}::date, ${cost})
        ON CONFLICT (date_key) DO UPDATE SET cost_usd = api_cost_daily.cost_usd + EXCLUDED.cost_usd
      `
    }
  } catch (err) {
    console.warn('[api-governance] recordApiCall failed (non-fatal):', err instanceof Error ? err.message : String(err))
  }
}

export async function getDailyCostUsd(): Promise<number> {
  const s = await getSql()
  if (!s) return 0
  try {
    const rows = await s`SELECT cost_usd FROM api_cost_daily WHERE date_key = ${todayKey()}::date`
    return Number(rows[0]?.cost_usd || 0)
  } catch {
    return 0
  }
}

export async function getMonthlyCostUsd(): Promise<number> {
  const s = await getSql()
  if (!s) return 0
  try {
    const rows = await s`
      SELECT COALESCE(SUM(cost_usd), 0) as total FROM api_cost_daily WHERE date_key >= ${monthStartKey()}::date
    `
    return Number(rows[0]?.total || 0)
  } catch {
    return 0
  }
}

/** 免费预算闸：触达日/月预算 → 免费生成暂停（付费不受影响）。DB 故障 fail-open（返回 false 放行）。 */
export async function isFreeBudgetExceeded(): Promise<boolean> {
  const [daily, monthly] = await Promise.all([getDailyCostUsd(), getMonthlyCostUsd()])
  return isOverBudget(daily, monthly, readBudgetConfig())
}

// ── Admin 查询 ──

export async function getRecentApiCalls(limit = 100, offset = 0): Promise<{ items: Array<Record<string, unknown>>; total: number }> {
  const s = await getSql()
  if (!s) return { items: [], total: 0 }
  try {
    const rows = await s`
      SELECT id, host, endpoint, ok, duration_ms, cost_usd, review_id, purchase_type, meta, created_at
      FROM api_call_logs ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}
    `
    const totalRows = await s`SELECT COUNT(*)::int as total FROM api_call_logs`
    return { items: rows as Array<Record<string, unknown>>, total: Number(totalRows[0]?.total || 0) }
  } catch (err) {
    console.warn('[api-governance] getRecentApiCalls failed:', err instanceof Error ? err.message : String(err))
    return { items: [], total: 0 }
  }
}

export async function getCostSummary(): Promise<{
  todayUsd: number; monthUsd: number; dailyBudgetUsd: number; monthlyBudgetUsd: number; freePaused: boolean
}> {
  const cfg = readBudgetConfig()
  const [todayUsd, monthUsd] = await Promise.all([getDailyCostUsd(), getMonthlyCostUsd()])
  return {
    todayUsd, monthUsd,
    dailyBudgetUsd: cfg.dailyUsd, monthlyBudgetUsd: cfg.monthlyUsd,
    freePaused: isOverBudget(todayUsd, monthUsd, cfg),
  }
}
