// lib/snapshots.ts
/**
 * 24h 全局账号快照缓存（B2）：以 sec_uid 为主键存 fetchProfile 的 RawProfile 原始返回。
 * 命中 → 跳过 RapidAPI（evaluate 照常扣费/出报告）；username 改名后同账号仍命中（sec_uid 稳定）。
 * 无 DATABASE_URL → 全部 no-op（getFreshSnapshot 返回 null，行为同旧版直连 API）。
 */
import type { NeonQueryFunction } from '@neondatabase/serverless'
import type { RawProfile } from '@/types'

const DATABASE_URL = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').replace(/\s+/g, '')

export const SNAPSHOT_TTL_HOURS = 24

export interface FreshSnapshot {
  profile: RawProfile
  fetchedAt: string
  ageHours: number
}

// ── 纯函数 ──

export function snapshotAgeHours(fetchedAt: string | number | Date, now = Date.now()): number {
  const t = fetchedAt instanceof Date ? fetchedAt.getTime() : new Date(fetchedAt).getTime()
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY
  return (now - t) / 3_600_000
}

export function isSnapshotFresh(ageHours: number): boolean {
  return Number.isFinite(ageHours) && ageHours >= 0 && ageHours < SNAPSHOT_TTL_HOURS
}

// ── DB ──

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
        CREATE TABLE IF NOT EXISTS account_snapshots (
          sec_uid TEXT PRIMARY KEY,
          normalized_username TEXT NOT NULL,
          raw_profile JSONB NOT NULL,
          fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
      await sql`CREATE INDEX IF NOT EXISTS idx_account_snapshots_username ON account_snapshots(normalized_username)`
      tableReady = true
      return true
    } catch (err) {
      console.warn('[snapshots] init failed (non-fatal):', err instanceof Error ? err.message : String(err))
      sql = null
      initPromise = null
      return false
    }
  })()
  return (await initPromise) ? sql : null
}

/** 按 username 查新鲜快照（TTL 内）。miss / DB 不可用 → null。 */
export async function getFreshSnapshot(username: string): Promise<FreshSnapshot | null> {
  const s = await getSql()
  if (!s) return null
  const normalized = username.trim().replace(/^@/, '').toLowerCase()
  if (!normalized) return null
  try {
    const rows = await s`
      SELECT raw_profile, fetched_at FROM account_snapshots
      WHERE normalized_username = ${normalized}
        AND fetched_at > NOW() - (${SNAPSHOT_TTL_HOURS}::bigint * interval '1 hour')
      LIMIT 1
    `
    const row = rows[0] as { raw_profile: unknown; fetched_at: string } | undefined
    if (!row) return null
    const profile = (typeof row.raw_profile === 'string' ? JSON.parse(row.raw_profile) : row.raw_profile) as RawProfile
    const ageHours = snapshotAgeHours(row.fetched_at)
    if (!isSnapshotFresh(ageHours)) return null
    return { profile, fetchedAt: String(row.fetched_at), ageHours }
  } catch (err) {
    console.warn('[snapshots] getFreshSnapshot failed (non-fatal):', err instanceof Error ? err.message : String(err))
    return null
  }
}

/** fetchProfile 成功后落快照。无 secUid（个别供应商缺字段）→ 跳过。 */
export async function upsertSnapshot(profile: RawProfile): Promise<void> {
  const s = await getSql()
  if (!s) return
  const secUid = String(profile.secUid || '').trim()
  if (!secUid) return
  const normalized = profile.username.trim().replace(/^@/, '').toLowerCase()
  try {
    await s`
      INSERT INTO account_snapshots (sec_uid, normalized_username, raw_profile, fetched_at)
      VALUES (${secUid}, ${normalized}, ${JSON.stringify(profile)}::jsonb, NOW())
      ON CONFLICT (sec_uid) DO UPDATE SET
        normalized_username = EXCLUDED.normalized_username,
        raw_profile = EXCLUDED.raw_profile,
        fetched_at = NOW()
    `
  } catch (err) {
    console.warn('[snapshots] upsertSnapshot failed (non-fatal):', err instanceof Error ? err.message : String(err))
  }
}
