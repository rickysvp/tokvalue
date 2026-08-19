// ── B7：Day-10 召回（cron 触发）──
// 扫描 usage_events 中 review_completed 恰好落在 [NOW-11d, NOW-10d) 窗口（事件时长
// 年龄 ∈ [10d, 11d)，即事件时间 ∈ (NOW-11d, NOW-10d]）的用户，发送召回邮件。
// 排除：①该 email 在窗口事件之后又有任何 review_completed（已回访不再打扰）
//      ②recall_log 30 天内已发过（同 email 幂等）。
// Neon 表惰性初始化：模式同 share-store.ts / growth-task-states.ts。

import type { NeonQueryFunction } from '@neondatabase/serverless'
import { sendRecallEmail } from './email'

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
        CREATE TABLE IF NOT EXISTS recall_log (
          email TEXT PRIMARY KEY,
          sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
    })()
  }
  return initPromise
}

const DAY_MS = 86_400_000

/**
 * 召回候选筛选（纯函数，供测试）。
 *
 * 规则：按 email 取其最新一条 review_completed——
 * 该事件年龄 ∈ [10d, 11d)（事件时间 ∈ (now-11d, now-10d]，恰好 10 天前命中，
 * 9.99 天 / 11.01 天不命中）且该 email 不在 alreadySent 中 → 候选。
 * 最新一条不在窗口内即天然覆盖"回访排除"（回访后最新事件必然晚于窗口）。
 * 同 email 多 username 取最新一条的 username。
 */
export function selectRecallCandidates(
  events: Array<{ email: string; username: string; createdAt: string }>,
  alreadySent: Set<string>,
  now: Date
): Array<{ email: string; username: string }> {
  const windowStart = now.getTime() - 11 * DAY_MS // 排除（exclusive）
  const windowEnd = now.getTime() - 10 * DAY_MS   // 包含（inclusive）

  // email → 最新事件
  const latestByEmail = new Map<string, { username: string; t: number }>()
  for (const ev of events) {
    const t = new Date(ev.createdAt).getTime()
    if (Number.isNaN(t)) continue
    const email = ev.email.toLowerCase().trim()
    if (!email) continue
    const prev = latestByEmail.get(email)
    if (!prev || t > prev.t) latestByEmail.set(email, { username: ev.username, t })
  }

  const candidates: Array<{ email: string; username: string }> = []
  for (const [email, info] of latestByEmail) {
    if (alreadySent.has(email)) continue
    if (info.t > windowStart && info.t <= windowEnd) {
      candidates.push({ email, username: info.username })
    }
  }
  return candidates
}

/**
 * 执行一次召回扫描（cron 每日调用）。
 * 返回 candidates（命中数）/ sent（实际发出并落 recall_log）/ skipped（发送失败，次日重试）。
 */
export async function runRecall(): Promise<{ candidates: number; sent: number; skipped: number }> {
  if (!DATABASE_URL) {
    console.warn('[recall] DATABASE_URL not set — skip recall run')
    return { candidates: 0, sent: 0, skipped: 0 }
  }

  await initTable()
  const s = await getSql()
  const now = new Date()

  // 只取近 11 天事件即可：更早的事件不改变"最新一条是否在窗口内"的判定
  const rows = await s`
    SELECT email, username, created_at
    FROM usage_events
    WHERE event_type = 'review_completed'
      AND created_at > ${(new Date(now.getTime() - 11 * DAY_MS)).toISOString()}::timestamptz
  `
  const events = (rows as Array<Record<string, unknown>>).map(r => ({
    email: String(r.email),
    username: String(r.username),
    createdAt: new Date(r.created_at as string | Date).toISOString(),
  }))

  // 30 天内已发过的 email 不再打扰
  const sentRows = await s`
    SELECT email FROM recall_log WHERE sent_at > NOW() - INTERVAL '30 days'
  `
  const alreadySent = new Set(
    (sentRows as Array<Record<string, unknown>>).map(r => String(r.email).toLowerCase().trim())
  )

  const candidates = selectRecallCandidates(events, alreadySent, now)
  let sent = 0
  let skipped = 0

  for (const c of candidates) {
    const ok = await sendRecallEmail(c.email, c.username)
    if (!ok) {
      skipped++
      continue
    }
    sent++
    try {
      // UPSERT：刷新 sent_at，30 天冷却期后可再次召回
      await s`
        INSERT INTO recall_log (email, sent_at)
        VALUES (${c.email}, NOW())
        ON CONFLICT (email) DO UPDATE SET sent_at = NOW()
      `
    } catch (err) {
      // 邮件已发出但幂等记录失败：仅告警（次日可能重发一封，可接受）
      console.warn('[recall] recall_log write failed (email sent):', c.email, err instanceof Error ? err.message : String(err))
    }
  }

  return { candidates: candidates.length, sent, skipped }
}
