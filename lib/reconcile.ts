// ── B7：credits / usage_events 每日对账（cron 触发）──
// ①余额对账：逐 email 比较 credit_balances.credits 与期望值
//   （total_purchased + granted − consumed + refunded − admin_deducted，聚合自
//   credit_usage_logs；公式与 analytics.ts checkCreditConsistency 一致，含 ±1 容差，
//   但用单条 GROUP BY 全量聚合而非逐 email 循环查询）。
// ②昨日口径对账：昨日 usage_events.quota_consumed 行数 vs 昨日
//   credit_usage_logs(action='consume', reason='evaluate') 行数（Asia/Shanghai 时区）。
// 结果 UPSERT 到 reconcile_results(run_date DATE PK, ok, detail JSONB)；
// 任何不一致 → sendAdminAlert 且 ok=false。

import type { NeonQueryFunction } from '@neondatabase/serverless'
import { sendAdminAlert } from './email'

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
        CREATE TABLE IF NOT EXISTS reconcile_results (
          run_date DATE PRIMARY KEY,
          ok BOOLEAN NOT NULL,
          detail JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
    })()
  }
  return initPromise
}

// detail 中最多保留的余额不一致明细条数（防止告警邮件/JSONB 过大）
const MAX_MISMATCH_ROWS = 100

/** 上海（UTC+8，无夏令时）昨日 [start, end) 的 UTC ISO 边界与上海当日日期键 */
function shanghaiYesterday(now: Date): { start: string; end: string; runDate: string } {
  const shanghaiNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
  const y = shanghaiNow.getFullYear()
  const m = shanghaiNow.getMonth()
  const d = shanghaiNow.getDate()
  // 上海今日 00:00 = UTC 前一日 16:00（固定 -8 小时偏移，同 analytics.ts）
  const todayStart = new Date(Date.UTC(y, m, d, -8, 0, 0))
  const yesterdayStart = new Date(Date.UTC(y, m, d - 1, -8, 0, 0))
  const runDate = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return { start: yesterdayStart.toISOString(), end: todayStart.toISOString(), runDate }
}

interface ReconcileDetail {
  ranAt: string
  yesterdayRange: { start: string; end: string }
  balance: {
    checked: number
    mismatchCount: number
    mismatches: Array<{ email: string; balance: number; expected: number; diff: number }>
    truncated: boolean
  }
  usage: {
    usageEventsQuotaConsumed: number
    creditLogsConsumeEvaluate: number
  }
}

export async function runReconcile(): Promise<{
  ok: boolean
  balanceMismatch: number
  usageMismatch: number
  detail: unknown
}> {
  if (!DATABASE_URL) {
    // 对账是正确性检查：DB 未配置属部署错误，抛错让 cron 路由 500 暴露问题
    throw new Error('[reconcile] DATABASE_URL not configured')
  }

  await initTable()
  const s = await getSql()
  const now = new Date()
  const { start, end, runDate } = shanghaiYesterday(now)

  // ①余额对账：单条 SQL 全量聚合（credit_balances LEFT JOIN credit_usage_logs）
  const balanceRows = await s`
    SELECT
      b.email AS email,
      b.credits AS credits,
      b.total_purchased AS total_purchased,
      COALESCE(SUM(CASE WHEN l.action = 'consume' THEN l.credits ELSE 0 END), 0) AS consumed,
      COALESCE(SUM(CASE WHEN l.action = 'refund' THEN l.credits ELSE 0 END), 0) AS refunded,
      COALESCE(SUM(CASE WHEN l.action = 'grant' THEN l.credits ELSE 0 END), 0) AS granted,
      COALESCE(SUM(CASE WHEN l.action = 'admin_deduct' THEN l.credits ELSE 0 END), 0) AS admin_deducted
    FROM credit_balances b
    LEFT JOIN credit_usage_logs l ON l.email = b.email
    GROUP BY b.email, b.credits, b.total_purchased
  `

  const mismatches: ReconcileDetail['balance']['mismatches'] = []
  let balanceChecked = 0
  for (const r of balanceRows as Array<Record<string, unknown>>) {
    balanceChecked++
    const balance = Number(r.credits)
    const totalPurchased = Number(r.total_purchased || 0)
    const consumed = Number(r.consumed || 0)
    const refunded = Number(r.refunded || 0)
    const granted = Number(r.granted || 0)
    const adminDeducted = Number(r.admin_deducted || 0)

    // 期望余额 = 购买总额 + 赠送 − 消费 + 退款 − 管理员扣减（容差 ±1，同 checkCreditConsistency）
    const expected = totalPurchased + granted - consumed + refunded - adminDeducted
    if (Math.abs(balance - expected) > 1) {
      mismatches.push({
        email: String(r.email),
        balance,
        expected,
        diff: balance - expected,
      })
    }
  }

  // ②昨日口径对账（Asia/Shanghai 边界）
  const [usageRows, logRows] = await Promise.all([
    s`
      SELECT COUNT(*)::int AS n
      FROM usage_events
      WHERE event_type = 'quota_consumed'
        AND created_at >= ${start}::timestamptz AND created_at < ${end}::timestamptz
    `,
    s`
      SELECT COUNT(*)::int AS n
      FROM credit_usage_logs
      WHERE action = 'consume' AND reason = 'evaluate'
        AND created_at >= ${start}::timestamptz AND created_at < ${end}::timestamptz
    `,
  ])
  const usageCount = Number((usageRows[0] as Record<string, unknown>)?.n || 0)
  const logCount = Number((logRows[0] as Record<string, unknown>)?.n || 0)

  const balanceMismatch = mismatches.length
  const usageMismatch = Math.abs(usageCount - logCount)
  const ok = balanceMismatch === 0 && usageMismatch === 0

  const detail: ReconcileDetail = {
    ranAt: now.toISOString(),
    yesterdayRange: { start, end },
    balance: {
      checked: balanceChecked,
      mismatchCount: balanceMismatch,
      mismatches: mismatches.slice(0, MAX_MISMATCH_ROWS),
      truncated: mismatches.length > MAX_MISMATCH_ROWS,
    },
    usage: {
      usageEventsQuotaConsumed: usageCount,
      creditLogsConsumeEvaluate: logCount,
    },
  }

  // 结果落库（同日重跑 UPSERT 覆盖）
  await s`
    INSERT INTO reconcile_results (run_date, ok, detail, created_at)
    VALUES (${runDate}::date, ${ok}, ${JSON.stringify(detail)}::jsonb, NOW())
    ON CONFLICT (run_date) DO UPDATE SET
      ok = EXCLUDED.ok,
      detail = EXCLUDED.detail,
      created_at = NOW()
  `

  if (!ok) {
    await sendAdminAlert('Reconcile mismatch', JSON.stringify(detail, null, 2))
  }

  return { ok, balanceMismatch, usageMismatch, detail }
}
