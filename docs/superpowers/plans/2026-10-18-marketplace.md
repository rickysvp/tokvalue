# Marketplace（账号交易撮合）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增账号交易模块——付费完整报告的用户可挂牌自己的账号，其他用户 $3.99 解锁联系方式，平台纯信息撮合。

**Architecture:** 3 张新表（listings/unlocks/reports）+ 纯逻辑层 `lib/marketplace.ts` + DB 层 `lib/marketplace-db.ts` + 6 个 API 路由 + Creem `unlock1` 商品（webhook/claim 双通道幂等发放）+ 4 个前端页面（marketplace 列表/详情、sell、my）。估值数据登记时快照，不随重评变化。

**Tech Stack:** Next.js 15 App Router、Neon serverless SQL（tagged template）、jose JWT（lib/auth.ts）、Creem、Vitest、Tailwind、lucide-react。

**Spec:** `docs/superpowers/specs/2026-10-17-marketplace-design.md`

**验证命令约定:** 类型检查 `npx tsc --noEmit`；Lint `npx next lint`；单测 `npx vitest run <file>`。每个 Task 结束必须三条全绿再 commit。

**关键既有接口（写码时直接引用，勿重复造）:**
- `getSql()` — `lib/db.ts`，返回 neon tagged-template sql；用法 `const sql = await getSql(); await sql\`SELECT ...\``
- `getEvaluation(username)` — `lib/db.ts`，返回 camelCase `Evaluation | null`（类型在根目录 `types.ts:109`）
- `getBearerToken(req)` / `verifySessionToken(token) → { email } | null` — `lib/auth.ts:290-315`
- `checkIpRateLimit(key, { limit, windowHours }) → boolean` / `ipBucketKey(prefix, req)` / `rateLimitResponse(msg)` — `lib/rate-limit.ts:67,103`
- `storePendingPurchase(p)` / `getPendingPurchase(email)` / `claimPendingPurchase(email)` — `lib/credits-server.ts:181-233`
- `TIER_COLORS: Record<string,string>`（键 S/A/B/C/D/E/F）— `lib/tier.ts:1-18`
- `recordEventFromRequest(req, { event_type, email, metadata })` — `lib/analytics.ts`
- 客户端 `getSessionToken()` — `lib/credits-client.ts:28`
- 估值字段路径：`evaluation.businessValue.totalValue.{low,mid,high}`、`evaluation.metrics.engagementRate`、`evaluation.followerCount`、`evaluation.tier`、`evaluation.computedAt`

---

### Task 1: 纯逻辑层 lib/marketplace.ts（TDD）

**Files:**
- Create: `lib/marketplace.ts`
- Test: `lib/marketplace.test.ts`

- [x] **Step 1: 写失败测试**

创建 `lib/marketplace.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import {
  validateListingInput, buildSnapshot, shouldAutoRemove,
  UNLOCK_PRICE_USD, REPORT_REMOVE_THRESHOLD,
  type ListingInput,
} from './marketplace'
import type { Evaluation } from '../types'

const baseInput: ListingInput = {
  username: 'test.creator',
  askingPriceUsd: 1500,
  description: 'Growing fitness account',
  contactEmail: 'seller@example.com',
  socialType: 'discord',
  socialHandle: 'seller#1234',
}

describe('validateListingInput', () => {
  it('accepts valid input', () => {
    expect(validateListingInput(baseInput).ok).toBe(true)
  })
  it('accepts email-only input (no social)', () => {
    expect(validateListingInput({ ...baseInput, socialType: null, socialHandle: null }).ok).toBe(true)
  })
  it('rejects price below 1', () => {
    expect(validateListingInput({ ...baseInput, askingPriceUsd: 0 }).ok).toBe(false)
  })
  it('rejects price above 10,000,000', () => {
    expect(validateListingInput({ ...baseInput, askingPriceUsd: 10_000_001 }).ok).toBe(false)
  })
  it('rejects description over 500 chars', () => {
    expect(validateListingInput({ ...baseInput, description: 'x'.repeat(501) }).ok).toBe(false)
  })
  it('rejects invalid email', () => {
    expect(validateListingInput({ ...baseInput, contactEmail: 'not-an-email' }).ok).toBe(false)
  })
  it('rejects unknown socialType', () => {
    expect(validateListingInput({ ...baseInput, socialType: 'wechat' as never }).ok).toBe(false)
  })
  it('rejects socialHandle when socialType set but handle empty', () => {
    expect(validateListingInput({ ...baseInput, socialHandle: '  ' }).ok).toBe(false)
  })
})

describe('buildSnapshot', () => {
  const evalRow = {
    tier: 'A',
    followerCount: 120000,
    computedAt: '2026-10-01T00:00:00.000Z',
    metrics: { engagementRate: 4.2 },
    businessValue: { totalValue: { low: 8000, mid: 12000, high: 18000 } },
  } as unknown as Evaluation

  it('extracts tier/valuation/followers/engagement/evaluatedAt', () => {
    const s = buildSnapshot(evalRow)
    expect(s.snapshotTier).toBe('A')
    expect(s.snapshotValuationLow).toBe(8000)
    expect(s.snapshotValuationHigh).toBe(18000)
    expect(s.snapshotValuationUsd).toBe(12000)
    expect(s.snapshotFollowers).toBe(120000)
    expect(s.snapshotEngagementRate).toBeCloseTo(4.2)
    expect(s.snapshotEvaluatedAt).toBe('2026-10-01T00:00:00.000Z')
  })

  it('tolerates missing businessValue (null snapshot fields)', () => {
    const s = buildSnapshot({ ...evalRow, businessValue: undefined } as unknown as Evaluation)
    expect(s.snapshotValuationUsd).toBeNull()
  })
})

describe('shouldAutoRemove', () => {
  it('false below threshold', () => {
    expect(shouldAutoRemove(REPORT_REMOVE_THRESHOLD - 1)).toBe(false)
  })
  it('true at threshold', () => {
    expect(shouldAutoRemove(REPORT_REMOVE_THRESHOLD)).toBe(true)
  })
})

it('UNLOCK_PRICE_USD is 3.99', () => {
  expect(UNLOCK_PRICE_USD).toBe(3.99)
})
```

- [x] **Step 2: 跑测试确认失败**

Run: `npx vitest run lib/marketplace.test.ts`
Expected: FAIL（模块不存在）

- [x] **Step 3: 实现 lib/marketplace.ts**

```ts
// 交易撮合模块纯逻辑：常量、输入校验、估值快照提取（无 DB 依赖，可单测）
import type { Evaluation } from '../types'

export const UNLOCK_PACKAGE_ID = 'unlock1'
export const UNLOCK_PRICE_USD = 3.99
export const MAX_ACTIVE_LISTINGS_PER_EMAIL = 5
export const REPORT_REMOVE_THRESHOLD = 3
export const MAX_DESCRIPTION_LENGTH = 500
export const MIN_ASKING_PRICE = 1
export const MAX_ASKING_PRICE = 10_000_000

export const SOCIAL_TYPES = ['discord', 'whatsapp', 'telegram'] as const
export type SocialType = (typeof SOCIAL_TYPES)[number]

export const LISTING_STATUSES = ['active', 'sold', 'withdrawn', 'removed'] as const
export type ListingStatus = (typeof LISTING_STATUSES)[number]

export interface ListingInput {
  username: string
  askingPriceUsd: number
  description: string | null
  contactEmail: string
  socialType: SocialType | null
  socialHandle: string | null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateListingInput(input: ListingInput): { ok: true } | { ok: false; error: string } {
  if (!input.username || !/^[a-z0-9._]{2,24}$/.test(input.username)) {
    return { ok: false, error: 'INVALID_USERNAME' }
  }
  if (!Number.isFinite(input.askingPriceUsd) || input.askingPriceUsd < MIN_ASKING_PRICE || input.askingPriceUsd > MAX_ASKING_PRICE) {
    return { ok: false, error: 'INVALID_PRICE' }
  }
  if (input.description != null && input.description.length > MAX_DESCRIPTION_LENGTH) {
    return { ok: false, error: 'DESCRIPTION_TOO_LONG' }
  }
  if (!EMAIL_RE.test(input.contactEmail)) {
    return { ok: false, error: 'INVALID_CONTACT_EMAIL' }
  }
  if (input.socialType != null && !SOCIAL_TYPES.includes(input.socialType)) {
    return { ok: false, error: 'INVALID_SOCIAL_TYPE' }
  }
  if (input.socialType != null && (!input.socialHandle || !input.socialHandle.trim())) {
    return { ok: false, error: 'SOCIAL_HANDLE_REQUIRED' }
  }
  return { ok: true }
}

export interface ListingSnapshot {
  snapshotTier: string | null
  snapshotValuationLow: number | null
  snapshotValuationHigh: number | null
  snapshotValuationUsd: number | null
  snapshotFollowers: number | null
  snapshotEngagementRate: number | null
  snapshotEvaluatedAt: string | null
}

// 从 evaluations 行提取不可变估值快照；字段缺失时置 null，不抛错
export function buildSnapshot(e: Evaluation): ListingSnapshot {
  const tv = e.businessValue?.totalValue
  return {
    snapshotTier: e.tier ?? null,
    snapshotValuationLow: tv?.low ?? null,
    snapshotValuationHigh: tv?.high ?? null,
    snapshotValuationUsd: tv?.mid ?? null,
    snapshotFollowers: e.followerCount ?? null,
    snapshotEngagementRate: e.metrics?.engagementRate ?? null,
    snapshotEvaluatedAt: e.computedAt ? String(e.computedAt) : null,
  }
}

export function shouldAutoRemove(reportCount: number): boolean {
  return reportCount >= REPORT_REMOVE_THRESHOLD
}
```

- [x] **Step 4: 跑测试确认通过**

Run: `npx vitest run lib/marketplace.test.ts`
Expected: PASS（全部用例）

- [x] **Step 5: 类型检查 + 提交**

```bash
npx tsc --noEmit
git add lib/marketplace.ts lib/marketplace.test.ts
git commit -m "feat(marketplace): pure logic layer with validation and snapshot extraction"
```

---

### Task 2: DB 层 lib/marketplace-db.ts

**Files:**
- Create: `lib/marketplace-db.ts`

- [x] **Step 1: 实现（建表 + CRUD + 解锁 + 举报）**

```ts
// 交易撮合 DB 层：3 张表惰性建表（沿用 CREATE TABLE IF NOT EXISTS 惯例）+ CRUD。
// 所有函数在服务端调用；联系方式字段只经 getListingDetail 的已解锁分支返回。
import { getSql } from './db'
import { shouldAutoRemove, type ListingInput, type ListingSnapshot, type ListingStatus } from './marketplace'

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
      const sql = await getSql()
      await sql`
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
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_listings_active_username ON marketplace_listings(username) WHERE status = 'active'`
      await sql`CREATE INDEX IF NOT EXISTS idx_listings_status_created ON marketplace_listings(status, created_at DESC)`
      await sql`CREATE INDEX IF NOT EXISTS idx_listings_seller ON marketplace_listings(seller_email)`
      await sql`
        CREATE TABLE IF NOT EXISTS marketplace_unlocks (
          listing_id TEXT NOT NULL,
          buyer_email TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          PRIMARY KEY (listing_id, buyer_email)
        )`
      await sql`
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

// 公开字段投影——任何列表/未解锁响应都不得包含 contact_*
export function toPublicListing(l: ListingRow, sellerMasked = true) {
  return {
    id: l.id, username: l.username,
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
  const sql = await getSql()
  const id = crypto.randomUUID()
  try {
    const rows = await sql`
      INSERT INTO marketplace_listings (id, username, seller_email, asking_price_usd, description,
        contact_email, social_type, social_handle,
        snapshot_tier, snapshot_valuation_low, snapshot_valuation_high, snapshot_valuation_usd,
        snapshot_followers, snapshot_engagement_rate, snapshot_evaluated_at)
      VALUES (${id}, ${input.username}, ${sellerEmail}, ${input.askingPriceUsd}, ${input.description ?? null},
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
  const sql = await getSql()
  const rows = await sql`SELECT COUNT(*)::int AS n FROM marketplace_listings WHERE seller_email = ${email} AND status = 'active'` as Array<{ n: number }>
  return Number(rows[0]?.n ?? 0)
}

export type ListingSort = 'latest' | 'valuation_desc' | 'valuation_asc' | 'followers_desc'

export async function listActiveListings(page: number, pageSize: number, sort: ListingSort): Promise<{ items: ListingRow[]; total: number }> {
  await ensureInit()
  const sql = await getSql()
  const offset = (page - 1) * pageSize
  const orderClause = {
    valuation_desc: 'snapshot_valuation_usd DESC NULLS LAST',
    valuation_asc: 'snapshot_valuation_usd ASC NULLS LAST',
    followers_desc: 'snapshot_followers DESC NULLS LAST',
    latest: 'created_at DESC',
  }[sort]
  const countRows = await sql`SELECT COUNT(*)::int AS n FROM marketplace_listings WHERE status = 'active'` as Array<{ n: number }>
  const rows = await sql`
    SELECT * FROM marketplace_listings WHERE status = 'active'
    ORDER BY ${sql.raw ? sql.raw(orderClause) : undefined}` as Array<Record<string, unknown>>
  // 注：neon tagged template 不支持动态 ORDER BY，见 Step 1 备注——改用四分支显式 SQL
  void offset; void rows
  return { items: [], total: Number(countRows[0]?.n ?? 0) }
}

export async function getListingById(id: string): Promise<ListingRow | null> {
  await ensureInit()
  const sql = await getSql()
  const rows = await sql`SELECT * FROM marketplace_listings WHERE id = ${id}` as Array<Record<string, unknown>>
  return rows.length ? rowToListing(rows[0]) : null
}

export async function getActiveListingByUsername(username: string): Promise<ListingRow | null> {
  await ensureInit()
  const sql = await getSql()
  const rows = await sql`SELECT * FROM marketplace_listings WHERE username = ${username} AND status = 'active' LIMIT 1` as Array<Record<string, unknown>>
  return rows.length ? rowToListing(rows[0]) : null
}

export async function getListingsBySeller(email: string): Promise<ListingRow[]> {
  await ensureInit()
  const sql = await getSql()
  const rows = await sql`SELECT * FROM marketplace_listings WHERE seller_email = ${email} ORDER BY created_at DESC` as Array<Record<string, unknown>>
  return rows.map(rowToListing)
}

export async function updateListing(id: string, sellerEmail: string, patch: { askingPriceUsd?: number; description?: string | null; action?: 'withdraw' | 'mark_sold' }): Promise<ListingRow | null> {
  await ensureInit()
  const sql = await getSql()
  const existing = await getListingById(id)
  if (!existing || existing.sellerEmail !== sellerEmail) return null
  const status: ListingStatus = patch.action === 'withdraw' ? 'withdrawn' : patch.action === 'mark_sold' ? 'sold' : existing.status
  const price = patch.askingPriceUsd ?? existing.askingPriceUsd
  const desc = patch.description !== undefined ? patch.description : existing.description
  const rows = await sql`
    UPDATE marketplace_listings SET asking_price_usd = ${price}, description = ${desc}, status = ${status}, updated_at = NOW()
    WHERE id = ${id} RETURNING *` as Array<Record<string, unknown>>
  return rows.length ? rowToListing(rows[0]) : null
}

export async function isUnlocked(listingId: string, email: string): Promise<boolean> {
  await ensureInit()
  const sql = await getSql()
  const rows = await sql`SELECT 1 FROM marketplace_unlocks WHERE listing_id = ${listingId} AND buyer_email = ${email} LIMIT 1`
  return rows.length > 0
}

// 幂等写解锁（webhook 与 claim 双通道共用；PK 冲突即视为已发放）
export async function recordUnlock(listingId: string, email: string): Promise<boolean> {
  await ensureInit()
  const sql = await getSql()
  const rows = await sql`
    INSERT INTO marketplace_unlocks (listing_id, buyer_email) VALUES (${listingId}, ${email})
    ON CONFLICT DO NOTHING RETURNING listing_id`
  return rows.length > 0
}

export async function getUnlocksByEmail(email: string): Promise<Array<{ listingId: string; username: string; contactEmail: string; socialType: string | null; socialHandle: string | null; createdAt: string }>> {
  await ensureInit()
  const sql = await getSql()
  return await sql`
    SELECT u.listing_id, l.username, l.contact_email, l.social_type, l.social_handle, u.created_at
    FROM marketplace_unlocks u JOIN marketplace_listings l ON l.id = u.listing_id
    WHERE u.buyer_email = ${email} ORDER BY u.created_at DESC` as Array<Record<string, unknown>>
}

export async function addReport(listingId: string, reporterEmail: string, reason: string | null): Promise<{ reported: boolean; removed: boolean }> {
  await ensureInit()
  const sql = await getSql()
  try {
    await sql`INSERT INTO marketplace_reports (listing_id, reporter_email, reason) VALUES (${listingId}, ${reporterEmail}, ${reason})`
  } catch (err) {
    if ((err as { code?: string }).code === '23505') return { reported: false, removed: false } // 重复举报
    throw err
  }
  const rows = await sql`
    UPDATE marketplace_listings SET report_count = report_count + 1,
      status = CASE WHEN report_count + 1 >= 3 THEN 'removed' ELSE status END,
      updated_at = NOW()
    WHERE id = ${listingId} RETURNING status` as Array<{ status: string }>
  const newStatus = String(rows[0]?.status ?? '')
  return { reported: true, removed: shouldAutoRemove(0) ? false : newStatus === 'removed' }
}
```

**Step 1 备注（动态 ORDER BY 处理）:** neon 的 tagged template 不能内联 ORDER BY 字符串。`listActiveListings` 实现改为四种排序各写一条显式 SQL，示例（latest 分支）：

```ts
const rows = await sql`
  SELECT * FROM marketplace_listings WHERE status = 'active'
  ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}` as Array<Record<string, unknown>>
```

valuation_desc / valuation_asc / followers_desc 分别用 `ORDER BY snapshot_valuation_usd DESC NULLS LAST` / `ORDER BY snapshot_valuation_usd ASC NULLS LAST` / `ORDER BY snapshot_followers DESC NULLS LAST`，其余相同。删除上面带 `sql.raw` 的占位实现与 `void offset; void rows` 行，返回 `{ items: rows.map(rowToListing), total }`。

**addReport removed 判定修正:** 直接 `return { reported: true, removed: newStatus === 'removed' }`（删除对 shouldAutoRemove 的误用调用）。

- [x] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [x] **Step 3: 提交**

```bash
git add lib/marketplace-db.ts
git commit -m "feat(marketplace): db layer with listings/unlocks/reports"
```

---

### Task 3: 资格校验 + 挂牌 API

**Files:**
- Create: `app/api/marketplace/eligibility/route.ts`
- Create: `app/api/marketplace/listings/route.ts`

- [x] **Step 1: eligibility 路由**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getBearerToken, verifySessionToken } from '@/lib/auth'
import { getSql } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/marketplace/eligibility?username=xxx —— 当前登录用户是否可登记该账号
export async function GET(req: NextRequest) {
  const token = getBearerToken(req)
  if (!token) return NextResponse.json({ eligible: false, code: 'UNAUTHORIZED' }, { status: 401 })
  const payload = await verifySessionToken(token)
  if (!payload?.email) return NextResponse.json({ eligible: false, code: 'UNAUTHORIZED' }, { status: 401 })

  const username = String(req.nextUrl.searchParams.get('username') || '').toLowerCase().trim()
  if (!username) return NextResponse.json({ eligible: false, code: 'MISSING_USERNAME' }, { status: 400 })

  const sql = await getSql()
  const rows = await sql`
    SELECT upgraded_at FROM evaluation_ownership
    WHERE email = ${payload.email.toLowerCase()} AND username = ${username} LIMIT 1`
  const eligible = rows.length > 0 && rows[0].upgraded_at != null
  return NextResponse.json({ eligible, code: eligible ? 'OK' : 'LISTING_REQUIRES_PAID_REPORT' })
}
```

- [x] **Step 2: listings 路由（GET 公开列表 + POST 登记）**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getBearerToken, verifySessionToken } from '@/lib/auth'
import { getEvaluation } from '@/lib/db'
import { checkIpRateLimit, ipBucketKey, rateLimitResponse } from '@/lib/rate-limit'
import { validateListingInput, buildSnapshot, MAX_ACTIVE_LISTINGS_PER_EMAIL, type ListingInput, type SocialType } from '@/lib/marketplace'
import { createListing, countActiveListingsByEmail, listActiveListings, getActiveListingByUsername, toPublicListing } from '@/lib/marketplace-db'

export const dynamic = 'force-dynamic'

const SORTS = ['latest', 'valuation_desc', 'valuation_asc', 'followers_desc'] as const

// GET /api/marketplace/listings?page=1&pageSize=24&sort=latest —— 公开，无 contact 字段
export async function GET(req: NextRequest) {
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1', 10) || 1)
  const pageSize = Math.min(48, Math.max(1, parseInt(req.nextUrl.searchParams.get('pageSize') || '24', 10) || 24))
  const sortParam = req.nextUrl.searchParams.get('sort') || 'latest'
  const sort = (SORTS as readonly string[]).includes(sortParam) ? sortParam : 'latest'
  const { items, total } = await listActiveListings(page, pageSize, sort as typeof SORTS[number])
  return NextResponse.json({ items: items.map(l => toPublicListing(l)), total, page, pageSize })
}

// POST /api/marketplace/listings —— JWT + 付费报告资格
export async function POST(req: NextRequest) {
  const token = getBearerToken(req)
  if (!token) return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 })
  const payload = await verifySessionToken(token)
  if (!payload?.email) return NextResponse.json({ error: 'Invalid session', code: 'UNAUTHORIZED' }, { status: 401 })
  const email = payload.email.toLowerCase().trim()

  if (!(await checkIpRateLimit(ipBucketKey('marketplace-list', req), { limit: 10, windowHours: 1 }))) {
    return rateLimitResponse('Too many listing attempts, please try again later')
  }

  const body = await req.json().catch(() => ({}))
  const input: ListingInput = {
    username: String(body.username || '').toLowerCase().trim(),
    askingPriceUsd: Number(body.askingPriceUsd),
    description: body.description ? String(body.description).trim() : null,
    contactEmail: String(body.contactEmail || '').toLowerCase().trim(),
    socialType: (body.socialType as SocialType | undefined) || null,
    socialHandle: body.socialHandle ? String(body.socialHandle).trim() : null,
  }

  const validation = validateListingInput(input)
  if (!validation.ok) return NextResponse.json({ error: validation.error, code: validation.error }, { status: 400 })

  // 资格：ownership 且已升级付费完整报告
  const evaluation = await getEvaluation(input.username)
  if (!evaluation) return NextResponse.json({ error: 'Evaluate this account first', code: 'NO_EVALUATION' }, { status: 400 })

  if (await countActiveListingsByEmail(email) >= MAX_ACTIVE_LISTINGS_PER_EMAIL) {
    return NextResponse.json({ error: 'Listing limit reached', code: 'MAX_LISTINGS' }, { status: 403 })
  }
  if (await getActiveListingByUsername(input.username)) {
    return NextResponse.json({ error: 'This account is already listed', code: 'LISTING_EXISTS' }, { status: 409 })
  }

  try {
    const listing = await createListing(input, buildSnapshot(evaluation), email)
    return NextResponse.json({ ok: true, listing: toPublicListing(listing, false) }, { status: 201 })
  } catch (err) {
    if (err instanceof Error && err.message === 'LISTING_EXISTS_FOR_USERNAME') {
      return NextResponse.json({ error: 'This account is already listed', code: 'LISTING_EXISTS' }, { status: 409 })
    }
    console.error('[marketplace/listings] create failed:', err)
    return NextResponse.json({ error: 'Listing failed', code: 'LISTING_ERROR' }, { status: 500 })
  }
}
```

**注意:** 资格校验（ownership+upgraded_at）已由前端 eligibility 预检 + `/sell` 页面守卫完成；此处 POST 再查一次 ownership 防绕过——在 `createListing` 调用前补：

```ts
const { default: _unused } = {} as never // 占位说明，勿写入代码
```

实际做法：把 eligibility 的 SQL 抽为 `lib/marketplace-db.ts` 的导出函数（Task 2 追加）：

```ts
export async function hasPaidReport(email: string, username: string): Promise<boolean> {
  await ensureInit()
  const sql = await getSql()
  const rows = await sql`
    SELECT upgraded_at FROM evaluation_ownership WHERE email = ${email} AND username = ${username} LIMIT 1`
  return rows.length > 0 && rows[0].upgraded_at != null
}
```

listings POST 中 `if (!(await hasPaidReport(email, input.username))) return NextResponse.json({ error: 'Paid report required', code: 'LISTING_REQUIRES_PAID_REPORT' }, { status: 403 })`；eligibility 路由同样改调此函数（消除重复 SQL）。

- [x] **Step 3: 验证 + 提交**

```bash
npx tsc --noEmit && npx next lint
git add app/api/marketplace lib/marketplace-db.ts
git commit -m "feat(marketplace): eligibility and listing create/list APIs"
```

---

### Task 4: 详情 + 卖家操作 API

**Files:**
- Create: `app/api/marketplace/listings/[id]/route.ts`

- [x] **Step 1: 实现 GET/PATCH**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getBearerToken, verifySessionToken } from '@/lib/auth'
import { getListingById, isUnlocked, updateListing, toPublicListing } from '@/lib/marketplace-db'
import { validateListingInput } from '@/lib/marketplace'

export const dynamic = 'force-dynamic'

async function authEmail(req: NextRequest): Promise<string | null> {
  const token = getBearerToken(req)
  if (!token) return null
  const payload = await verifySessionToken(token)
  return payload?.email ? payload.email.toLowerCase().trim() : null
}

// GET —— 公开字段 + unlocked 状态；仅已解锁者附带联系方式
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const listing = await getListingById(params.id)
  if (!listing || listing.status === 'removed') {
    return NextResponse.json({ error: 'Listing not found', code: 'NOT_FOUND' }, { status: 404 })
  }
  const email = await authEmail(req)
  const isSeller = !!email && email === listing.sellerEmail
  const unlocked = !!email && (isSeller || (await isUnlocked(listing.id, email)))
  const pub = toPublicListing(listing, !isSeller)
  return NextResponse.json({
    listing: pub,
    unlocked,
    isSeller,
    ...(unlocked ? { contact: { email: listing.contactEmail, socialType: listing.socialType, socialHandle: listing.socialHandle } } : {}),
  })
}

// PATCH —— 仅卖家：改价/描述/withdraw/mark_sold
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const email = await authEmail(req)
  if (!email) return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 })
  const listing = await getListingById(params.id)
  if (!listing) return NextResponse.json({ error: 'Listing not found', code: 'NOT_FOUND' }, { status: 404 })
  if (listing.sellerEmail !== email) return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const patch: Parameters<typeof updateListing>[2] = {}
  if (body.askingPriceUsd !== undefined) {
    const v = Number(body.askingPriceUsd)
    if (!Number.isFinite(v) || v < 1 || v > 10_000_000) return NextResponse.json({ error: 'INVALID_PRICE', code: 'INVALID_PRICE' }, { status: 400 })
    patch.askingPriceUsd = v
  }
  if (body.description !== undefined) {
    const d = body.description == null ? null : String(body.description).trim()
    if (d && d.length > 500) return NextResponse.json({ error: 'DESCRIPTION_TOO_LONG', code: 'DESCRIPTION_TOO_LONG' }, { status: 400 })
    patch.description = d
  }
  if (body.action === 'withdraw' || body.action === 'mark_sold') patch.action = body.action
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'EMPTY_PATCH', code: 'EMPTY_PATCH' }, { status: 400 })

  const updated = await updateListing(params.id, email, patch)
  if (!updated) return NextResponse.json({ error: 'Update failed', code: 'UPDATE_FAILED' }, { status: 500 })
  return NextResponse.json({ ok: true, listing: toPublicListing(updated, false) })
}
```

`validateListingInput` 若最终未在此文件使用则删除该 import（lint no-unused-vars）。

- [x] **Step 2: 验证 + 提交**

```bash
npx tsc --noEmit && npx next lint
git add app/api/marketplace/listings
git commit -m "feat(marketplace): listing detail and seller patch APIs"
```

---

### Task 5: 解锁支付路由 + claim 认领分支

**Files:**
- Create: `app/api/marketplace/unlock/route.ts`
- Modify: `lib/credits-server.ts`（pending_purchases 加 listing_id 列 + storePendingPurchase 支持可选 listingId + 导出 deletePendingPurchase）
- Modify: `app/api/credits/claim/route.ts`（unlock1 分支）

- [x] **Step 1: credits-server.ts 扩展**

在 `pending_purchases` 建表语句后追加迁移（与项目 `ADD COLUMN IF NOT EXISTS` 惯例一致）：

```ts
await getSql()`ALTER TABLE pending_purchases ADD COLUMN IF NOT EXISTS listing_id TEXT`
```

`PendingPurchase` 接口加 `listingId?: string | null`；`storePendingPurchase` 参数类型同步加该可选字段，INSERT 语句加列 `listing_id`；`getPendingPurchase` 的 SELECT 返回行映射加 `listingId: row.listing_id ?? null`。新增导出：

```ts
export async function deletePendingPurchase(email: string): Promise<void> {
  const sql = await getSql()
  await sql`DELETE FROM pending_purchases WHERE email = ${email}`
}
```

- [x] **Step 2: unlock 路由**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getBearerToken, verifySessionToken } from '@/lib/auth'
import { storePendingPurchase } from '@/lib/credits-server'
import { getListingById, isUnlocked } from '@/lib/marketplace-db'
import { UNLOCK_PACKAGE_ID, UNLOCK_PRICE_USD } from '@/lib/marketplace'
import { recordEventFromRequest } from '@/lib/analytics'

export const dynamic = 'force-dynamic'
export const maxDuration = 25

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CREEM_API_KEY = process.env.CREEM_API_KEY || ''
const CREEM_WEBHOOK_SECRET = process.env.CREEM_WEBHOOK_SECRET || ''
const UNLOCK1_PRODUCT_ID = process.env.CREEM_PRODUCT_ID_UNLOCK1 || ''
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'))
const IS_DEV = process.env.NODE_ENV === 'development'
const SKIP_PAYMENT = IS_DEV && process.env.DEV_SKIP_PAYMENT === 'true'

function getCreemApiBase(): string {
  return CREEM_API_KEY.startsWith('creem_test_') ? 'https://test-api.creem.io' : 'https://api.creem.io'
}

// POST { listingId, email? } —— JWT 或 guest email；返回 checkoutUrl 或直接已解锁
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const listingId = String(body.listingId || '').trim()
  if (!listingId) return NextResponse.json({ error: 'listingId required', code: 'INVALID_INPUT' }, { status: 400 })

  let email = ''
  const token = getBearerToken(req)
  if (token) {
    const payload = await verifySessionToken(token)
    if (!payload?.email) return NextResponse.json({ error: 'Invalid session', code: 'UNAUTHORIZED' }, { status: 401 })
    email = payload.email.toLowerCase().trim()
  } else {
    email = String(body.email || '').toLowerCase().trim()
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Valid email required', code: 'INVALID_EMAIL' }, { status: 400 })
  }

  const listing = await getListingById(listingId)
  if (!listing || listing.status !== 'active') return NextResponse.json({ error: 'Listing not available', code: 'NOT_AVAILABLE' }, { status: 404 })
  if (await isUnlocked(listingId, email)) return NextResponse.json({ ok: true, alreadyUnlocked: true })

  if (SKIP_PAYMENT) {
    // 本地联调：直接发放（与 checkout DEV 模式语义一致，仅限 development）
    const { recordUnlock } = await import('@/lib/marketplace-db')
    await recordUnlock(listingId, email)
    return NextResponse.json({ ok: true, devMode: true, unlocked: true })
  }

  if (!CREEM_API_KEY || !CREEM_WEBHOOK_SECRET || !UNLOCK1_PRODUCT_ID) {
    return NextResponse.json({ error: 'Payment service not configured', code: 'CREEM_CONFIG_ERROR' }, { status: 503 })
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  let creemRes: Response
  try {
    creemRes = await fetch(`${getCreemApiBase()}/v1/checkouts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': CREEM_API_KEY },
      body: JSON.stringify({
        product_id: UNLOCK1_PRODUCT_ID,
        success_url: `${APP_URL}/marketplace/${listingId}?paid=success&email=${encodeURIComponent(email)}`,
        customer: { email },
        metadata: { email, packageId: UNLOCK_PACKAGE_ID, listingId, amount: String(UNLOCK_PRICE_USD) },
      }),
      signal: controller.signal,
    })
  } catch (err) {
    console.error('[marketplace/unlock] Creem fetch error:', err)
    return NextResponse.json({ error: 'Payment service temporarily unavailable', code: 'CREEM_TIMEOUT' }, { status: 502 })
  } finally {
    clearTimeout(timer)
  }

  if (!creemRes.ok) {
    console.error('[marketplace/unlock] Creem checkout failed:', creemRes.status, await creemRes.text().catch(() => ''))
    return NextResponse.json({ error: 'Checkout failed', code: 'CREEM_CHECKOUT_FAILED' }, { status: 502 })
  }

  const session = await creemRes.json()
  const checkoutId = session.id || ''
  if (checkoutId) {
    await storePendingPurchase({ email, packageId: UNLOCK_PACKAGE_ID, credits: 0, amount: UNLOCK_PRICE_USD, checkoutId, createdAt: Date.now(), listingId })
    recordEventFromRequest(req, { event_type: 'checkout_start', email, metadata: { packageId: UNLOCK_PACKAGE_ID, listingId, amount: UNLOCK_PRICE_USD, checkoutId } }).catch(() => {})
  }
  return NextResponse.json({ ok: true, checkoutUrl: session.checkout_url })
}
```

- [x] **Step 3: claim 路由 unlock 分支**

`app/api/credits/claim/route.ts` 在 Step 3（`claimPendingPurchase` 调用，约 L126）之前插入：

```ts
// 解锁类购买：发放 marketplace_unlocks 而非 credits
if (pending.packageId === 'unlock1' && pending.listingId) {
  const { recordUnlock, deletePendingPurchase } = await import('@/lib/marketplace-db')
  const { deletePendingPurchase: delPending } = await import('@/lib/credits-server')
  await recordUnlock(pending.listingId, email)
  await delPending(email)
  recordEventFromRequest(req, { event_type: 'credit_claim', email, metadata: { type: 'unlock', listingId: pending.listingId, checkoutId: pending.checkoutId, isGuest } }).catch(() => {})
  const sessionToken = isGuest ? await createSessionToken(email) : null
  return NextResponse.json({ claimed: true, email, credits: 0, totalPurchased: 0, unlocked: true, listingId: pending.listingId, ...(sessionToken ? { token: sessionToken } : {}) })
}
```

（删除上面误写的双 import：只 `import { deletePendingPurchase } from '@/lib/credits-server'` 到文件头部，与 `getPendingPurchase` 同行。）

- [x] **Step 4: 验证 + 提交**

```bash
npx tsc --noEmit && npx next lint
git add app/api/marketplace/unlock app/api/credits/claim/route.ts lib/credits-server.ts
git commit -m "feat(marketplace): unlock checkout route and claim fulfillment"
```

---

### Task 6: webhook unlock1 分支

**Files:**
- Modify: `app/api/stripe/webhook/route.ts:118-173`

- [x] **Step 1: PRODUCT_ID_MAP 加 unlock1**

L15-19 的 map 加一行：`unlock1: process.env.CREEM_PRODUCT_ID_UNLOCK1 || '',`

- [x] **Step 2: checkout.completed 内加解锁分支**

在 L122（`const packageId = ...`）之后、L129 的 metadata 校验之前插入——unlock 单不走 `findPackage`（它不是 credits 包）：

```ts
// 解锁购买：独立分支，发放 marketplace_unlocks，不发 credits、不产生推荐佣金
if (packageId === 'unlock1') {
  const listingId = metadata.listingId || ''
  if (!email || !listingId) {
    console.warn('[creem-webhook] unlock event missing email/listingId')
    return NextResponse.json({ received: true })
  }
  const checkoutId = (obj.id as string) || event.id
  const info = await fetchCreemCheckout(checkoutId)
  if (!info) return NextResponse.json({ error: 'Checkout verification unavailable' }, { status: 500 })
  if (info.orderStatus !== 'paid') {
    console.warn('[creem-webhook] unlock order not paid, refusing.', { checkout: checkoutId })
    return NextResponse.json({ received: true })
  }
  const unlockProduct = process.env.CREEM_PRODUCT_ID_UNLOCK1 || ''
  if (info.currency !== 'USD' || info.orderAmount < Math.round(3.99 * 100)) {
    console.warn('[creem-webhook] unlock amount below price, refusing.', { checkout: checkoutId, orderAmount: info.orderAmount })
    return NextResponse.json({ received: true })
  }
  if (unlockProduct && info.productId && info.productId !== unlockProduct) {
    console.warn('[creem-webhook] unlock product mismatch, refusing.', { checkout: checkoutId })
    return NextResponse.json({ received: true })
  }
  const { recordUnlock } = await import('@/lib/marketplace-db')
  const isNew = await recordUnlock(listingId, email.toLowerCase())
  console.log('[creem-webhook] unlock recorded:', checkoutId, 'new:', isNew)
  if (isNew) {
    recordEvent({ event_type: 'checkout_success', email, metadata: { packageId: 'unlock1', listingId, amount: 3.99, checkoutId } }).catch(() => {})
  }
  return NextResponse.json({ received: true })
}
```

- [x] **Step 3: 验证 + 提交**

```bash
npx tsc --noEmit && npx next lint
git add app/api/stripe/webhook/route.ts
git commit -m "feat(marketplace): webhook unlock1 fulfillment branch with Creem verification"
```

---

### Task 7: 举报路由

**Files:**
- Create: `app/api/marketplace/report/route.ts`

- [x] **Step 1: 实现**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getBearerToken, verifySessionToken } from '@/lib/auth'
import { addReport, getListingById } from '@/lib/marketplace-db'
import { checkIpRateLimit, ipBucketKey, rateLimitResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// POST { listingId, reason? } —— 需登录；每人每单一次；≥3 独立举报自动下架
export async function POST(req: NextRequest) {
  const token = getBearerToken(req)
  if (!token) return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 })
  const payload = await verifySessionToken(token)
  if (!payload?.email) return NextResponse.json({ error: 'Invalid session', code: 'UNAUTHORIZED' }, { status: 401 })
  const email = payload.email.toLowerCase().trim()

  if (!(await checkIpRateLimit(ipBucketKey('marketplace-report', req), { limit: 20, windowHours: 1 }))) {
    return rateLimitResponse('Too many reports, please try again later')
  }

  const body = await req.json().catch(() => ({}))
  const listingId = String(body.listingId || '').trim()
  const reason = body.reason ? String(body.reason).slice(0, 200) : null
  if (!listingId) return NextResponse.json({ error: 'listingId required', code: 'INVALID_INPUT' }, { status: 400 })

  const listing = await getListingById(listingId)
  if (!listing) return NextResponse.json({ error: 'Listing not found', code: 'NOT_FOUND' }, { status: 404 })
  if (listing.sellerEmail === email) return NextResponse.json({ error: 'Cannot report own listing', code: 'SELF_REPORT' }, { status: 400 })

  const { reported, removed } = await addReport(listingId, email, reason)
  return NextResponse.json({ ok: true, reported, removed })
}
```

- [x] **Step 2: 验证 + 提交**

```bash
npx tsc --noEmit && npx next lint
git add app/api/marketplace/report
git commit -m "feat(marketplace): report route with auto-removal threshold"
```

---

### Task 8: i18n 字典条目

**Files:**
- Modify: `lib/i18n/dictionaries/en.ts`、`lib/i18n/dictionaries/zh.ts`

- [x] **Step 1: 两份字典的 `nav` 内加 `marketplace` 键**

en.ts：`marketplace: 'Marketplace',`；zh.ts：`marketplace: '交易市场',`

- [x] **Step 2: 顶层加 `marketplace` 组（en.ts 示例，zh.ts 对应翻译）**

```ts
marketplace: {
  title: 'Account Marketplace',
  subtitle: 'Verified valuations. Direct contact. You negotiate the deal.',
  listForSale: 'List This Account for Sale',
  requiresPaidReport: 'A paid full report is required to list an account.',
  askingPrice: 'Asking Price (USD)',
  description: 'Why is this account worth buying?',
  contactEmail: 'Contact Email',
  socialChannel: 'Social Channel (optional)',
  socialHandle: 'Handle / ID',
  publish: 'Publish Listing',
  myListings: 'My Listings',
  myUnlocks: 'My Unlocks',
  unlockContact: 'Unlock Contact — $3.99',
  unlocked: 'Contact Unlocked',
  valuedAsOf: 'Valued as of',
  reportListing: 'Report listing',
  noListings: 'No accounts listed yet. Be the first.',
  disclaimer: 'TokValue does not facilitate transactions. Verify ownership and transfer the account at your own risk.',
  withdraw: 'Withdraw',
  markSold: 'Mark as Sold',
},
```

- [x] **Step 3: 验证 + 提交**

```bash
npx tsc --noEmit
git add lib/i18n
git commit -m "feat(marketplace): i18n dictionary entries"
```

---

### Task 9: Marketplace 列表页

**Files:**
- Create: `app/marketplace/page.tsx`（Server Component）
- Create: `components/marketplace/ListingCard.tsx`

- [x] **Step 1: 列表页**

Server Component 直接调 DB 层（无 fetch 环回）：

```tsx
import { getServerDict } from '@/lib/i18n/server'
import { listActiveListings, toPublicListing } from '@/lib/marketplace-db'
import ListingCard from '@/components/marketplace/ListingCard'
import type { ListingSort } from '@/lib/marketplace-db'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'TikTok Account Marketplace | TokValue' }

export default async function MarketplacePage({ searchParams }: { searchParams: Promise<{ page?: string; sort?: string }> }) {
  const dict = getServerDict()
  const sp = await searchParams
  const page = Math.max(1, parseInt(sp.page || '1', 10) || 1)
  const sort = (['latest', 'valuation_desc', 'valuation_asc', 'followers_desc'].includes(sp.sort || '') ? sp.sort : 'latest') as ListingSort
  const { items, total } = await listActiveListings(page, 24, sort)
  const publicItems = items.map(l => toPublicListing(l))

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white px-6 py-16 max-w-6xl mx-auto">
      <h1 className="text-4xl font-bold mb-2">{dict.marketplace.title}</h1>
      <p className="text-neutral-400 mb-8">{dict.marketplace.subtitle}</p>
      <div className="flex gap-2 mb-8 flex-wrap">
        {(['latest', 'valuation_desc', 'valuation_asc', 'followers_desc'] as const).map(s => (
          <a key={s} href={`/marketplace?sort=${s}`}
            className={`px-4 py-1.5 rounded-full text-sm border ${sort === s ? 'border-[#00F2EA] text-[#00F2EA]' : 'border-neutral-700 text-neutral-400 hover:border-neutral-500'}`}>
            {s === 'latest' ? 'Latest' : s === 'valuation_desc' ? 'Valuation ↓' : s === 'valuation_asc' ? 'Valuation ↑' : 'Followers'}
          </a>
        ))}
      </div>
      {publicItems.length === 0 ? (
        <div className="text-center py-24 text-neutral-500 border border-dashed border-neutral-800 rounded-2xl">{dict.marketplace.noListings}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {publicItems.map(item => <ListingCard key={item.id} item={item} dict={dict} />)}
        </div>
      )}
      {total > 24 && (
        <div className="flex justify-center gap-4 mt-12">
          {page > 1 && <a href={`/marketplace?page=${page - 1}&sort=${sort}`} className="text-[#00F2EA]">← Prev</a>}
          <a href={`/marketplace?page=${page + 1}&sort=${sort}`} className="text-[#00F2EA]">Next →</a>
        </div>
      )}
    </main>
  )
}
```

- [x] **Step 2: ListingCard**

```tsx
import { TIER_COLORS } from '@/lib/tier'
import { Users, DollarSign } from 'lucide-react'

interface Snapshot { tier: string | null; valuationLow: number | null; valuationHigh: number | null; valuationUsd: number | null; followers: number | null }
interface PublicItem { id: string; username: string; askingPriceUsd: number; snapshot: Snapshot; createdAt: string }

export default function ListingCard({ item, dict }: { item: PublicItem; dict: { marketplace: Record<string, string> } }) {
  const color = item.snapshot.tier ? TIER_COLORS[item.snapshot.tier] ?? '#ffffff' : '#ffffff'
  const fmt = (n: number | null) => n == null ? '—' : n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${Math.round(n / 1_000)}K` : `$${n}`
  return (
    <a href={`/marketplace/${item.id}`} className="block border border-neutral-800 rounded-2xl p-5 hover:border-neutral-600 transition-colors bg-neutral-950">
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold truncate">@{item.username}</span>
        {item.snapshot.tier && (
          <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ color, border: `1px solid ${color}` }}>{item.snapshot.tier}</span>
        )}
      </div>
      <div className="flex items-center gap-4 text-sm text-neutral-400 mb-3">
        <span className="flex items-center gap-1"><Users size={14} />{(item.snapshot.followers ?? 0).toLocaleString()}</span>
        <span className="flex items-center gap-1"><DollarSign size={14} />{fmt(item.snapshot.valuationUsd)}</span>
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-neutral-800">
        <span className="text-lg font-bold text-[#FF0050]">${item.askingPriceUsd.toLocaleString()}</span>
        <span className="text-xs text-neutral-500">{dict.marketplace.valuedAsOf} {item.snapshot.evaluatedAt ? new Date(item.snapshot.evaluatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span>
      </div>
    </a>
  )
}
```

- [x] **Step 3: 验证 + 提交**

```bash
npx tsc --noEmit && npx next lint
git add app/marketplace/page.tsx components/marketplace
git commit -m "feat(marketplace): listing browse page"
```

---

### Task 10: 详情页 + 解锁交互（Client Component）

**Files:**
- Create: `app/marketplace/[id]/page.tsx`（Server 壳，取数据）
- Create: `components/marketplace/ListingDetailClient.tsx`（解锁按钮/举报/URL 回跳轮询）

- [x] **Step 1: 详情页壳**

```tsx
import { notFound } from 'next/navigation'
import { getServerDict } from '@/lib/i18n/server'
import { getListingById, toPublicListing } from '@/lib/marketplace-db'
import ListingDetailClient from '@/components/marketplace/ListingDetailClient'

export const dynamic = 'force-dynamic'

export default async function ListingPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ paid?: string; email?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const dict = getServerDict()
  const listing = await getListingById(id)
  if (!listing || listing.status === 'removed') notFound()
  return <ListingDetailClient
    listing={toPublicListing(listing)}
    paidReturn={sp.paid === 'success' ? { email: sp.email || '' } : undefined}
    dict={dict.marketplace}
  />
}
```

- [x] **Step 2: ListingDetailClient**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { getSessionToken } from '@/lib/credits-client'
import { TIER_COLORS } from '@/lib/tier'
import { Lock, Clock, Flag, CheckCircle2 } from 'lucide-react'

interface PublicListing { id: string; username: string; askingPriceUsd: number; description: string | null; status: string; snapshot: { tier: string | null; valuationUsd: number | null; valuationLow: number | null; valuationHigh: number | null; followers: number | null; engagementRate: number | null; evaluatedAt: string | null } }
interface Contact { email: string; socialType: string | null; socialHandle: string | null }
type Dict = Record<string, string>

export default function ListingDetailClient({ listing, paidReturn, dict }: { listing: PublicListing; paidReturn?: { email: string }; dict: Dict }) {
  const [contact, setContact] = useState<Contact | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [emailInput, setEmailInput] = useState(paidReturn?.email || '')

  // 已登录：拉详情看是否已解锁
  useEffect(() => {
    const token = getSessionToken()
    fetch(`/api/marketplace/listings/${listing.id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.unlocked && d.contact) setContact(d.contact) })
      .catch(() => {})
  }, [listing.id])

  // 支付回跳：轮询 claim（最多 6 次 × 3s），成功后刷新解锁状态
  useEffect(() => {
    if (!paidReturn) return
    let tries = 0
    const timer = setInterval(async () => {
      tries++
      try {
        const token = getSessionToken()
        const res = await fetch('/api/credits/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ email: paidReturn.email }),
        })
        const d = await res.json()
        if (d?.unlocked || tries >= 6) {
          clearInterval(timer)
          if (d?.token) localStorage.setItem('tokvalue_session', d.token)
          const detail = await fetch(`/api/marketplace/listings/${listing.id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('tokvalue_session') || ''}` } })
          const dd = await detail.json()
          if (dd?.contact) { setContact(dd.contact); dd.contact && window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }) }
        }
      } catch { if (tries >= 6) clearInterval(timer) }
    }, 3000)
    return () => clearInterval(timer)
  }, [paidReturn, listing.id])

  async function handleUnlock() {
    setLoading(true); setError('')
    try {
      const token = getSessionToken()
      const res = await fetch('/api/marketplace/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ listingId: listing.id, email: emailInput }),
      })
      const d = await res.json()
      if (d.alreadyUnlocked || d.unlocked) { await refreshContact(); return }
      if (d.checkoutUrl) { window.location.href = d.checkoutUrl; return }
      setError(d.code === 'UNAUTHORIZED' || d.code === 'INVALID_EMAIL' ? 'Enter your email to pay' : (d.error || 'Unlock failed'))
    } catch { setError('Network error') } finally { setLoading(false) }
  }

  async function refreshContact() {
    const token = getSessionToken()
    const res = await fetch(`/api/marketplace/listings/${listing.id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    const d = await res.json()
    if (d?.contact) { setContact(d.contact); requestAnimationFrame(() => document.getElementById('contact-box')?.scrollIntoView({ behavior: 'smooth' })) }
  }

  async function handleReport() {
    const token = getSessionToken()
    if (!token) { setError('Sign in to report a listing'); return }
    await fetch('/api/marketplace/report', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ listingId: listing.id }) })
    alert('Report submitted. Thank you.')
  }

  const s = listing.snapshot
  const color = s.tier ? TIER_COLORS[s.tier] ?? '#fff' : '#fff'

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white px-6 py-16 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-bold">@{listing.username}</h1>
        {s.tier && <span className="text-sm font-bold px-3 py-1 rounded-lg" style={{ color, border: `1px solid ${color}` }}>{s.tier}</span>}
      </div>
      <div className="grid grid-cols-3 gap-4 my-8">
        {[
          { label: 'Followers', value: (s.followers ?? 0).toLocaleString() },
          { label: 'Engagement', value: s.engagementRate != null ? `${s.engagementRate.toFixed(1)}%` : '—' },
          { label: 'Valuation', value: s.valuationUsd != null ? `$${s.valuationUsd.toLocaleString()}` : '—' },
        ].map(k => (
          <div key={k.label} className="border border-neutral-800 rounded-xl p-4 bg-neutral-950">
            <div className="text-xs text-neutral-500 mb-1">{k.label}</div>
            <div className="text-xl font-bold">{k.value}</div>
          </div>
        ))}
      </div>
      {listing.description && <p className="text-neutral-300 mb-8 whitespace-pre-wrap">{listing.description}</p>}
      <div className="flex items-baseline gap-3 mb-8">
        <span className="text-4xl font-extrabold text-[#FF0050]">${listing.askingPriceUsd.toLocaleString()}</span>
        <span className="text-sm text-neutral-500 flex items-center gap-1"><Clock size={14} />{dict.valuedAsOf} {s.evaluatedAt ? new Date(s.evaluatedAt).toLocaleDateString('en-US') : '—'}</span>
      </div>

      <div id="contact-box" className="border border-neutral-800 rounded-2xl p-6 mb-8 bg-neutral-950">
        {contact ? (
          <div>
            <div className="flex items-center gap-2 text-[#00F2EA] font-semibold mb-4"><CheckCircle2 size={18} />{dict.unlocked}</div>
            <p className="mb-2">Email: <a className="text-[#00F2EA] underline" href={`mailto:${contact.email}`}>{contact.email}</a></p>
            {contact.socialType && <p>{contact.socialType}: {contact.socialHandle}</p>}
          </div>
        ) : (
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-neutral-400 mb-4"><Lock size={18} /> Seller contact hidden</div>
            <input type="email" value={emailInput} onChange={e => setEmailInput(e.target.value)} placeholder="your@email.com"
              className="w-full max-w-xs bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-2.5 mb-3 text-sm focus:border-[#00F2EA] outline-none" />
            <button onClick={handleUnlock} disabled={loading}
              className="w-full max-w-xs bg-[#FF0050] hover:bg-[#e0004a] disabled:opacity-50 rounded-lg py-3 font-bold transition-colors">
              {loading ? 'Loading…' : dict.unlockContact}
            </button>
            {error && <p className="text-sm text-[#FF0050] mt-2">{error}</p>}
          </div>
        )}
      </div>

      <button onClick={handleReport} className="text-xs text-neutral-600 hover:text-neutral-400 flex items-center gap-1"><Flag size={12} />{dict.reportListing}</button>
      <p className="text-xs text-neutral-600 mt-8 border-t border-neutral-800 pt-4">{dict.disclaimer}</p>
    </main>
  )
}
```

**注意:** `localStorage.setItem('tokvalue_session', ...)` 的 key 以 `lib/credits-client.ts` 的 `TOKEN_KEY` 常量为准——改为 import 该文件的 `setSessionToken`（若已导出；`lib/credits-client.ts:35` 有 `setSessionToken`）。两处手写 localStorage 均替换为 `setSessionToken(d.token)`。

- [x] **Step 3: 验证 + 提交**

```bash
npx tsc --noEmit && npx next lint
git add app/marketplace/\[id\] components/marketplace/ListingDetailClient.tsx
git commit -m "feat(marketplace): listing detail with unlock flow"
```

---

### Task 11: /sell 登记页 + 报告页入口

**Files:**
- Create: `app/sell/page.tsx`（Client）
- Modify: `components/report-v2/ReportNav.tsx`（顶部加 List for Sale 按钮）

- [x] **Step 1: /sell 页**

```tsx
'use client'
// 登记挂牌：先查 eligibility（无 token 弹 email 验证——复用 UserMenu 的验证流程组件太重，
// MVP 做法：无 token 时提示先登录并跳回首页），通过后表单提交 POST /api/marketplace/listings
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { getSessionToken } from '@/lib/credits-client'
import { getServerDict } from '@/lib/i18n/server'  // ❌ 客户端不可用——见 Step 1b

function SellForm() {
  const sp = useSearchParams()
  const username = (sp.get('username') || '').toLowerCase()
  const [eligible, setEligible] = useState<boolean | null>(null)
  const [form, setForm] = useState({ askingPriceUsd: '', description: '', contactEmail: '', socialType: '', socialHandle: '' })
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  useEffect(() => {
    const token = getSessionToken()
    if (!token || !username) { setEligible(false); return }
    fetch(`/api/marketplace/eligibility?username=${encodeURIComponent(username)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setEligible(!!d.eligible)).catch(() => setEligible(false))
  }, [username])

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    const token = getSessionToken()
    const res = await fetch('/api/marketplace/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        username,
        askingPriceUsd: Number(form.askingPriceUsd),
        description: form.description || null,
        contactEmail: form.contactEmail,
        socialType: form.socialType || null,
        socialHandle: form.socialHandle || null,
      }),
    })
    const d = await res.json()
    if (d.ok) { setDone(d.listing.id); window.location.href = `/marketplace/${d.listing.id}` }
    else setError(d.code || 'SUBMIT_FAILED')
  }

  if (!username) return <Shell><p className="text-neutral-400">Missing ?username= parameter. Go to a full report and click "List This Account for Sale".</p></Shell>
  if (eligible === false) return <Shell><p className="text-[#FF0050]">A paid full report for this account is required before listing. Evaluate and unlock the report first.</p></Shell>
  if (eligible === null) return <Shell><p className="text-neutral-500">Checking eligibility…</p></Shell>

  return (
    <Shell>
      <form onSubmit={submit} className="space-y-4 max-w-md">
        <div className="text-neutral-400 text-sm mb-2">Listing <span className="text-white font-semibold">@{username}</span></div>
        <Field label="Asking Price (USD)" type="number" value={form.askingPriceUsd} onChange={v => setForm({ ...form, askingPriceUsd: v })} />
        <div>
          <label className="block text-sm text-neutral-400 mb-1">Why is this account worth buying?</label>
          <textarea maxLength={500} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm h-24 focus:border-[#00F2EA] outline-none" />
        </div>
        <Field label="Contact Email" type="email" value={form.contactEmail} onChange={v => setForm({ ...form, contactEmail: v })} />
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm text-neutral-400 mb-1">Social (optional)</label>
            <select value={form.socialType} onChange={e => setForm({ ...form, socialType: e.target.value })}
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm">
              <option value="">None</option><option value="discord">Discord</option><option value="whatsapp">WhatsApp</option><option value="telegram">Telegram</option>
            </select>
          </div>
          {form.socialType && <div className="flex-1"><Field label="Handle / ID" type="text" value={form.socialHandle} onChange={v => setForm({ ...form, socialHandle: v })} /></div>}
        </div>
        {error && <p className="text-sm text-[#FF0050]">{error}</p>}
        <button type="submit" className="w-full bg-[#FF0050] hover:bg-[#e0004a] rounded-lg py-3 font-bold">Publish Listing</button>
      </form>
    </Shell>
  )
}

function Field({ label, type, value, onChange }: { label: string; type: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm text-neutral-400 mb-1">{label}</label>
      <input type={type} required value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:border-[#00F2EA] outline-none" />
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-[#0a0a0a] text-white px-6 py-16 max-w-2xl mx-auto">
    <h1 className="text-3xl font-bold mb-8">List This Account for Sale</h1>{children}
  </main>
}

export default function SellPage() {
  return <Suspense fallback={<Shell><p className="text-neutral-500">Loading…</p></Shell>}><SellForm /></Suspense>
}
```

**Step 1b（清理）:** 删除代码块首行 `import { getServerDict } ...` 注释示例——客户端组件不 import server 字典；本页文案直接用英文字面量（目标用户为英文创作者）。`done` state 未使用则删除。

- [x] **Step 2: ReportNav 加入口按钮**

在 `components/report-v2/ReportNav.tsx` 的导航容器内（tabs 同一行的右侧）追加：

```tsx
<a href={`/sell?username=${encodeURIComponent(username)}`}
   className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-full border border-[#FF0050] text-[#FF0050] hover:bg-[#FF0050]/10 transition-colors whitespace-nowrap">
  List for Sale
</a>
```

`username` 取自该组件已有的 props/context（读文件确认变量名；若无则从 URL `useParams()` 获取）。按钮对所有查看完整报告的用户可见；eligibility 由 /sell 页兜底（未付费用户看到提示），MVP 不在报告页做预检。

- [x] **Step 3: 验证 + 提交**

```bash
npx tsc --noEmit && npx next lint
git add app/sell components/report-v2/ReportNav.tsx
git commit -m "feat(marketplace): sell page and report entry point"
```

---

### Task 12: My Listings / My Unlocks + 导航入口

**Files:**
- Create: `app/marketplace/my/page.tsx`
- Modify: `components/SiteHeader.tsx`（nav 数组加 Marketplace）
- Modify: `components/UserMenu.tsx`（加 My Listings）

- [x] **Step 1: my 页（Server Component + 登录守卫）**

```tsx
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getServerDict } from '@/lib/i18n/server'
import { getListingsBySeller, getUnlocksByEmail, toPublicListing } from '@/lib/marketplace-db'
import { verifySessionToken } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function MyMarketplacePage() {
  const dict = getServerDict()
  // 登录态：session token 存在 cookie 或 localStorage 无法服务端读——用 cookie 版 token（若项目
  // 登录同时写 cookie；读 lib/auth.ts createSessionToken 调用方确认）。MVP 简化：无 cookie 则
  // redirect('/') 引导回首页登录。
  const store = await cookies()
  const token = store.get('tokvalue_session')?.value
  if (!token) redirect('/')
  const payload = await verifySessionToken(token)
  if (!payload?.email) redirect('/')
  const email = payload.email.toLowerCase()

  const [listings, unlocks] = await Promise.all([getListingsBySeller(email), getUnlocksByEmail(email)])

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white px-6 py-16 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">{dict.marketplace.myListings}</h1>
      {listings.length === 0 && <p className="text-neutral-500 mb-12">No listings yet.</p>}
      <div className="space-y-3 mb-16">
        {listings.map(l => {
          const p = toPublicListing(l, false)
          return (
            <a key={l.id} href={`/marketplace/${l.id}`} className="flex items-center justify-between border border-neutral-800 rounded-xl p-4 hover:border-neutral-600">
              <div>
                <span className="font-semibold">@{l.username}</span>
                <span className="ml-3 text-sm text-neutral-400">${l.askingPriceUsd.toLocaleString()}</span>
              </div>
              <span className={`text-xs px-2 py-1 rounded ${l.status === 'active' ? 'text-[#00F2EA] border border-[#00F2EA]/40' : 'text-neutral-500 border border-neutral-700'}`}>{l.status}</span>
            </a>
          )
        })}
      </div>
      <h2 className="text-2xl font-bold mb-6">{dict.marketplace.myUnlocks}</h2>
      {unlocks.length === 0 && <p className="text-neutral-500">No unlocked contacts yet.</p>}
      <div className="space-y-3">
        {unlocks.map(u => (
          <a key={u.listing_id} href={`/marketplace/${u.listing_id}`} className="flex items-center justify-between border border-neutral-800 rounded-xl p-4 hover:border-neutral-600">
            <span className="font-semibold">@{u.username}</span>
            <span className="text-sm text-[#00F2EA]">{u.contact_email}</span>
          </a>
        ))}
      </div>
    </main>
  )
}
```

**前置确认:** 读 `lib/auth.ts` 中 `createSessionToken` 的调用方（verify-code / claim 路由）是否写 cookie。若 token 仅存 localStorage，则本页面改为 Client Component：`getSessionToken()` + `fetch('/api/marketplace/listings?mine=1')`——此时给 listings GET 路由加 `mine` 参数分支（JWT 鉴权，返回 `getListingsBySeller`，含 sellerEmail），`/api/marketplace/my-unlocks` 同理新增返回 `getUnlocksByEmail`。**两种实现二选一，以实际登录态存储方式为准。**

- [x] **Step 2: SiteHeader nav**

`components/SiteHeader.tsx:56` 的 items 数组追加：

```ts
{ label: dict.nav.marketplace, href: '/marketplace', icon: Store },
```

（`Store` 从 lucide-react import；确认该数组每项的字段名与现有 `pricing/howItWorks` 一致。）

- [x] **Step 3: UserMenu 加 My Listings**

读 `components/UserMenu.tsx` 找到已登录菜单项列表（如 History/Dashboard 项），按同样格式追加一项：label `dict.marketplace.myListings`，href `/marketplace/my`。

- [x] **Step 4: 验证 + 提交**

```bash
npx tsc --noEmit && npx next lint
git add app/marketplace/my components/SiteHeader.tsx components/UserMenu.tsx app/api/marketplace/listings/route.ts
git commit -m "feat(marketplace): my listings page and nav entries"
```

---

### Task 13: 全量验证与手动链路测试

- [x] **Step 1: 全量静态检查 + 单测**

```bash
npx tsc --noEmit && npx next lint && npx vitest run
```

Expected: 全部通过，0 errors。

- [x] **Step 2: 本地手动链路（DEV_SKIP_PAYMENT=true）**

`npm run dev` 后按序验证：
1. 首页评估一个账号 → 验证码登录 → 解锁完整报告（dev 跳过支付）
2. 报告页出现 "List for Sale" → /sell 填表（价格 1500、描述、email、discord）→ 提交 → 跳转详情页
3. 详情页联系方式打码；`/marketplace` 列表可见该卡片；curl 详情页 API 确认响应体**不含** `contact_email`
4. 解锁按钮（dev 模式直接发放）→ 联系方式展开
5. 换浏览器（未登录）访问详情页 → 无联系方式；举报按钮提示登录
6. 用另一 email 举报 3 次（清 DB 重测或直接 SQL 改 report_count=2 再举报）→ listing 变 removed → 列表页消失

- [x] **Step 3: 安全回归（curl）**

```bash
# 无 token POST 登记 → 401
curl -s -X POST localhost:3000/api/marketplace/listings -H 'Content-Type: application/json' -d '{"username":"x","askingPriceUsd":100,"contactEmail":"a@b.co"}' | head -c 200
# 篡改价格字符串 → 400 INVALID_PRICE（非数字）
```

Expected: 均返回预期错误码。

- [x] **Step 4: 最终提交**

```bash
git add -A -- docs/superpowers/plans/2026-10-18-marketplace.md
git commit -m "docs: marketplace implementation plan"
```

---

## Self-Review 结论

- **Spec 覆盖:** 计费模型（Task 5/6）、3 表（Task 2）、6 API（Task 3/4/5/7）、webhook 分支（Task 6）、claim 认领（Task 5）、4 页面（Task 9-12）、导航（Task 12）、举报阈值（Task 1/7）、快照（Task 1）、测试（Task 1/13）——无遗漏。
- **已知二选一决策点（实现时现场确认，非占位）:** My 页登录态读取方式（Task 12 Step 1 前置确认）；ReportNav username 变量名（Task 11 Step 2）；session token 存储 key（Task 10 注意事项）。
- **类型一致性:** `ListingInput`/`ListingSnapshot`/`toPublicListing`/`recordUnlock`/`UNLOCK_PACKAGE_ID` 各任务引用与 Task 1/2 定义一致。
