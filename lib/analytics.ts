/**
 * Analytics — event recording + aggregation queries.
 * PostgreSQL (Neon) only. Requires DATABASE_URL.
 *
 * 时区策略：所有"今日/本周/本月"边界和按日聚合均基于 Asia/Shanghai (UTC+8)，
 * 避免 Vercel 默认 UTC 导致用户感知的"今日"错位 8 小时。
 */

import type { NeonQueryFunction } from '@neondatabase/serverless'
import crypto from 'crypto'

// ── Types ──

export type EventType = 'page_view' | 'search' | 'evaluate_start' | 'evaluate_done'
  | 'paywall_view' | 'paywall_click' | 'purchase' | 'api_error'

export interface AnalyticsEvent {
  id?: number
  event_type: EventType
  path?: string
  username?: string
  email?: string
  metadata?: Record<string, unknown>
  ip_hash?: string
  user_agent?: string
  referrer?: string
  session_id?: string | null
  created_at: string
}

// ── Config ──

const DATABASE_URL = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').replace(/\s+/g, '')
const TIMEZONE = 'Asia/Shanghai'

// ip_hash HMAC 密钥（防止 sha256 截断被彩虹表反查）
const IP_HMAC_KEY = process.env.IP_HASH_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    console.error('[analytics] ⚠️  IP_HASH_SECRET not set in production — IP hashes are reversible with default key. Set the IP_HASH_SECRET environment variable.')
  }
  return 'tokvalue-ip-hmac-v1'
})()

// ── DB init ──

let sql: NeonQueryFunction<false, false> | null = null
let dbReady = false
let dbInitPromise: Promise<boolean> | null = null

async function initDb(): Promise<boolean> {
  if (dbReady) return true
  if (dbInitPromise) return dbInitPromise

  dbInitPromise = (async () => {
    if (!DATABASE_URL) {
      console.error('[analytics] DATABASE_URL is not configured')
      return false
    }
    try {
      const { neon } = await import('@neondatabase/serverless')
      sql = neon(DATABASE_URL)
      // CREATE TABLE IF NOT EXISTS — 幂等
      await sql`
        CREATE TABLE IF NOT EXISTS analytics_events (
          id SERIAL PRIMARY KEY,
          event_type TEXT,
          path TEXT,
          username TEXT,
          email TEXT,
          metadata JSONB,
          ip_hash TEXT,
          user_agent TEXT,
          referrer TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `
      // 幂等列迁移：补齐历史表可能缺失的列（CREATE TABLE IF NOT EXISTS 不会改已有表）
      await sql`ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS event_type TEXT`
      await sql`ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS session_id TEXT`
      await sql`ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS path TEXT`
      await sql`ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS username TEXT`
      await sql`ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS email TEXT`
      await sql`ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS metadata JSONB`
      await sql`ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS ip_hash TEXT`
      await sql`ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS user_agent TEXT`
      await sql`ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS referrer TEXT`
      await sql`ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS hostname TEXT`
      // 旧表可能存在 event_name 列（历史 schema），所有读写已统一为 event_type。
      // 这里仅在列存在时清理 NOT NULL 约束，避免历史 INSERT 失败；列不存在时静默跳过。
      // 注意：不再做 UPDATE event_name（列不存在时会抛错导致 initDb 整体失败）。
      try { await sql`ALTER TABLE analytics_events ALTER COLUMN event_name DROP NOT NULL` } catch { /* 列不存在，无需迁移 */ }
      // 确保 session_id 可为 null（服务端事件无客户端 session）
      try { await sql`ALTER TABLE analytics_events ALTER COLUMN session_id DROP NOT NULL` } catch { /* 已可空 */ }
      await sql`CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics_events(event_type)`
      await sql`CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics_events(created_at)`
      await sql`CREATE INDEX IF NOT EXISTS idx_analytics_hostname ON analytics_events(hostname)`

      await sql`
        CREATE TABLE IF NOT EXISTS admin_audit_log (
          id SERIAL PRIMARY KEY,
          action TEXT NOT NULL,
          target_email TEXT,
          credits INTEGER,
          reason TEXT,
          operator TEXT DEFAULT 'admin',
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `

      // credit_balances 表由 lib/credits-server.ts 统一管理，此处不再重复建表
      // 但确保 disabled 列存在（credits-server 可能还未建表）
      try {
        await sql`ALTER TABLE credit_balances ADD COLUMN IF NOT EXISTS disabled BOOLEAN NOT NULL DEFAULT false`
      } catch { /* 表尚未创建时忽略 */ }

      dbReady = true
      console.log('[analytics] Postgres init succeeded')
      return true
    } catch (err) {
      // ── 关键修复：失败时清除缓存，允许下次请求重试 ──
      console.error('[analytics] Postgres init failed:', err instanceof Error ? err.message : String(err))
      sql = null
      dbInitPromise = null
      return false
    }
  })()

  return dbInitPromise
}

// ── 时区边界工具 ──

/**
 * 计算 Asia/Shanghai 时区的今日/本周/本月起始时间（UTC ISO 字符串）。
 * Vercel 默认 TZ=UTC，直接用 new Date(y,m,d) 得到的是 UTC 边界，
 * 上海用户在 00:00-08:00 会感知到"今日"错位。
 */
function shanghaiBoundaries() {
  const now = new Date()
  // 上海当前时间的各分量
  const shanghaiNow = new Date(now.toLocaleString('en-US', { timeZone: TIMEZONE }))
  const year = shanghaiNow.getFullYear()
  const month = shanghaiNow.getMonth()
  const date = shanghaiNow.getDate()

  // 上海今日 00:00 对应的 UTC 时间
  const todayStart = new Date(Date.UTC(year, month, date, -8, 0, 0))
  // 上海本月 1 日 00:00
  const monthStart = new Date(Date.UTC(year, month, 1, -8, 0, 0))
  // 滚动 7×24h
  const weekStart = new Date(now.getTime() - 7 * 86400000)

  return {
    todayStart: todayStart.toISOString(),
    weekStart: weekStart.toISOString(),
    monthStart: monthStart.toISOString(),
  }
}

// ── Bot Filtering ──

const BOT_PATTERNS = [
  /bot/i, /crawl/i, /spider/i, /fetch/i, /curl/i, /wget/i,
  /lighthouse/i, /pagespeed/i, /gtmetrix/i,
  /semrush/i, /ahrefs/i, /seznami/i, /sistrix/i,
  /monitor/i, /pingdom/i, /uptimerobot/i, /checkmk/i, /nagios/i,
  /w3c/i, /headless/i, /puppeteer/i, /playwright/i, /selenium/i,
  /chrome-lighthouse/i,
  /whatsapp/i, /facebookexternalhit/i, /embedder/i,
  /preview/i, /vercel-deployment/i, /edge-function/i,
  /axios/i, /go-http/i, /python-requests/i,
  /java\/|libwww-perl|php\//i,
  /^-$/,
]

const MIN_BROWSER_UA_LENGTH = 20

/**
 * 判断是否应跳过该事件（bot/crawler/preview 等非人类流量）。
 * 仅过滤 page_view 事件，其他事件（search/evaluate/purchase 等）不过滤。
 */
export function shouldSkipEvent(userAgent: string): boolean {
  if (!userAgent || userAgent.length < MIN_BROWSER_UA_LENGTH) return true
  return BOT_PATTERNS.some(p => p.test(userAgent))
}

/**
 * 归一化 hostname：将 Vercel preview/branch URL 映射到生产域名。
 * 这样不同 preview 环境的访问会被正确聚合。
 */
export function normalizeHostname(host: string): string {
  if (!host) return PROD_HOSTNAME
  const hostname = host.split(':')[0].toLowerCase()
  const clean = hostname.replace(/^www\./, '')
  const VERCEL_SUFFIXES = ['.vercel.app', '.vercel.dev']
  if (VERCEL_SUFFIXES.some(s => clean.endsWith(s))) {
    return PROD_HOSTNAME
  }
  return clean
}

const PROD_HOSTNAME = process.env.NEXT_PUBLIC_APP_URL
  ? (() => { try { return new URL(process.env.NEXT_PUBLIC_APP_URL).hostname } catch { return 'tokvalue.com' } })()
  : 'tokvalue.com'

/**
 * 归一化 referrer URL：将 Vercel preview 来源统一归到生产域名。
 * 如果 referrer 归一化后是自己站的域名（站内导航），清空为"直接访问"。
 */
export function normalizeReferrer(referrer: string): string {
  if (!referrer) return ''
  try {
    const url = new URL(referrer)
    const normalized = normalizeHostname(url.host)
    // 如果是自己站内导航，归为"直接访问"，避免污染流量来源统计
    if (normalized === PROD_HOSTNAME) {
      return ''
    }
    return referrer
  } catch {
    return referrer
  }
}

/**
 * 写入事件到 analytics_events 表。
 * 用于无 HTTP request 上下文的场景（如 webhook、cron）。
 * 有 request 时优先用 recordEventFromRequest() 以自动填充 IP/UA/referrer。
 */
export async function recordEvent(event: Omit<AnalyticsEvent, 'id' | 'created_at'>): Promise<void> {
  const useDb = await initDb()
  if (!useDb || !sql) {
    console.error('[analytics] recordEvent skipped — DB not ready:', event.event_type)
    return
  }
  await sql`
    INSERT INTO analytics_events (event_type, path, username, email, metadata, ip_hash, user_agent, referrer, session_id)
    VALUES (${event.event_type}, ${event.path || null}, ${event.username || null},
      ${event.email || null}, ${JSON.stringify(event.metadata || {})}::jsonb,
      ${event.ip_hash || null}, ${event.user_agent || null}, ${event.referrer || null},
      ${event.session_id || null})
  `
}

/**
 * 从 NextRequest 中自动提取 IP/UA/referrer 并写入事件。
 * 所有 API 路由应优先使用此函数，确保埋点数据完整。
 *
 * 注意：浏览器 fetch 自动设置的 `Referer` header 是当前页面 URL（同源时），
 * 不是外部来源。对于 page_view 等需要追踪外部来源的事件，调用方应通过
 * event.referrer 显式传入 document.referrer，覆盖 header 值。
 */
export async function recordEventFromRequest(
  req: Request,
  event: Omit<AnalyticsEvent, 'id' | 'created_at' | 'ip_hash' | 'user_agent' | 'referrer'> & {
    referrer?: string
  }
): Promise<void> {
  const forwarded = req.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : '0.0.0.0'
  return recordEvent({
    ...event,
    ip_hash: hashIp(ip),
    user_agent: req.headers.get('user-agent') || undefined,
    // 显式传入的 referrer 优先（client 端 document.referrer 才是真实外部来源）
    referrer: event.referrer || req.headers.get('referer') || undefined,
  })
}

// ── Record Audit Log ──

export async function recordAuditLog(entry: {
  action: string
  target_email: string
  credits: number
  reason: string
}): Promise<void> {
  const useDb = await initDb()
  if (!useDb || !sql) {
    console.error('[analytics] recordAuditLog skipped — DB not ready')
    return
  }
  await sql`
    INSERT INTO admin_audit_log (action, target_email, credits, reason)
    VALUES (${entry.action}, ${entry.target_email}, ${entry.credits}, ${entry.reason})
  `
}

// ── Query: Stats Overview ──

export interface ApiErrorStats {
  errorsToday: number
  errorsMonth: number
  errorsTotal: number
  byCode: { code: string; count: number }[]
}

export interface StatsOverview {
  totalRevenue: number
  revenueToday: number
  revenueWeek: number
  revenueMonth: number
  totalPayers: number
  payersToday: number
  payersWeek: number
  payersMonth: number
  evaluationsToday: number
  evaluationsWeek: number
  evaluationsMonth: number
  remainingCredits: number
  apiErrors: ApiErrorStats
}

// 安全的 numeric 聚合：过滤非数字字符串，避免 ::numeric 抛错
const AMOUNT_EXPR = `CASE WHEN metadata->>'amount' ~ '^[0-9]+(\\\\.[0-9]+)?$' THEN (metadata->>'amount')::numeric ELSE 0 END`

export async function getStatsOverview(): Promise<StatsOverview> {
  const useDb = await initDb()
  const emptyErrors: ApiErrorStats = { errorsToday: 0, errorsMonth: 0, errorsTotal: 0, byCode: [] }
  if (!useDb || !sql) {
    return {
      totalRevenue: 0, revenueToday: 0, revenueWeek: 0, revenueMonth: 0,
      totalPayers: 0, payersToday: 0, payersWeek: 0, payersMonth: 0,
      evaluationsToday: 0, evaluationsWeek: 0, evaluationsMonth: 0,
      remainingCredits: 0,
      apiErrors: emptyErrors,
    }
  }

  const { todayStart, weekStart, monthStart } = shanghaiBoundaries()

  // 评估计数从 evaluations 表查询（单一事实源，避免双写不一致）
  const [purchaseTotal, purchaseToday, purchaseWeek, purchaseMonth,
    payerTotal, payerToday, payerWeek, payerMonth,
    evalToday, evalWeek, evalMonth] = await Promise.all([
    sql`SELECT COALESCE(SUM(${sql.unsafe(AMOUNT_EXPR)}), 0) as total FROM analytics_events WHERE event_type = 'purchase'`,
    sql`SELECT COALESCE(SUM(${sql.unsafe(AMOUNT_EXPR)}), 0) as today FROM analytics_events WHERE event_type = 'purchase' AND created_at >= ${todayStart}::timestamptz`,
    sql`SELECT COALESCE(SUM(${sql.unsafe(AMOUNT_EXPR)}), 0) as week FROM analytics_events WHERE event_type = 'purchase' AND created_at >= ${weekStart}::timestamptz`,
    sql`SELECT COALESCE(SUM(${sql.unsafe(AMOUNT_EXPR)}), 0) as month FROM analytics_events WHERE event_type = 'purchase' AND created_at >= ${monthStart}::timestamptz`,
    sql`SELECT COUNT(DISTINCT email) as total FROM analytics_events WHERE event_type = 'purchase'`,
    sql`SELECT COUNT(DISTINCT email) as today FROM analytics_events WHERE event_type = 'purchase' AND created_at >= ${todayStart}::timestamptz`,
    sql`SELECT COUNT(DISTINCT email) as week FROM analytics_events WHERE event_type = 'purchase' AND created_at >= ${weekStart}::timestamptz`,
    sql`SELECT COUNT(DISTINCT email) as month FROM analytics_events WHERE event_type = 'purchase' AND created_at >= ${monthStart}::timestamptz`,
    // 评估次数从 evaluations 表查（computed_at 字段）
    sql`SELECT COUNT(*) as today FROM evaluations WHERE computed_at >= ${todayStart}::timestamptz`,
    sql`SELECT COUNT(*) as week FROM evaluations WHERE computed_at >= ${weekStart}::timestamptz`,
    sql`SELECT COUNT(*) as month FROM evaluations WHERE computed_at >= ${monthStart}::timestamptz`,
  ])

  let remainingCredits = 0
  try {
    const creditRows = await sql`SELECT COALESCE(SUM(credits), 0) as total FROM credit_balances`
    remainingCredits = Number(creditRows[0]?.total) || 0
  } catch (err) {
    console.warn('[analytics] failed to query credit_balances:', err)
  }

  // API 错误统计
  let apiErrors: ApiErrorStats = emptyErrors
  try {
    apiErrors = await getApiErrorStats()
  } catch (err) {
    console.warn('[analytics] failed to query api_error stats:', err)
  }

  const row = (r: Record<string, unknown>, key: string) => Number(r[key]) || 0

  return {
    totalRevenue: row(purchaseTotal[0] as Record<string, unknown>, 'total'),
    revenueToday: row(purchaseToday[0] as Record<string, unknown>, 'today'),
    revenueWeek: row(purchaseWeek[0] as Record<string, unknown>, 'week'),
    revenueMonth: row(purchaseMonth[0] as Record<string, unknown>, 'month'),
    totalPayers: row(payerTotal[0] as Record<string, unknown>, 'total'),
    payersToday: row(payerToday[0] as Record<string, unknown>, 'today'),
    payersWeek: row(payerWeek[0] as Record<string, unknown>, 'week'),
    payersMonth: row(payerMonth[0] as Record<string, unknown>, 'month'),
    evaluationsToday: row(evalToday[0] as Record<string, unknown>, 'today'),
    evaluationsWeek: row(evalWeek[0] as Record<string, unknown>, 'week'),
    evaluationsMonth: row(evalMonth[0] as Record<string, unknown>, 'month'),
    remainingCredits,
    apiErrors,
  }
}

/** API 错误统计（今日/本月/总错误次数 + 按错误码分组 top 6） */
export async function getApiErrorStats(): Promise<ApiErrorStats> {
  const useDb = await initDb()
  if (!useDb || !sql) {
    return { errorsToday: 0, errorsMonth: 0, errorsTotal: 0, byCode: [] }
  }
  try {
    const { todayStart, monthStart } = shanghaiBoundaries()
    const [overviewRows, codeRows] = await Promise.all([
      sql`
        SELECT
          COUNT(*) FILTER (WHERE created_at >= ${todayStart}::timestamptz)::int AS errors_today,
          COUNT(*) FILTER (WHERE created_at >= ${monthStart}::timestamptz)::int AS errors_month,
          COUNT(*)::int AS errors_total
        FROM analytics_events
        WHERE event_type = 'api_error'
      `,
      sql`
        SELECT
          metadata->>'error_code' AS code,
          COUNT(*)::int AS count
        FROM analytics_events
        WHERE event_type = 'api_error'
          AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY metadata->>'error_code'
        ORDER BY count DESC
        LIMIT 6
      `,
    ])
    const o = overviewRows[0] || {}
    return {
      errorsToday: Number(o.errors_today) || 0,
      errorsMonth: Number(o.errors_month) || 0,
      errorsTotal: Number(o.errors_total) || 0,
      byCode: codeRows.map((r: Record<string, unknown>) => ({
        code: String(r.code || 'UNKNOWN'),
        count: Number(r.count) || 0,
      })),
    }
  } catch (err) {
    console.error('[analytics] getApiErrorStats failed:', err)
    return { errorsToday: 0, errorsMonth: 0, errorsTotal: 0, byCode: [] }
  }
}

// ── Query: Revenue by Day ──

export interface DailyRevenue {
  date: string
  amount: number
}

export async function getRevenueByDay(days: number): Promise<DailyRevenue[]> {
  const useDb = await initDb()
  if (!useDb || !sql) return []
  const since = new Date(Date.now() - days * 86400000).toISOString()

  // 按 Asia/Shanghai 时区的日期聚合（子查询先算日期，避免 GROUP BY 表达式不一致）
  const rows = await sql`
    SELECT date, COALESCE(SUM(amount), 0) as amount
    FROM (
      SELECT
        TO_CHAR((created_at AT TIME ZONE ${TIMEZONE})::date, 'YYYY-MM-DD') as date,
        ${sql.unsafe(AMOUNT_EXPR)} as amount
      FROM analytics_events
      WHERE event_type = 'purchase' AND created_at >= ${since}::timestamptz
    ) sub
    GROUP BY date
    ORDER BY date
  ` as Array<{ date: string; amount: string }>
  return fillDailyDays(days, Object.fromEntries(rows.map(r => [String(r.date), Number(r.amount)])))
}

// ── Date-range filler ──

/**
 * 生成最近 `days` 天（含今天，基于 Asia/Shanghai 时区）的连续日期序列，
 * 缺失日期用 0 填充，保证前端折线图 X 轴连续无断点。
 */
function fillDailyDays(days: number, valueByDate: Record<string, number>): DailyRevenue[] {
  const result: DailyRevenue[] = []
  const now = new Date()
  const shanghaiNow = new Date(now.toLocaleString('en-US', { timeZone: TIMEZONE }))
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(shanghaiNow.getFullYear(), shanghaiNow.getMonth(), shanghaiNow.getDate() - i)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    result.push({ date: dateStr, amount: Number(valueByDate[dateStr] || 0) })
  }
  return result
}

// ── Query: Payers by Day (cumulative distinct payers) ──

export interface DailyPayers {
  date: string
  count: number
}

/**
 * 累计付费用户数曲线：每个日期的值 = 截至该日已发生首购的 distinct email 数。
 * 查询所有历史首购日期（不限窗口），保证窗口起点之前的付费用户计入基线。
 */
export async function getPayersByDay(days: number): Promise<DailyPayers[]> {
  const useDb = await initDb()
  if (!useDb || !sql) return []

  // 每个付费用户的首购日期（全量，不限时间窗口）
  const rows = await sql`
    SELECT MIN(TO_CHAR((created_at AT TIME ZONE ${TIMEZONE})::date, 'YYYY-MM-DD')) as first_date
    FROM analytics_events
    WHERE event_type = 'purchase' AND email IS NOT NULL AND email <> ''
    GROUP BY email
  ` as Array<{ first_date: string }>

  const newByDate = new Map<string, number>()
  for (const r of rows) {
    const d = String(r.first_date || '')
    if (!d) continue
    newByDate.set(d, (newByDate.get(d) || 0) + 1)
  }

  // 计算窗口起点，累计基线 = 窗口起点之前的首购用户数
  const now = new Date()
  const shanghaiNow = new Date(now.toLocaleString('en-US', { timeZone: TIMEZONE }))
  const windowStartDate = new Date(shanghaiNow.getFullYear(), shanghaiNow.getMonth(), shanghaiNow.getDate() - (days - 1))
  const windowStartStr = `${windowStartDate.getFullYear()}-${String(windowStartDate.getMonth() + 1).padStart(2, '0')}-${String(windowStartDate.getDate()).padStart(2, '0')}`

  let cumulative = 0
  for (const [date, count] of newByDate) {
    if (date < windowStartStr) cumulative += count
  }

  // 逐日累加，填充连续日期
  const result: DailyPayers[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(shanghaiNow.getFullYear(), shanghaiNow.getMonth(), shanghaiNow.getDate() - i)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    cumulative += newByDate.get(dateStr) || 0
    result.push({ date: dateStr, count: cumulative })
  }
  return result
}

// ── Query: PV/UV by Day (daily timeseries) ──

export interface DailyPvUv {
  date: string
  pv: number
  uv: number
}

/**
 * 每日 PV/UV 时序：用 ip_hash 做 UV 去重（ip_hash 为空时回退 session_id），缺失日期填 0。
 */
export async function getPvuvByDay(days: number): Promise<DailyPvUv[]> {
  const useDb = await initDb()
  if (!useDb || !sql) return []
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const UV_COL = sql.unsafe("COALESCE(NULLIF(ip_hash, ''), session_id)")

  try {
    const rows = await sql`
      SELECT date, COUNT(*) as pv, COUNT(DISTINCT ${UV_COL}) as uv
      FROM (
        SELECT
          TO_CHAR((created_at AT TIME ZONE ${TIMEZONE})::date, 'YYYY-MM-DD') as date,
          ${UV_COL} as uv_id
        FROM analytics_events
        WHERE event_type = 'page_view' AND created_at >= ${since}::timestamptz
      ) sub
      GROUP BY date
      ORDER BY date
    ` as Array<{ date: string; pv: string; uv: string }>

    const valueByDate: Record<string, { pv: number; uv: number }> = {}
    for (const r of rows) valueByDate[String(r.date)] = { pv: Number(r.pv), uv: Number(r.uv) }

    const now = new Date()
    const shanghaiNow = new Date(now.toLocaleString('en-US', { timeZone: TIMEZONE }))
    const result: DailyPvUv[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(shanghaiNow.getFullYear(), shanghaiNow.getMonth(), shanghaiNow.getDate() - i)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const v = valueByDate[dateStr] || { pv: 0, uv: 0 }
      result.push({ date: dateStr, pv: v.pv, uv: v.uv })
    }
    return result
  } catch (err) {
    console.error('[analytics] getPvuvByDay query failed:', err instanceof Error ? err.message : String(err))
    return []
  }
}

// ── Query: Package Distribution ──

export interface PackageStat {
  id: string
  count: number
  revenue: number
}

export async function getRevenueByPackage(days: number): Promise<PackageStat[]> {
  const useDb = await initDb()
  if (!useDb || !sql) return []
  const since = new Date(Date.now() - days * 86400000).toISOString()

  const rows = await sql`
    SELECT metadata->>'package_id' as package_id, COUNT(*) as count,
      COALESCE(SUM(${sql.unsafe(AMOUNT_EXPR)}), 0) as revenue
    FROM analytics_events
    WHERE event_type = 'purchase' AND created_at >= ${since}::timestamptz
    GROUP BY metadata->>'package_id'
  ` as Array<{ package_id: string; count: string; revenue: string }>
  return rows.map(r => ({ id: r.package_id || 'unknown', count: Number(r.count), revenue: Number(r.revenue) }))
}

// ── Query: Audit Log ──

export interface AuditEntry {
  id: number
  action: string
  target_email: string
  credits: number
  reason: string
  created_at: string
}

export async function getAuditLog(limit = 50, offset = 0, action?: string): Promise<{ items: AuditEntry[]; total: number }> {
  const useDb = await initDb()
  if (!useDb || !sql) return { items: [], total: 0 }

  // 参数化查询，彻底避免 SQL 注入（不再使用 sql.unsafe 拼接 WHERE）
  if (action) {
    const [rows, countRow] = await Promise.all([
      sql`SELECT * FROM admin_audit_log WHERE action = ${action} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      sql`SELECT COUNT(*) as total FROM admin_audit_log WHERE action = ${action}`,
    ])
    const items = (rows as Array<Record<string, unknown>>).map(r => ({
      id: Number(r.id),
      action: String(r.action),
      target_email: String(r.target_email || ''),
      credits: Number(r.credits),
      reason: String(r.reason || ''),
      created_at: String(r.created_at),
    }))
    return { items, total: Number((countRow[0] as { total: string })?.total || 0) }
  }

  const [rows, countRow] = await Promise.all([
    sql`SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    sql`SELECT COUNT(*) as total FROM admin_audit_log`,
  ])
  const items = (rows as Array<Record<string, unknown>>).map(r => ({
    id: Number(r.id),
    action: String(r.action),
    target_email: String(r.target_email || ''),
    credits: Number(r.credits),
    reason: String(r.reason || ''),
    created_at: String(r.created_at),
  }))
  return { items, total: Number((countRow[0] as { total: string })?.total || 0) }
}

// ── Query: Recent Events (admin logs) ──

export interface EventLogItem {
  id: number
  eventType: string
  path: string
  username: string
  email: string
  metadata: Record<string, unknown> | null
  ipHash: string
  userAgent: string
  createdAt: string
}

export async function getRecentEvents(limit = 100, offset = 0): Promise<{ items: EventLogItem[]; total: number }> {
  const useDb = await initDb()
  if (!useDb || !sql) return { items: [], total: 0 }

  const [rows, countRow] = await Promise.all([
    sql`
      SELECT id, event_type, path, username, email, metadata, ip_hash, user_agent, created_at
      FROM analytics_events
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `,
    sql`SELECT COUNT(*) as total FROM analytics_events`,
  ])

  const items = (rows as Array<Record<string, unknown>>).map(r => ({
    id: Number(r.id),
    eventType: String(r.event_type || ''),
    path: String(r.path || ''),
    username: String(r.username || ''),
    email: String(r.email || ''),
    metadata: (r.metadata as Record<string, unknown>) || null,
    ipHash: String(r.ip_hash || ''),
    userAgent: String(r.user_agent || ''),
    createdAt: String(r.created_at),
  }))

  return { items, total: Number((countRow[0] as { total: string })?.total || 0) }
}

// ── Query: PV/UV ──

export interface PVUVData {
  totalPV: number
  totalUV: number
  pvToday: number
  uvToday: number
  pvWeek: number
  uvWeek: number
  pvMonth: number
  uvMonth: number
}

export async function getPVUV(): Promise<PVUVData> {
  const useDb = await initDb()
  if (!useDb || !sql) {
    return { totalPV: 0, totalUV: 0, pvToday: 0, uvToday: 0, pvWeek: 0, uvWeek: 0, pvMonth: 0, uvMonth: 0 }
  }

  const { todayStart, weekStart, monthStart } = shanghaiBoundaries()

  // UV 用 ip_hash 去重，ip_hash 为空时回退 session_id
  const UV_COL = sql.unsafe("COALESCE(NULLIF(ip_hash, ''), session_id)")

  // 连接抖动重试
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const [total, today, week, month] = await Promise.all([
        sql`SELECT COUNT(*) as pv, COUNT(DISTINCT ${UV_COL}) as uv FROM analytics_events WHERE event_type = 'page_view'`,
        sql`SELECT COUNT(*) as pv, COUNT(DISTINCT ${UV_COL}) as uv FROM analytics_events WHERE event_type = 'page_view' AND created_at >= ${todayStart}::timestamptz`,
        sql`SELECT COUNT(*) as pv, COUNT(DISTINCT ${UV_COL}) as uv FROM analytics_events WHERE event_type = 'page_view' AND created_at >= ${weekStart}::timestamptz`,
        sql`SELECT COUNT(*) as pv, COUNT(DISTINCT ${UV_COL}) as uv FROM analytics_events WHERE event_type = 'page_view' AND created_at >= ${monthStart}::timestamptz`,
      ]) as Array<Array<{ pv: string; uv: string }>>

      const num = (r: { pv: string; uv: string }) => ({ pv: Number(r.pv), uv: Number(r.uv) })
      const t = num(total[0]), td = num(today[0]), tw = num(week[0]), tm = num(month[0])

      return {
        totalPV: t.pv, totalUV: t.uv,
        pvToday: td.pv, uvToday: td.uv,
        pvWeek: tw.pv, uvWeek: tw.uv,
        pvMonth: tm.pv, uvMonth: tm.uv,
      }
    } catch (err) {
      if (attempt === 3) {
        console.error('[analytics] getPVUV query failed:', err instanceof Error ? err.message : String(err))
      } else {
        await new Promise(r => setTimeout(r, attempt * 400))
      }
    }
  }
  return { totalPV: 0, totalUV: 0, pvToday: 0, uvToday: 0, pvWeek: 0, uvWeek: 0, pvMonth: 0, uvMonth: 0 }
}

// ── Query: Users List ──

/** 批量查询用户已使用评估次数（从 credit_usage_logs 日志表查询） */
export async function getEvaluationCountsByUser(emails: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  if (!emails.length) return result
  const useDb = await initDb()
  if (!useDb || !sql) return result

  try {
    // 优先从 credit_usage_logs 表查询（权威数据源）
    const rows = await sql`
      SELECT email, COUNT(*)::int AS used
      FROM credit_usage_logs
      WHERE action = 'consume' AND reason = 'evaluate'
      GROUP BY email
    `
    for (const r of rows as Array<Record<string, unknown>>) {
      const email = String(r.email).toLowerCase().trim()
      const used = Number(r.used)
      if (email) result.set(email, used)
    }
    
    // 检查是否有历史数据需要迁移
    if (result.size === 0) {
      console.warn('[analytics] credit_usage_logs is empty, falling back to evaluations table')
      // 回退到旧表查询（迁移期间使用）
      const fallbackRows = await sql`
        SELECT evaluated_by AS email, COUNT(*)::int AS used
        FROM evaluations
        WHERE evaluated_by IS NOT NULL AND evaluated_by <> ''
        GROUP BY evaluated_by
      `
      for (const r of fallbackRows as Array<Record<string, unknown>>) {
        const email = String(r.email).toLowerCase().trim()
        const used = Number(r.used)
        if (email) result.set(email, used)
      }
    }
  } catch (err) {
    console.warn('[analytics] failed to query evaluation counts by user:', err)
  }
  return result
}

/** 数据一致性检查：积分余额与日志记录是否匹配 */
export async function checkCreditConsistency(): Promise<{
  email: string
  balance: number
  logCount: number
  expectedBalance: number
  consistent: boolean
}[]> {
  const useDb = await initDb()
  if (!useDb || !sql) return []

  try {
    // 查询所有用户的积分余额
    const balanceRows = await sql`SELECT email, credits, total_purchased FROM credit_balances`
    const results: Array<{
      email: string
      balance: number
      logCount: number
      expectedBalance: number
      consistent: boolean
    }> = []

    for (const row of balanceRows as Array<Record<string, unknown>>) {
      const email = String(row.email)
      const balance = Number(row.credits)
      const totalPurchased = Number(row.total_purchased || 0)

      // 查询该用户的所有日志记录（含 consume/refund/grant/admin_deduct）
      const logRows = await sql`
        SELECT
          SUM(CASE WHEN action = 'consume' THEN credits ELSE 0 END) as consumed,
          SUM(CASE WHEN action = 'refund' THEN credits ELSE 0 END) as refunded,
          SUM(CASE WHEN action = 'grant' THEN credits ELSE 0 END) as granted,
          SUM(CASE WHEN action = 'admin_deduct' THEN credits ELSE 0 END) as admin_deducted
        FROM credit_usage_logs
        WHERE email = ${email}
      `
      const consumed = Number((logRows[0] as Record<string, unknown>)?.consumed || 0)
      const refunded = Number((logRows[0] as Record<string, unknown>)?.refunded || 0)
      const granted = Number((logRows[0] as Record<string, unknown>)?.granted || 0)
      const adminDeducted = Number((logRows[0] as Record<string, unknown>)?.admin_deducted || 0)

      // 期望余额 = 购买总额 + 赠送 - 消费 + 退款 - 管理员扣减
      const expectedBalance = totalPurchased + granted - consumed + refunded - adminDeducted

      results.push({
        email,
        balance,
        logCount: consumed,
        expectedBalance,
        consistent: Math.abs(balance - expectedBalance) <= 1 // 允许1的误差（边界情况）
      })
    }
    return results
  } catch (err) {
    console.warn('[analytics] failed to check credit consistency:', err)
    return []
  }
}

export interface UserListItem {
  email: string
  hasPaid: boolean
  remainingCredits: number
  totalPurchased: number
  usedCredits: number
  verifiedAt: string
  lastPurchaseAt: string | null
  disabled: boolean
}

export async function getUsersList(): Promise<UserListItem[]> {
  const useDb = await initDb()
  if (!useDb || !sql) return []

  try {
    const rows = await sql`
      SELECT email, credits, total_purchased, purchases, verified_at, disabled
      FROM credit_balances
      ORDER BY total_purchased DESC, credits DESC
    `
    const emails = rows.map((r: Record<string, unknown>) => String(r.email))
    const usageMap = await getEvaluationCountsByUser(emails)
    return rows.map((r: Record<string, unknown>) => {
      const purchases = Array.isArray(r.purchases) ? r.purchases as Array<{ purchasedAt: number }> : []
      const lastPurchase = purchases.length > 0 ? purchases[0] : null
      const email = String(r.email)
      return {
        email,
        hasPaid: Number(r.total_purchased) > 0,
        remainingCredits: Number(r.credits),
        totalPurchased: Number(r.total_purchased),
        usedCredits: usageMap.get(email) ?? 0,
        verifiedAt: new Date(Number(r.verified_at)).toISOString(),
        lastPurchaseAt: lastPurchase ? new Date(lastPurchase.purchasedAt).toISOString() : null,
        disabled: r.disabled === true,
      }
    })
  } catch (err) {
    console.warn('[analytics] failed to query credit_balances for users list:', err)
    return []
  }
}

// ── Hash IP (HMAC-SHA256 防彩虹表反查) ──

export function hashIp(ip: string): string {
  return crypto.createHmac('sha256', IP_HMAC_KEY).update(ip).digest('hex').slice(0, 32)
}

// ── Query: Traffic Sources ──

export interface TrafficSource {
  source: string
  visitors: number
  pct: number
}

export async function getTrafficSources(days = 30): Promise<TrafficSource[]> {
  const useDb = await initDb()
  if (!useDb || !sql) return []
  const since = new Date(Date.now() - days * 86400000).toISOString()

  try {
    const UV_COL = sql.unsafe("COALESCE(NULLIF(ip_hash, ''), session_id)")
    const rows = await sql`
      SELECT
        COALESCE(NULLIF(referrer, ''), '直接访问') as source,
        COUNT(DISTINCT ${UV_COL}) as visitors
      FROM analytics_events
      WHERE event_type = 'page_view'
        AND created_at >= ${since}::timestamptz
        -- 过滤 Vercel preview 域名（历史数据兼容，新数据已在写入时归一化）
        AND (referrer IS NULL OR referrer NOT LIKE '%vercel.app%')
        AND (referrer IS NULL OR referrer NOT LIKE '%vercel.dev%')
      GROUP BY source
      ORDER BY visitors DESC
      LIMIT 20
    `
    const raw = rows.map((r: Record<string, unknown>) => ({
      source: classifyReferrer(String(r.source)),
      visitors: Number(r.visitors),
    }))
    const total = raw.reduce((s, r) => s + r.visitors, 0)
    if (total === 0 || raw.length === 0) return []

    // 合并相同来源（classifyReferrer 可能将多个 referrer 归到同一来源）
    const merged = new Map<string, number>()
    for (const r of raw) {
      merged.set(r.source, (merged.get(r.source) || 0) + r.visitors)
    }
    const result = Array.from(merged.entries())
      .map(([source, visitors]) => ({
        source,
        visitors,
        pct: Math.round((visitors / total) * 1000) / 10,
      }))
      .sort((a, b) => b.visitors - a.visitors)

    // 修正百分比和为 100（最后一条兜底）
    const sumPct = result.reduce((s, r) => s + r.pct, 0)
    if (result.length > 0 && sumPct !== 100) {
      result[result.length - 1].pct = Math.max(0, result[result.length - 1].pct + (100 - sumPct))
    }
    return result
  } catch (err) {
    console.warn('[analytics] failed to query traffic sources:', err)
    return []
  }
}

// 域名后缀匹配（避免 includes 子串误判）
function classifyReferrer(ref: string): string {
  if (!ref || ref === '直接访问') return '直接访问'

  let hostname: string
  try {
    hostname = new URL(ref).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ref.slice(0, 40)
  }

  const endsWith = (suffix: string) => hostname === suffix || hostname.endsWith('.' + suffix)
  if (endsWith('google.com') || hostname === 'google' || hostname.endsWith('.google')) return 'Google'
  if (endsWith('bing.com')) return 'Bing'
  if (endsWith('baidu.com')) return '百度'
  if (endsWith('twitter.com') || endsWith('x.com')) return 'X/Twitter'
  if (endsWith('facebook.com') || endsWith('fb.com')) return 'Facebook'
  if (endsWith('instagram.com')) return 'Instagram'
  if (endsWith('youtube.com')) return 'YouTube'
  if (endsWith('tiktok.com')) return 'TikTok'
  if (endsWith('reddit.com')) return 'Reddit'
  if (endsWith('linkedin.com')) return 'LinkedIn'
  if (endsWith('github.com')) return 'GitHub'
  if (hostname.includes('producthunt')) return 'Product Hunt'
  if (endsWith('duckduckgo.com')) return 'DuckDuckGo'
  if (hostname.includes('yandex')) return 'Yandex'
  return hostname
}
