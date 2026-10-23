// 交易撮合 DB 层：3 张表惰性建表（沿用 CREATE TABLE IF NOT EXISTS 惯例）+ CRUD。
// 所有函数在服务端调用；联系方式字段只经详情接口的已解锁分支返回。
import type { NeonQueryFunction } from '@neondatabase/serverless'
import type { ListingInput, ListingSnapshot, ListingStatus } from './marketplace'
import { maskUsername } from './marketplace'

const DATABASE_URL = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').replace(/\s+/g, '')

let sql: NeonQueryFunction<false, false> | null = null

async function getSql(): Promise<NeonQueryFunction<false, false>> {
  if (!DATABASE_URL) throw new Error('[marketplace-db] DATABASE_URL is not set')
  if (sql) return sql
  const { neon } = await import('@neondatabase/serverless')
  sql = neon(DATABASE_URL)
  return sql
}

export interface ListingRow extends ListingSnapshot {
  id: string
  username: string
  sellerEmail: string
  askingPriceUsd: number
  description: string | null
  contactEmail: string
  socialType: string | null
  socialHandle: string | null
  status: ListingStatus
  reportCount: number
  createdAt: string
  updatedAt: string
}

let initPromise: Promise<void> | null = null
function ensureInit(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const s = await getSql()
      await s`
        CREATE TABLE IF NOT EXISTS marketplace_listings (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          seller_email TEXT NOT NULL,
          asking_price_usd INTEGER NOT NULL,
          description TEXT,
          contact_email TEXT NOT NULL,
          social_type TEXT,
          social_handle TEXT,
          snapshot_tier TEXT,
          snapshot_valuation_low INTEGER,
          snapshot_valuation_high INTEGER,
          snapshot_valuation_usd INTEGER,
          snapshot_followers INTEGER,
          snapshot_engagement_rate REAL,
          snapshot_evaluated_at TIMESTAMPTZ,
          refreshed_at TIMESTAMPTZ,
          status TEXT NOT NULL DEFAULT 'active',
          report_count INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )`
      await s`CREATE UNIQUE INDEX IF NOT EXISTS idx_listings_active_username ON marketplace_listings(username) WHERE status = 'active'`
      await s`CREATE INDEX IF NOT EXISTS idx_listings_status_created ON marketplace_listings(status, created_at DESC)`
      await s`CREATE INDEX IF NOT EXISTS idx_listings_seller ON marketplace_listings(seller_email)`
      // 数字编号：URL 形如 /marketplace/1009；1001-1008 保留给演示挂牌
      await s`CREATE SEQUENCE IF NOT EXISTS marketplace_listing_ids START 1009`
      await s`
        CREATE TABLE IF NOT EXISTS marketplace_unlocks (
          listing_id TEXT NOT NULL,
          buyer_email TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          PRIMARY KEY (listing_id, buyer_email)
        )`
      await s`
        CREATE TABLE IF NOT EXISTS marketplace_reports (
          id SERIAL PRIMARY KEY,
          listing_id TEXT NOT NULL,
          reporter_email TEXT NOT NULL,
          reason TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE (listing_id, reporter_email)
        )`
    })().catch(err => { initPromise = null; throw err })
  }
  return initPromise
}

function rowToListing(r: Record<string, unknown>): ListingRow {
  return {
    id: String(r.id), username: String(r.username), sellerEmail: String(r.seller_email),
    askingPriceUsd: Number(r.asking_price_usd), description: (r.description as string) ?? null,
    contactEmail: String(r.contact_email), socialType: (r.social_type as string) ?? null,
    socialHandle: (r.social_handle as string) ?? null,
    status: r.status as ListingStatus, reportCount: Number(r.report_count ?? 0),
    snapshotTier: (r.snapshot_tier as string) ?? null,
    snapshotValuationLow: r.snapshot_valuation_low == null ? null : Number(r.snapshot_valuation_low),
    snapshotValuationHigh: r.snapshot_valuation_high == null ? null : Number(r.snapshot_valuation_high),
    snapshotValuationUsd: r.snapshot_valuation_usd == null ? null : Number(r.snapshot_valuation_usd),
    snapshotFollowers: r.snapshot_followers == null ? null : Number(r.snapshot_followers),
    snapshotEngagementRate: r.snapshot_engagement_rate == null ? null : Number(r.snapshot_engagement_rate),
    snapshotEvaluatedAt: r.snapshot_evaluated_at == null ? null : String(r.snapshot_evaluated_at),
    createdAt: String(r.created_at), updatedAt: String(r.updated_at),
  }
}

// 公开字段投影——任何列表/未解锁响应都不得包含 contact_*；
// username 默认掩码中间部分，仅解锁者/卖家本人响应 revealUsername=true
export function toPublicListing(l: ListingRow, sellerMasked = true, revealUsername = false) {
  return {
    id: l.id, username: revealUsername ? l.username : maskUsername(l.username),
    sellerEmail: sellerMasked ? undefined : l.sellerEmail,
    askingPriceUsd: l.askingPriceUsd, description: l.description,
    status: l.status, snapshot: {
      tier: l.snapshotTier, valuationLow: l.snapshotValuationLow, valuationHigh: l.snapshotValuationHigh,
      valuationUsd: l.snapshotValuationUsd, followers: l.snapshotFollowers,
      engagementRate: l.snapshotEngagementRate, evaluatedAt: l.snapshotEvaluatedAt,
    },
    createdAt: l.createdAt,
  }
}

export async function createListing(input: ListingInput, snapshot: ListingSnapshot, sellerEmail: string): Promise<ListingRow> {
  await ensureInit()
  const s = await getSql()
  try {
    const rows = await s`
      INSERT INTO marketplace_listings (id, username, seller_email, asking_price_usd, description,
        contact_email, social_type, social_handle,
        snapshot_tier, snapshot_valuation_low, snapshot_valuation_high, snapshot_valuation_usd,
        snapshot_followers, snapshot_engagement_rate, snapshot_evaluated_at)
      VALUES (nextval('marketplace_listing_ids')::text, ${input.username}, ${sellerEmail}, ${input.askingPriceUsd}, ${input.description ?? null},
        ${input.contactEmail}, ${input.socialType}, ${(input.socialHandle ?? '').trim() || null},
        ${snapshot.snapshotTier}, ${snapshot.snapshotValuationLow}, ${snapshot.snapshotValuationHigh}, ${snapshot.snapshotValuationUsd},
        ${snapshot.snapshotFollowers}, ${snapshot.snapshotEngagementRate}, ${snapshot.snapshotEvaluatedAt ? new Date(snapshot.snapshotEvaluatedAt) : null})
      RETURNING *` as Array<Record<string, unknown>>
    return rowToListing(rows[0])
  } catch (err) {
    // 23505 = unique_violation：同一 username 已有 active listing
    if ((err as { code?: string }).code === '23505') throw new Error('LISTING_EXISTS_FOR_USERNAME')
    throw err
  }
}

export async function countActiveListingsByEmail(email: string): Promise<number> {
  await ensureInit()
  const s = await getSql()
  const rows = await s`SELECT COUNT(*)::int AS n FROM marketplace_listings WHERE seller_email = ${email} AND status = 'active'` as Array<{ n: number }>
  return Number(rows[0]?.n ?? 0)
}

export type ListingSort = 'latest' | 'valuation_desc' | 'valuation_asc' | 'followers_desc'

export async function listActiveListings(page: number, pageSize: number, sort: ListingSort, status: 'active' | 'sold' = 'active'): Promise<{ items: ListingRow[]; total: number }> {
  await ensureInit()
  const s = await getSql()
  const offset = (page - 1) * pageSize
  const countRows = await s`SELECT COUNT(*)::int AS n FROM marketplace_listings WHERE status = ${status}` as Array<{ n: number }>
  // neon tagged template 不能内联动态 ORDER BY 字符串，四种排序各写一条显式 SQL
  const rows = sort === 'valuation_desc'
    ? await s`
      SELECT * FROM marketplace_listings WHERE status = ${status}
      ORDER BY snapshot_valuation_usd DESC NULLS LAST LIMIT ${pageSize} OFFSET ${offset}` as Array<Record<string, unknown>>
    : sort === 'valuation_asc'
    ? await s`
      SELECT * FROM marketplace_listings WHERE status = ${status}
      ORDER BY snapshot_valuation_usd ASC NULLS LAST LIMIT ${pageSize} OFFSET ${offset}` as Array<Record<string, unknown>>
    : sort === 'followers_desc'
    ? await s`
      SELECT * FROM marketplace_listings WHERE status = ${status}
      ORDER BY snapshot_followers DESC NULLS LAST LIMIT ${pageSize} OFFSET ${offset}` as Array<Record<string, unknown>>
    : await s`
      SELECT * FROM marketplace_listings WHERE status = ${status}
      ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}` as Array<Record<string, unknown>>
  return { items: rows.map(rowToListing), total: Number(countRows[0]?.n ?? 0) }
}

export async function getListingById(id: string): Promise<ListingRow | null> {
  await ensureInit()
  const s = await getSql()
  const rows = await s`SELECT * FROM marketplace_listings WHERE id = ${id}` as Array<Record<string, unknown>>
  return rows.length ? rowToListing(rows[0]) : null
}

export async function getActiveListingByUsername(username: string): Promise<ListingRow | null> {
  await ensureInit()
  const s = await getSql()
  const rows = await s`SELECT * FROM marketplace_listings WHERE username = ${username} AND status = 'active' LIMIT 1` as Array<Record<string, unknown>>
  return rows.length ? rowToListing(rows[0]) : null
}

export async function getListingsBySeller(email: string): Promise<ListingRow[]> {
  await ensureInit()
  const s = await getSql()
  const rows = await s`SELECT * FROM marketplace_listings WHERE seller_email = ${email} ORDER BY created_at DESC` as Array<Record<string, unknown>>
  return rows.map(rowToListing)
}

export async function updateListing(id: string, sellerEmail: string, patch: { askingPriceUsd?: number; description?: string | null; action?: 'withdraw' | 'mark_sold' }): Promise<ListingRow | null> {
  await ensureInit()
  const s = await getSql()
  const existing = await getListingById(id)
  if (!existing || existing.sellerEmail !== sellerEmail) return null
  const status: ListingStatus = patch.action === 'withdraw' ? 'withdrawn' : patch.action === 'mark_sold' ? 'sold' : existing.status
  const price = patch.askingPriceUsd ?? existing.askingPriceUsd
  const desc = patch.description !== undefined ? patch.description : existing.description
  const rows = await s`
    UPDATE marketplace_listings SET asking_price_usd = ${price}, description = ${desc}, status = ${status}, updated_at = NOW()
    WHERE id = ${id} RETURNING *` as Array<Record<string, unknown>>
  return rows.length ? rowToListing(rows[0]) : null
}

export async function isUnlocked(listingId: string, email: string): Promise<boolean> {
  await ensureInit()
  const s = await getSql()
  const rows = await s`SELECT 1 FROM marketplace_unlocks WHERE listing_id = ${listingId} AND buyer_email = ${email} LIMIT 1`
  return rows.length > 0
}

// 幂等写解锁（webhook 与 claim 双通道共用；PK 冲突即视为已发放）
export async function recordUnlock(listingId: string, email: string): Promise<boolean> {
  await ensureInit()
  const s = await getSql()
  const rows = await s`
    INSERT INTO marketplace_unlocks (listing_id, buyer_email) VALUES (${listingId}, ${email})
    ON CONFLICT DO NOTHING RETURNING listing_id`
  return rows.length > 0
}

export async function getUnlocksByEmail(email: string): Promise<Array<{ listingId: string; username: string; contactEmail: string; socialType: string | null; socialHandle: string | null; createdAt: string }>> {
  await ensureInit()
  const s = await getSql()
  const rows = await s`
    SELECT u.listing_id, l.username, l.contact_email, l.social_type, l.social_handle, u.created_at
    FROM marketplace_unlocks u JOIN marketplace_listings l ON l.id = u.listing_id
    WHERE u.buyer_email = ${email} ORDER BY u.created_at DESC` as Array<Record<string, unknown>>
  return rows.map(r => ({
    listingId: String(r.listing_id), username: String(r.username),
    contactEmail: String(r.contact_email),
    socialType: (r.social_type as string) ?? null,
    socialHandle: (r.social_handle as string) ?? null,
    createdAt: String(r.created_at),
  }))
}

// 登记资格硬约束：evaluation_ownership 中存在 (email, username) 且 upgraded_at 非空（已升级付费完整报告）
export async function hasPaidReport(email: string, username: string): Promise<boolean> {
  await ensureInit()
  const s = await getSql()
  const rows = await s`
    SELECT upgraded_at FROM evaluation_ownership WHERE email = ${email} AND username = ${username} LIMIT 1` as Array<{ upgraded_at: unknown }>
  return rows.length > 0 && rows[0].upgraded_at != null
}

export async function addReport(listingId: string, reporterEmail: string, reason: string | null): Promise<{ reported: boolean; removed: boolean }> {
  await ensureInit()
  const s = await getSql()
  try {
    await s`INSERT INTO marketplace_reports (listing_id, reporter_email, reason) VALUES (${listingId}, ${reporterEmail}, ${reason})`
  } catch (err) {
    if ((err as { code?: string }).code === '23505') return { reported: false, removed: false } // 重复举报
    throw err
  }
  const rows = await s`
    UPDATE marketplace_listings SET report_count = report_count + 1,
      status = CASE WHEN report_count + 1 >= 3 THEN 'removed' ELSE status END,
      updated_at = NOW()
    WHERE id = ${listingId} RETURNING status` as Array<{ status: string }>
  const newStatus = String(rows[0]?.status ?? '')
  return { reported: true, removed: newStatus === 'removed' }
}
