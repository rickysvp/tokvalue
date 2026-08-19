# B1 Review 交易核心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 `/api/evaluate` 加上 Review 状态机 + 幂等键 + in-flight 并发锁 + 事件账本，失败自动返还 credits，全程 feature flag 控制，flag 关闭时行为与现状完全一致。

**Architecture:** 不动 `credit_balances` 表——现有 `consumeCredit`/`refundCredit` 已是「预扣/释放」两段式。新增 `account_reviews` 表（状态机行 + 幂等唯一约束 + in-flight 部分唯一索引）与 `usage_events` 表（计量流水），由 `lib/review-state.ts`（纯函数）+ `lib/reviews.ts`（数据层）+ `lib/usage-events.ts`（审计）组成，evaluate 路由在 `REVIEW_STATE_MACHINE=true` 时走新路径。Neon 无事务，全部沿用仓库既有的单语句原子模式（ON CONFLICT 抢锁 / 条件 UPDATE / RETURNING 读回）。

**Tech Stack:** Next.js 15 route handler / @neondatabase/serverless / vitest / TypeScript

**关键背景（实现者必读）：**
- `lib/credits-server.ts`：`consumeCredit(email, username)` 原子扣 1 credit；`refundCredit(email)` 加回 1；`getSql()` 模式（模块级 `sql` 惰性初始化）。
- `app/api/evaluate/route.ts` 现状：paid 分支 = 30 天缓存检查 → `consumeCredit` → `fetchProfile` → `scoreProfile` → AI enrich → `saveEvaluation`；catch 里对 paid 模式 `refundCredit`。free 分支 = 24h 免费缓存 → IP 限流 → `consumeFreeAllowance` → fetch/score/save + `stripForFreeMode` 裁剪。
- DB 迁移模式：`CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN IF NOT EXISTS`，在模块 init 时幂等执行（见 `lib/db.ts` initStore、`lib/credits-server.ts` initTable）。
- file/memory 开发模式下新功能直接降级跳过（`storeType !== 'postgres'` 时返回 unavailable），与 `evaluation_ownership` 的内存 Map 模式不同——B1 不做 file 模式实现，flag 文档注明需 postgres。
- 环境变量必须每次请求动态读取（项目约定，支持 Vercel 热更）。

---

### Task 1: Review 状态机纯函数模块

**Files:**
- Create: `lib/review-state.ts`
- Test: `lib/review-state.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// lib/review-state.test.ts
import { describe, it, expect } from 'vitest'
import {
  REVIEW_STATUSES, ACTIVE_REVIEW_STATUSES, canTransition, isTerminalReview,
  isStaleReview, REVIEW_TTL_MS, type ReviewStatus,
} from './review-state'

describe('canTransition', () => {
  it('allows the happy-path chain', () => {
    expect(canTransition('requested', 'quota_reserved')).toBe(true)
    expect(canTransition('quota_reserved', 'fetching_data')).toBe(true)
    expect(canTransition('fetching_data', 'data_saved')).toBe(true)
    expect(canTransition('data_saved', 'analyzing')).toBe(true)
    expect(canTransition('analyzing', 'report_generating')).toBe(true)
    expect(canTransition('report_generating', 'completed')).toBe(true)
  })

  it('allows any active state to fail', () => {
    for (const s of ACTIVE_REVIEW_STATUSES) {
      expect(canTransition(s, 'failed')).toBe(true)
    }
  })

  it('rejects skips and backwards transitions', () => {
    expect(canTransition('requested', 'fetching_data')).toBe(false)
    expect(canTransition('fetching_data', 'completed')).toBe(false)
    expect(canTransition('analyzing', 'fetching_data')).toBe(false)
  })

  it('rejects transitions out of terminal states', () => {
    expect(canTransition('completed', 'failed')).toBe(false)
    expect(canTransition('failed', 'requested')).toBe(false)
    expect(canTransition('completed', 'completed')).toBe(false)
  })
})

describe('isStaleReview', () => {
  const TTL = REVIEW_TTL_MS.fetching_data! // 90s
  it('marks active review stale when now - entered > TTL', () => {
    const entered = new Date(Date.now() - TTL - 1000)
    expect(isStaleReview('fetching_data', entered)).toBe(true)
  })
  it('not stale within TTL', () => {
    const entered = new Date(Date.now() - TTL + 5000)
    expect(isStaleReview('fetching_data', entered)).toBe(false)
  })
  it('terminal states are never stale', () => {
    expect(isStaleReview('completed', new Date(0))).toBe(false)
    expect(isStaleReview('failed', new Date(0))).toBe(false)
  })
  it('accepts ISO string and epoch ms inputs', () => {
    const iso = new Date(Date.now() - TTL - 1).toISOString()
    expect(isStaleReview('fetching_data', iso)).toBe(true)
    expect(isStaleReview('fetching_data', Date.now() - TTL - 1)).toBe(true)
  })
  it('every active status has a TTL defined', () => {
    for (const s of ACTIVE_REVIEW_STATUSES) {
      expect(REVIEW_TTL_MS[s], `missing TTL for ${s}`).toBeTruthy()
    }
  })
})

describe('status types', () => {
  it('REVIEW_STATUSES covers 8 statuses', () => {
    expect(REVIEW_STATUSES).toHaveLength(8)
    expect(isTerminalReview('completed' as ReviewStatus)).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run lib/review-state.test.ts`
Expected: FAIL — `Cannot find module './review-state'`（或等价模块不存在错误）

- [ ] **Step 3: 最小实现**

```typescript
// lib/review-state.ts
/**
 * Review 状态机（纯函数，无 IO）。
 * 状态流转：requested → quota_reserved → fetching_data → data_saved
 *           → analyzing → report_generating → completed
 * 任意活跃态可 → failed（终态）。
 * quota_consumed / quota_released 是 usage_events 里的事件，不是状态。
 */

export const REVIEW_STATUSES = [
  'requested', 'quota_reserved', 'fetching_data', 'data_saved',
  'analyzing', 'report_generating', 'completed', 'failed',
] as const

export type ReviewStatus = (typeof REVIEW_STATUSES)[number]

export const ACTIVE_REVIEW_STATUSES: ReviewStatus[] = [
  'requested', 'quota_reserved', 'fetching_data', 'data_saved',
  'analyzing', 'report_generating',
]

const TRANSITIONS: Record<Exclude<ReviewStatus, 'completed' | 'failed'>, ReviewStatus[]> = {
  requested: ['quota_reserved', 'failed'],
  quota_reserved: ['fetching_data', 'failed'],
  fetching_data: ['data_saved', 'failed'],
  data_saved: ['analyzing', 'failed'],
  analyzing: ['report_generating', 'failed'],
  report_generating: ['completed', 'failed'],
}

/** 各活跃状态允许停留的最大时长；超时由惰性对账判 failed 并释放额度（Serverless 无 cron 依赖） */
export const REVIEW_TTL_MS: Partial<Record<ReviewStatus, number>> = {
  requested: 5 * 60_000,
  quota_reserved: 5 * 60_000,
  fetching_data: 90_000,
  data_saved: 180_000,
  analyzing: 180_000,
  report_generating: 120_000,
}

export function isTerminalReview(status: ReviewStatus): boolean {
  return status === 'completed' || status === 'failed'
}

export function canTransition(from: ReviewStatus, to: ReviewStatus): boolean {
  if (isTerminalReview(from)) return false
  const allowed = TRANSITIONS[from as Exclude<ReviewStatus, 'completed' | 'failed'>]
  return !!allowed && allowed.includes(to)
}

/** stateEnteredAt 接受 Date / ISO string / epoch ms；终态永不超时 */
export function isStaleReview(
  status: ReviewStatus,
  stateEnteredAt: string | number | Date,
  now: number = Date.now(),
): boolean {
  if (isTerminalReview(status)) return false
  const ttl = REVIEW_TTL_MS[status]
  if (!ttl) return false
  const entered = stateEnteredAt instanceof Date
    ? stateEnteredAt.getTime()
    : new Date(stateEnteredAt).getTime()
  if (!Number.isFinite(entered)) return false
  return now - entered > ttl
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run lib/review-state.test.ts`
Expected: PASS（全部用例绿）

- [ ] **Step 5: Commit**

```bash
git add lib/review-state.ts lib/review-state.test.ts
git commit -m "feat(b1): add review state machine pure functions with TTL"
```

---

### Task 2: usage_events 计量流水

**Files:**
- Create: `lib/usage-events.ts`

说明：DB 层薄封装，与仓库惯例一致不做单测（credits-server 也无），验证放在 Task 6 的 curl 集成步骤。

- [ ] **Step 1: 实现**

```typescript
// lib/usage-events.ts
/**
 * Review 计量事件流水（审计与对账用）。
 * 事件只追加、不修改；记录失败只 warn 不抛——审计不得阻断主交易流程。
 * postgres-only：file/memory 开发模式静默跳过。
 */
import type { NeonQueryFunction } from '@neondatabase/serverless'

const DATABASE_URL = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').replace(/\s+/g, '')

let sql: NeonQueryFunction<false, false> | null = null
let initPromise: Promise<void> | null = null

async function getSql(): Promise<NeonQueryFunction<false, false>> {
  if (sql) return sql
  const { neon } = await import('@neondatabase/serverless')
  sql = neon(DATABASE_URL)
  return sql
}

export type UsageEventType =
  | 'review_started'      // review 行创建（幂等命中时为 reused）
  | 'review_reused'       // 幂等键命中已存在 review
  | 'quota_reserved'      // credits 预扣成功 / 免费额度预扣成功
  | 'quota_consumed'      // Review 成功完成，扣减落定
  | 'quota_released'      // Review 失败/超时，额度返还
  | 'review_failed'
  | 'review_completed'

async function initTable(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const s = await getSql()
      await s`
        CREATE TABLE IF NOT EXISTS usage_events (
          id SERIAL PRIMARY KEY,
          email TEXT NOT NULL,
          username TEXT NOT NULL,
          review_id TEXT,
          event_type TEXT NOT NULL,
          purchase_type TEXT,
          status TEXT,
          meta JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
      await s`CREATE INDEX IF NOT EXISTS idx_usage_events_email ON usage_events(email, created_at)`
      await s`CREATE INDEX IF NOT EXISTS idx_usage_events_review ON usage_events(review_id)`
    })()
  }
  return initPromise
}

export interface UsageEventInput {
  email: string
  username: string
  reviewId?: string | null
  eventType: UsageEventType
  purchaseType?: string | null
  status?: string | null
  meta?: Record<string, unknown>
}

/** fire-and-forget 安全：任何失败只打日志，绝不影响主流程 */
export async function recordUsageEvent(event: UsageEventInput): Promise<void> {
  if (!DATABASE_URL) return
  try {
    await initTable()
    const s = await getSql()
    await s`
      INSERT INTO usage_events (email, username, review_id, event_type, purchase_type, status, meta)
      VALUES (
        ${event.email.toLowerCase().trim()},
        ${event.username},
        ${event.reviewId || null},
        ${event.eventType},
        ${event.purchaseType || null},
        ${event.status || null},
        ${event.meta ? JSON.stringify(event.meta) : null}::jsonb
      )
    `
  } catch (err) {
    console.warn('[usage-events] record failed (non-fatal):', err instanceof Error ? err.message : String(err))
  }
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误退出（exit 0）

- [ ] **Step 3: Commit**

```bash
git add lib/usage-events.ts
git commit -m "feat(b1): add usage_events append-only ledger"
```

---

### Task 3: account_reviews 数据层（幂等 + in-flight 锁 + 惰性对账）

**Files:**
- Create: `lib/reviews.ts`

- [ ] **Step 1: 实现**

```typescript
// lib/reviews.ts
/**
 * account_reviews 数据层：幂等创建、状态推进、in-flight 并发锁、惰性超时对账。
 *
 * 并发正确性（Neon 无事务，靠单语句原子性）：
 * - 幂等：UNIQUE(email, username, idempotency_key) + INSERT ON CONFLICT DO NOTHING
 * - 并发锁：partial unique index —— 同一 (email, username) 仅一行活跃 review，
 *   第二个并发 INSERT 会抛唯一约束冲突（constraint: idx_account_reviews_inflight）
 * - 防重复释放：failReview/updateReviewStatus 带 `WHERE status NOT IN ('completed','failed')`
 *   守卫并以 RETURNING 行数判定是否真的发生了转移——终态行不可能被二次 refund
 */
import { isStaleReview, canTransition, type ReviewStatus } from './review-state'
import { recordUsageEvent } from './usage-events'
import { refundCredit } from './credits-server'
import type { NeonQueryFunction } from '@neondatabase/serverless'

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
        CREATE TABLE IF NOT EXISTS account_reviews (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          username TEXT NOT NULL,
          idempotency_key TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'requested',
          state_entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          purchase_type TEXT NOT NULL DEFAULT 'credits',
          access_level TEXT NOT NULL DEFAULT 'full',
          failure_reason TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMPTZ
        )
      `
      // 幂等键唯一：同一 (email, username, key) 重复提交只产生一行
      await s`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_account_reviews_idem
        ON account_reviews(email, username, idempotency_key)
      `
      // in-flight 锁：同一 (email, username) 同时最多一个活跃 review
      await s`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_account_reviews_inflight
        ON account_reviews(email, username)
        WHERE status IN ('requested','quota_reserved','fetching_data','data_saved','analyzing','report_generating')
      `
      await s`CREATE INDEX IF NOT EXISTS idx_account_reviews_created ON account_reviews(created_at)`
    })()
  }
  return initPromise
}

export interface AccountReviewRow {
  id: string
  email: string
  username: string
  idempotency_key: string
  status: ReviewStatus
  state_entered_at: string
  purchase_type: 'credits' | 'free_trial'
  access_level: 'teaser' | 'full'
  failure_reason: string | null
  created_at: string
  completed_at: string | null
}

function rowToReview(row: Record<string, unknown>): AccountReviewRow {
  return {
    id: String(row.id),
    email: String(row.email),
    username: String(row.username),
    idempotency_key: String(row.idempotency_key),
    status: String(row.status) as ReviewStatus,
    state_entered_at: String(row.state_entered_at),
    purchase_type: String(row.purchase_type || 'credits') as AccountReviewRow['purchase_type'],
    access_level: String(row.access_level || 'full') as AccountReviewRow['access_level'],
    failure_reason: row.failure_reason ? String(row.failure_reason) : null,
    created_at: String(row.created_at),
    completed_at: row.completed_at ? String(row.completed_at) : null,
  }
}

export type CreateReviewResult =
  | { kind: 'created'; review: AccountReviewRow }
  | { kind: 'reused'; review: AccountReviewRow }
  | { kind: 'conflict'; review: AccountReviewRow } // 已有活跃 review（in-flight）
  | { kind: 'unavailable' }                         // 非 postgres（本地 file/memory 开发模式）

/**
 * 幂等创建 review。调用前应先 reconcileInFlight。
 * - 同 idempotency_key 已存在 → reused（completed 直接复用；活跃则视作 conflict）
 * - in-flight 部分索引冲突 → conflict（附现有活跃 review）
 */
export async function createOrGetReview(
  email: string,
  username: string,
  idempotencyKey: string,
  purchaseType: AccountReviewRow['purchase_type'],
): Promise<CreateReviewResult> {
  if (!DATABASE_URL) return { kind: 'unavailable' }
  await initTable()
  const s = await getSql()
  const key = email.toLowerCase().trim()
  const id = crypto.randomUUID()

  try {
    const inserted = await s`
      INSERT INTO account_reviews (id, email, username, idempotency_key, status, purchase_type, access_level)
      VALUES (${id}, ${key}, ${username}, ${idempotencyKey}, 'requested', ${purchaseType}, ${purchaseType === 'free_trial' ? 'teaser' : 'full'})
      ON CONFLICT (email, username, idempotency_key) DO NOTHING
      RETURNING *
    `
    if (inserted && inserted.length > 0) {
      return { kind: 'created', review: rowToReview(inserted[0] as Record<string, unknown>) }
    }
    // 幂等命中：读回已有行
    const existing = await s`
      SELECT * FROM account_reviews
      WHERE email = ${key} AND username = ${username} AND idempotency_key = ${idempotencyKey}
    `
    const row = rowToReview(existing[0] as Record<string, unknown>)
    return row.status === 'completed'
      ? { kind: 'reused', review: row }
      : { kind: 'conflict', review: row }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('idx_account_reviews_inflight')) {
      // 并发锁冲突：读回当前活跃行
      const active = await getActiveReview(email, username)
      if (active) return { kind: 'conflict', review: active }
      throw err // 罕见：冲突瞬间行又消失，重抛由上层兜底
    }
    throw err
  }
}

export async function getActiveReview(email: string, username: string): Promise<AccountReviewRow | null> {
  if (!DATABASE_URL) return null
  await initTable()
  const s = await getSql()
  const rows = await s`
    SELECT * FROM account_reviews
    WHERE email = ${email.toLowerCase().trim()} AND username = ${username}
      AND status IN ('requested','quota_reserved','fetching_data','data_saved','analyzing','report_generating')
    ORDER BY created_at DESC LIMIT 1
  `
  return rows[0] ? rowToReview(rows[0] as Record<string, unknown>) : null
}

export async function getReview(id: string): Promise<AccountReviewRow | null> {
  if (!DATABASE_URL) return null
  await initTable()
  const s = await getSql()
  const rows = await s`SELECT * FROM account_reviews WHERE id = ${id}`
  return rows[0] ? rowToReview(rows[0] as Record<string, unknown>) : null
}

/**
 * 状态推进（带合法性守卫）：非法跳转 / 终态行返回 null，不抛错——
 * 状态推进失败不应炸掉主评估流程，只打日志。
 */
export async function transitionReview(id: string, to: ReviewStatus): Promise<AccountReviewRow | null> {
  if (!DATABASE_URL) return null
  const s = await getSql()
  const rows = await s`
    UPDATE account_reviews
    SET status = ${to}, state_entered_at = NOW()
    WHERE id = ${id} AND status NOT IN ('completed','failed')
    RETURNING *
  `
  return rows && rows.length > 0 ? rowToReview(rows[0] as Record<string, unknown>) : null
}

/**
 * 判失败（终态）。RETURNING 非空 = 本次真的从活跃转 failed；
 * 调用方据此决定是否 refund（防二次返还）。credits 型同时记账。
 */
export async function failReview(id: string, reason: string): Promise<AccountReviewRow | null> {
  if (!DATABASE_URL) return null
  const s = await getSql()
  const rows = await s`
    UPDATE account_reviews
    SET status = 'failed', failure_reason = ${reason.slice(0, 500)}, completed_at = NOW()
    WHERE id = ${id} AND status NOT IN ('completed','failed')
    RETURNING *
  `
  const row = rows && rows.length > 0 ? rowToReview(rows[0] as Record<string, unknown>) : null
  if (row) {
    await recordUsageEvent({
      email: row.email, username: row.username, reviewId: row.id,
      eventType: 'review_failed', purchaseType: row.purchase_type,
      status: 'failed', meta: { reason: reason.slice(0, 200) },
    })
  }
  return row
}

/**
 * 惰性对账：把 (email, username) 下超时的活跃 review 判 failed，
 * credits 型自动返还 + 记 quota_released。幂等、可在任意请求路径调用。
 */
export async function reconcileInFlight(email: string, username: string): Promise<void> {
  const active = await getActiveReview(email, username)
  if (!active) return
  if (!isStaleReview(active.status, active.state_entered_at)) return
  const failed = await failReview(active.id, `timeout in ${active.status}`)
  if (failed && failed.purchase_type === 'credits') {
    await refundCredit(failed.email)
    await recordUsageEvent({
      email: failed.email, username: failed.username, reviewId: failed.id,
      eventType: 'quota_released', purchaseType: failed.purchase_type,
      status: 'failed', meta: { reason: 'timeout' },
    })
  }
}
```

注意：`canTransition` 在 `transitionReview` 中未强制执行（DB 只守卫终态），完整合法性由调用方保证——evaluate 路由的推进顺序是线性的，Task 4 中有明确注释。

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add lib/reviews.ts
git commit -m "feat(b1): add account_reviews data layer with idempotency and in-flight lock"
```

---

### Task 4: evaluate 路由接入（feature flag）

**Files:**
- Modify: `app/api/evaluate/route.ts`

- [ ] **Step 1: 新增 import 与 flag helper**

在文件头部 import 区加入：

```typescript
import { createOrGetReview, transitionReview, failReview, reconcileInFlight, getReview, type AccountReviewRow } from '@/lib/reviews'
import { recordUsageEvent } from '@/lib/usage-events'
import type { ReviewStatus } from '@/lib/review-state'
```

在 `withUtm` 函数后加入（环境变量每次请求动态读取——项目约定）：

```typescript
/** B1 状态机开关：默认关闭 = 行为与旧版完全一致 */
function reviewStateMachineEnabled(): boolean {
  return process.env.REVIEW_STATE_MACHINE === 'true'
}
```

- [ ] **Step 2: POST 函数顶部声明 review 上下文**

在 `export async function POST(req: NextRequest) {` 之后现有的 `let userEmail = ''` 等声明区加入：

```typescript
  // ── B1 review 状态机上下文（flag 关闭时恒为 null，走旧路径）──
  let reviewRow: AccountReviewRow | null = null
  let reviewQuotaReserved = false // credits 已预扣且未落定（用于 catch 精确返还）
  const advance = async (to: ReviewStatus) => {
    if (reviewRow) await transitionReview(reviewRow.id, to)
  }
```

- [ ] **Step 3: paid 分支接入（缓存检查之后、consumeCredit 之前）**

定位 paid 分支中 `const consumeResult = await consumeCredit(userEmail, normalized)`，在其**之前**插入：

```typescript
      // ── B1: 幂等 + in-flight 锁（仅 flag 开启时）──
      if (reviewStateMachineEnabled()) {
        await reconcileInFlight(userEmail, normalized) // 先清理超时僵尸
        const idemKey = typeof body.idempotency_key === 'string' && body.idempotency_key
          ? body.idempotency_key.slice(0, 64)
          : crypto.randomUUID() // 客户端未传则本次请求内生成（无跨请求幂等，行为同旧版）
        const res = await createOrGetReview(userEmail, normalized, idemKey, 'credits')
        if (res.kind === 'conflict') {
          return NextResponse.json(
            { error: 'A review for this account is already in progress.', code: 'REVIEW_IN_FLIGHT', review_id: res.review.id },
            { status: 409 }
          )
        }
        if (res.kind === 'reused' && res.review.status === 'completed') {
          // 幂等重放：直接返回已完成的报告，不重复扣费
          const cached = await findEvaluation(normalized)
          if (cached) {
            return NextResponse.json({ ...hydrateCommercial(cached), cached: true, isFree: false, review_id: res.review.id })
          }
        }
        if (res.kind === 'created' || res.kind === 'reused') {
          reviewRow = res.review
          await recordUsageEvent({
            email: userEmail, username: normalized, reviewId: reviewRow.id,
            eventType: res.kind === 'created' ? 'review_started' : 'review_reused',
            purchaseType: 'credits', status: reviewRow.status,
          })
        }
      }
```

在 `const consumeResult = await consumeCredit(userEmail, normalized)` 成功后（即 `if (isPaidMode) {` 块内、`fetchProfile` 之前）插入状态推进：

```typescript
        if (reviewRow) {
          reviewRow = (await transitionReview(reviewRow.id, 'quota_reserved')) ?? reviewRow
          reviewQuotaReserved = true
          await recordUsageEvent({
            email: userEmail, username: normalized, reviewId: reviewRow.id,
            eventType: 'quota_reserved', purchaseType: 'credits', status: 'quota_reserved',
          })
          await advance('fetching_data')
        }
```

在 `const profile = await fetchProfile(normalized)`（paid 分支）之后插入：

```typescript
        await advance('data_saved')
```

在 `let evaluation = scoreProfile(profile)` 之后插入：

```typescript
        await advance('analyzing')
```

在 `evaluation.avatarData = ...`（paid 分支）之后、`saveEvaluation` 之前插入：

```typescript
        await advance('report_generating')
```

在 paid 分支 `await upsertOwnership(userEmail, normalized, { isFree: false })` 之后、`recordEventFromRequest(... evaluate_done ...)` 之前插入：

```typescript
        if (reviewRow) {
          reviewRow = (await transitionReview(reviewRow.id, 'completed')) ?? reviewRow
          reviewQuotaReserved = false
          await recordUsageEvent({
            email: userEmail, username: normalized, reviewId: reviewRow.id,
            eventType: 'quota_consumed', purchaseType: 'credits', status: 'completed',
          })
          await recordUsageEvent({
            email: userEmail, username: normalized, reviewId: reviewRow.id,
            eventType: 'review_completed', purchaseType: 'credits', status: 'completed',
            meta: { score: evaluation.score, tier: evaluation.tier },
          })
        }
```

paid 分支的 return 改为附带 review_id：

```typescript
        return NextResponse.json({ ...evaluation, isFree: false, ...(reviewRow ? { review_id: reviewRow.id } : {}) })
```

- [ ] **Step 4: free 分支接入**

定位 free 分支 `const profile = await fetchProfile(normalized)`，在其之前（`recordFreeEvaluate` 块之后）插入：

```typescript
    // ── B1: 免费路径同样走幂等 + in-flight 锁（有 userEmail 时）──
    if (reviewStateMachineEnabled() && userEmail) {
      await reconcileInFlight(userEmail, normalized)
      const idemKey = typeof body.idempotency_key === 'string' && body.idempotency_key
        ? body.idempotency_key.slice(0, 64)
        : crypto.randomUUID()
      const res = await createOrGetReview(userEmail, normalized, idemKey, 'free_trial')
      if (res.kind === 'conflict') {
        return NextResponse.json(
          { error: 'A review for this account is already in progress.', code: 'REVIEW_IN_FLIGHT', review_id: res.review.id },
          { status: 409 }
        )
      }
      if (res.kind === 'created' || res.kind === 'reused') {
        reviewRow = res.review
        await recordUsageEvent({
          email: userEmail, username: normalized, reviewId: reviewRow.id,
          eventType: res.kind === 'created' ? 'review_started' : 'review_reused',
          purchaseType: 'free_trial', status: reviewRow.status,
        })
        await advance('quota_reserved') // 免费额度在上方 consumeFreeAllowance 已扣
        await advance('fetching_data')
      }
    }
```

在 free 分支 `const profile = await fetchProfile(normalized)` 之后插入：

```typescript
    await advance('data_saved')
    await advance('analyzing') // 免费路径 scoreProfile 即全部计算
```

在 free 分支 `await upsertOwnership(userEmail, normalized, { isFree: true })` 之后插入：

```typescript
    if (reviewRow) {
      reviewRow = (await transitionReview(reviewRow.id, 'completed')) ?? reviewRow
      await recordUsageEvent({
        email: userEmail, username: normalized, reviewId: reviewRow.id,
        eventType: 'quota_consumed', purchaseType: 'free_trial', status: 'completed',
      })
    }
```

free 分支的 return 改为：

```typescript
    return NextResponse.json({ ...stripForFreeMode(evaluation), ...(reviewRow ? { review_id: reviewRow.id } : {}) })
```

（免费 24h 缓存命中的 return 同样追加 `...(reviewRow ? { review_id: reviewRow.id } : {})`，缓存路径 reviewRow 为 null，等价于不变。）

- [ ] **Step 5: catch 块精确返还**

将现有 catch 开头的返还逻辑：

```typescript
    if (userEmail && !isFreeMode) {
      refundCredit(userEmail).catch(e =>
        console.error('[evaluate] refund failed:', e instanceof Error ? e.message : String(e))
      )
    }
```

替换为：

```typescript
    // ── B1: 精确返还——只有「review 行存在且仍活跃」才 fail + refund，
    // 修复旧路径"consume 之前出错也返还"的多退边界 ──
    if (reviewStateMachineEnabled() && reviewRow && !isTerminalStatus(reviewRow.status)) {
      const detail = err instanceof Error ? err.message : String(err)
      const failed = await failReview(reviewRow.id, detail)
      if (failed && failed.purchase_type === 'credits' && reviewQuotaReserved) {
        await refundCredit(failed.email)
        await recordUsageEvent({
          email: failed.email, username: failed.username, reviewId: failed.id,
          eventType: 'quota_released', purchaseType: failed.purchase_type,
          status: 'failed', meta: { reason: detail.slice(0, 200) },
        })
      }
    } else if (!reviewStateMachineEnabled() && userEmail && !isFreeMode) {
      // flag 关闭：保留旧行为（原样返还）
      refundCredit(userEmail).catch(e =>
        console.error('[evaluate] refund failed:', e instanceof Error ? e.message : String(e))
      )
    }
```

并在文件底部（POST 之外）加 helper：

```typescript
function isTerminalStatus(s: ReviewStatus): boolean {
  return s === 'completed' || s === 'failed'
}
```

同时在顶部 import 区补充：`import { isTerminalReview } from '@/lib/review-state'`，然后把上面 helper 直接删掉、统一用 `isTerminalReview(reviewRow.status)`（避免重复定义）。最终 catch 中判断为 `if (reviewStateMachineEnabled() && reviewRow && !isTerminalReview(reviewRow.status))`。

- [ ] **Step 6: 类型检查 + 全量测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc exit 0；vitest 全部 PASS（含既有 scoring/valuation/verdict 测试）

- [ ] **Step 7: Commit**

```bash
git add app/api/evaluate/route.ts
git commit -m "feat(b1): wire review state machine into evaluate route behind flag"
```

---

### Task 5: GET /api/reviews/:id 查询 + 惰性对账端点

**Files:**
- Create: `app/api/reviews/[id]/route.ts`

- [ ] **Step 1: 实现**

```typescript
// app/api/reviews/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getBearerToken, verifySessionToken } from '@/lib/auth'
import { getReview, reconcileInFlight } from '@/lib/reviews'
import { isStaleReview } from '@/lib/review-state'

export const dynamic = 'force-dynamic'

/**
 * Review 状态查询（前端轮询用）。
 * 附带惰性对账：活跃态超过 TTL → 判 failed + credits 自动返还（reconcileInFlight 内处理）。
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearerToken(req)
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }
  const payload = await verifySessionToken(token)
  if (!payload) {
    return NextResponse.json({ error: 'Session expired', code: 'NEED_VERIFY' }, { status: 401 })
  }

  const { id } = await params
  const row = await getReview(id)
  if (!row || row.email !== payload.email.toLowerCase().trim()) {
    return NextResponse.json({ error: 'Review not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  // 惰性对账：卡死状态超 TTL → failed + 返还
  if (!['completed', 'failed'].includes(row.status) && isStaleReview(row.status, row.state_entered_at)) {
    await reconcileInFlight(row.email, row.username)
    const fresh = await getReview(id)
    return NextResponse.json({ review: fresh ?? row })
  }

  return NextResponse.json({ review: row })
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add app/api/reviews/[id]/route.ts
git commit -m "feat(b1): add GET /api/reviews/:id with lazy timeout reconciliation"
```

---

### Task 6: 集成验证（flag 开 / 关两轮）

**Files:**
- Modify: `.env.local`（本地验证用，不提交）

- [x] **Step 1: flag 关闭回归**

确认 `.env.local` 无 `REVIEW_STATE_MACHINE`（或设为 `false`），启动 `npm run dev`。
用现有流程发起一次评估（带 session token），确认：响应无 `review_id` 字段、行为与旧版一致、`npx vitest run` 全绿。
实际执行（2026-08-19）：TSC 零错误；`vitest run lib/review-state.test.ts` 10/10 绿（`lib/scoring.test.ts` 有 1 例与本批无关的既有失败，git stash 复核确认为存量）；dev server 重启后 `POST /api/evaluate` 返回 200（Neon 不通自动降级 file 路径，行为同旧版）；`GET /api/reviews/:id` 无 token 401 / 坏 token 401，flag 关时 evaluate 响应不含 `review_id`（review 上下文恒 null）。带 token 的完整付费评估因 Neon 网络未复验，但 flag 关路径代码层面 review 逻辑完全旁路。

- [ ] **Step 2: flag 开启 + 幂等验证**（⚠️ 暂缓：本机到 Neon（api.c-5.us-east-1.aws.neon.tech:443）TLS 被重置，代理分流该域名失败，DB 依赖路径无法端到端执行；待网络恢复后照原步骤补验）

`.env.local` 加 `REVIEW_STATE_MACHINE=true`，重启 dev。携带同一 `idempotency_key` 连续两次 POST /api/evaluate（同 username、已付费 token）：

Run:
```bash
curl -s -X POST http://127.0.0.1:3000/api/evaluate \
  -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' \
  -d '{"username":"<someuser>","idempotency_key":"test-key-1","force":true}' | head -c 300
```
（连发两次）
Expected: 两次都成功且 `review_id` 相同；credits 只扣 1（`credit_usage_logs` 仅一条 consume）；`account_reviews` 仅一行。

- [ ] **Step 3: in-flight 冲突验证**（⚠️ 暂缓，同上）

用一个**不存在**的 username（如 `zzz_no_such_user_123`）发起请求，在第一个请求还在进行时立刻用**不同 idempotency_key** 再发一次。
Expected: 第二个请求返回 409 `REVIEW_IN_FLIGHT`；第一个请求最终 USER_NOT_FOUND → `account_reviews` 该行 status=failed，credits 已返还（`credit_usage_logs` 有 refund 行，`usage_events` 有 quota_released）。

- [ ] **Step 4: 失败返还验证（串行）**（⚠️ 暂缓，同上）

单独用不存在 username + `force:true` 发起一次。
Expected: 响应 404 USER_NOT_FOUND；查询 `usage_events`：review_started → review_failed → quota_released 齐全；credits 余额不变（consume + refund 对冲）。

- [ ] **Step 5: 验证 SQL（手工核对）**（⚠️ 暂缓，同上）

```sql
SELECT id, status, purchase_type, failure_reason FROM account_reviews ORDER BY created_at DESC LIMIT 5;
SELECT event_type, status, created_at FROM usage_events ORDER BY id DESC LIMIT 10;
SELECT action, credits, balance_after, reason FROM credit_usage_logs ORDER BY id DESC LIMIT 5;
```

- [x] **Step 6: 收尾 commit（如有 .env.local 之外的调整）+ 更新批次文档**

```bash
git add -A
git commit -m "test(b1): integration verification for idempotency, in-flight lock and refund"
```

在 `docs/TokValue-Batches.md` B1 验收标准勾选已完成项。

---

## Self-Review 记录

1. **Spec 覆盖**：幂等键（Task 3/4）、in-flight 锁（Task 3/4）、状态机+TTL（Task 1/3/5）、失败不扣费/精确返还（Task 4 Step 5）、计量流水（Task 2）、flag 并存（Task 4/6）——B1 验收标准 5 项全部有对应任务。
2. **占位符扫描**：无 TBD/TODO；所有代码步骤含完整代码。
3. **类型一致性**：`AccountReviewRow` 字段在 Task 3 定义、Task 4/5 引用一致；`ReviewStatus`/`isStaleReview`/`isTerminalReview` 命名统一；`recordUsageEvent` 签名 Task 2 定义与 Task 3/4 调用一致。
4. **已知取舍**：`transitionReview` 不在 DB 层强制 `canTransition` 全量校验（调用方线性推进，DB 只守终态）；file/memory 开发模式返回 unavailable 走旧路径；免费额度失败不回补（沿用现状，B2 处理）。
