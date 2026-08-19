// lib/free-grants.ts
/**
 * 免费辅闸（B2）：同一 normalized_username 全网免费生成 ≤ 1 次。
 * key = normalizeForGrantKey(username)（见 lib/username-normalize.ts，变体归并）。
 * 原子消耗：INSERT ... ON CONFLICT DO NOTHING RETURNING —— 并发下只有一个请求拿到名额。
 * 无 DATABASE_URL → no-op（consume 恒 ok，本地开发不设防）。
 */
import type { NeonQueryFunction } from '@neondatabase/serverless'
import { normalizeForGrantKey } from '@/lib/username-normalize'

const DATABASE_URL = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').replace(/\s+/g, '')

let sql: NeonQueryFunction<false, false> | null = null
let tableReady = false
let initPromise: Promise<boolean> | null = null

async function getSql(): Promise<NeonQueryFunction<false, false> | null> {
  if (!DATABASE_URL) return null
  if (tableReady && sql) return sql
  if (initPromise) return (await initPromise) ? sql : null
  initPromise = (async () => {
    try {
      const { neon } = await import('@neondatabase/serverless')
      sql = neon(DATABASE_URL)
      await sql`
        CREATE TABLE IF NOT EXISTS free_review_grants (
          grant_key TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          email TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
      tableReady = true
      return true
    } catch (err) {
      console.warn('[free-grants] init failed (non-fatal):', err instanceof Error ? err.message : String(err))
      sql = null
      initPromise = null
      return false
    }
  })()
  return (await initPromise) ? sql : null
}

/** 非破坏性预检：该 username 是否已被免费生成过（不消耗名额）。 */
export async function hasFreeGrant(username: string): Promise<boolean> {
  const s = await getSql()
  if (!s) return false
  const key = normalizeForGrantKey(username)
  if (!key) return false
  try {
    const rows = await s`SELECT 1 FROM free_review_grants WHERE grant_key = ${key} LIMIT 1`
    return rows.length > 0
  } catch {
    return false // fail-open：治理故障不拦业务
  }
}

/**
 * 原子消耗：拿到名额返回 { ok: true }；已被消耗返回 { ok: false }。
 * DB 故障 fail-open（ok: true）——辅闸属成本防护，故障时放行由预算闸兜底。
 */
export async function consumeFreeGrant(
  username: string,
  email?: string,
): Promise<{ ok: boolean }> {
  const s = await getSql()
  if (!s) return { ok: true }
  const key = normalizeForGrantKey(username)
  if (!key) return { ok: true }
  const raw = username.trim().replace(/^@/, '').toLowerCase()
  try {
    const rows = await s`
      INSERT INTO free_review_grants (grant_key, username, email)
      VALUES (${key}, ${raw}, ${email ? email.toLowerCase().trim() : null})
      ON CONFLICT (grant_key) DO NOTHING
      RETURNING grant_key
    `
    return { ok: rows.length > 0 }
  } catch {
    return { ok: true }
  }
}
