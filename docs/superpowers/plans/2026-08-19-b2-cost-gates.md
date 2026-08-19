# B2 成本与防作弊闸门 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 24h 账号快照缓存（命中不调 RapidAPI）+ 免费三闸（邮箱 1 次 / username 全网 1 次 / IP 2 次每日）+ API 成本审计与供应商熔断，单次成本 ≤$0.10、免费获客成本 $0.02–0.05。

**Architecture:** 四个新 lib 模块（`username-normalize` / `api-governance` / `snapshots` / `free-grants`）全部遵循项目既有模式：postgres 优先、无 DATABASE_URL 时 no-op 降级（本地 file 开发模式行为不变）、env 每次调用动态读取（Vercel 热更新）。evaluate 路由在 paid/free 两条路径的 `fetchProfile` 之前插快照查询，免费路径按「缓存 → IP → 预算 → B1 幂等 → 邮箱主闸 → 快照 → username 辅闸」顺序过闸。UI 零变化（响应新增 `dataRefreshedHoursAgo` 字段，前端展示留给 B5a 报告重构）。

**Tech Stack:** Next.js 15 route handlers、`@neondatabase/serverless`（模板字符串 SQL）、Vitest（纯函数 TDD）、既有 `lib/rate-limit.ts` / `lib/db.ts` 模式。

**依据:** `docs/TokValue-Batches.md` §B2、`docs/TokValue-Spec-v2.md`。B1 已交付（`lib/reviews.ts` 状态机、`REVIEW_STATE_MACHINE` flag，本计划兼容 flag 开/关两种状态）。

**硬约束（来自 project_memory）:**
- env 必须每次调用时动态读取，不得模块级缓存
- TikTok API 网络错误重试策略不变（B2 只加观测与熔断，不改重试）
- 免费额度防作弊：邮箱唯一、归一化 username、IP 限流
- 不得虚构功能；定价文案不涉及（本批无 UI）

---

## File Structure

| 文件 | 操作 | 职责 |
|---|---|---|
| `lib/username-normalize.ts` | Create | 辅闸 key 归一化纯函数 |
| `lib/username-normalize.test.ts` | Create | 归一化测试 |
| `lib/api-governance.ts` | Create | api_call_logs / api_cost_daily / provider_health 三表 + 成本记账 + 预算闸 + 熔断 |
| `lib/api-governance.test.ts` | Create | 预算/冷却纯函数测试 |
| `lib/snapshots.ts` | Create | account_snapshots 表 + 24h 快照读写 |
| `lib/free-grants.ts` | Create | free_review_grants 表 + username 辅闸原子消耗 |
| `lib/tiktok.ts` | Modify | apiCallSingle 加审计埋点；fetchProfile 加 audit ctx；熔断过滤 provider |
| `lib/credits-server.ts` | Modify | `FREE_ALLOWANCE_LIMIT` 2 → 1 |
| `app/api/evaluate/route.ts` | Modify | 快照接线（paid+free）+ 免费三闸接线 + 预算闸 |
| `app/api/tiktokmaster/logs/route.ts` | Modify | `?source=api` 返回 API 成本日志 |
| `docs/TokValue-Batches.md` | Modify | B2 验收勾选 |

**依赖顺序:** Task 1–5 相互独立可并行；Task 6（evaluate 接线）依赖 1/2/4/5；Task 7 依赖 2；Task 8 收尾。

**关键设计决策:**
1. 快照以 `sec_uid` 为主键（账号唯一标识，改名不变），`normalized_username` 做查询索引（evaluate 只有 username 入参）。
2. 熔断 fail-open：DB 故障或全部 provider 熔断时放行全部，绝不因治理模块自身故障中断评估。
3. 辅闸两段式：`hasFreeGrant` 预检（不破坏）在邮箱主闸之前拦截最常见滥用；`consumeFreeGrant` 原子消耗紧贴 fetch。并发双花边界（两个新邮箱同一秒打同一 username） documented 已知取舍。
4. USER_NOT_FOUND 对熔断计为"provider 成功"（HTTP 往返正常，业务性 404 不烧供应商）。
5. 成本口径：仅成功的 API 调用计费（失败调用记 0 成本），单次调用成本 env 可调，默认 $0.01。

---

### Task 1: username 归一化纯函数

**Files:**
- Create: `lib/username-normalize.ts`
- Test: `lib/username-normalize.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// lib/username-normalize.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeForGrantKey } from './username-normalize'

describe('normalizeForGrantKey', () => {
  it('strips leading @, lowercases, trims', () => {
    expect(normalizeForGrantKey('  @John.Doe  ')).toBe('johndoe')
  })

  it('removes dots, underscores and hyphens (variant abuse)', () => {
    expect(normalizeForGrantKey('john.doe')).toBe('johndoe')
    expect(normalizeForGrantKey('john_doe')).toBe('johndoe')
    expect(normalizeForGrantKey('john-doe')).toBe('johndoe')
    expect(normalizeForGrantKey('John.Doe_99-x')).toBe('johndoe99x')
  })

  it('preserves letters and digits including unicode', () => {
    expect(normalizeForGrantKey('张三123')).toBe('张三123')
  })

  it('collapses the same account expressed differently to one key', () => {
    const a = normalizeForGrantKey('@John.Doe')
    const b = normalizeForGrantKey('john_doe')
    const c = normalizeForGrantKey('JOHN-doe')
    expect(a).toBe(b)
    expect(b).toBe(c)
  })

  it('handles empty and garbage input safely', () => {
    expect(normalizeForGrantKey('')).toBe('')
    expect(normalizeForGrantKey('...___---')).toBe('')
    expect(normalizeForGrantKey('@@@')).toBe('')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run lib/username-normalize.test.ts`
Expected: FAIL — `Cannot find module './username-normalize'`

- [ ] **Step 3: 写实现**

```typescript
// lib/username-normalize.ts
/**
 * Username 归一化：免费辅闸（同账号全网 1 次免费生成）的 key 计算。
 * 规则：去首尾空格 + 去首部 @ + 小写 + 去特殊字符（. _ -）。
 * 目的：john.doe / John_Doe / @john-doe 归并为同一 key，堵住变体绕过辅闸。
 */
export function normalizeForGrantKey(input: string): string {
  return String(input || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[._-]/g, '')
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run lib/username-normalize.test.ts`
Expected: PASS 5/5

- [ ] **Step 5: Commit**

```bash
git add lib/username-normalize.ts lib/username-normalize.test.ts
git commit -m "feat(b2): add username normalization for free grant key"
```

---

### Task 2: API 治理 —— 成本记账 + 预算闸

**Files:**
- Create: `lib/api-governance.ts`
- Test: `lib/api-governance.test.ts`

- [ ] **Step 1: 写失败测试（纯函数部分）**

```typescript
// lib/api-governance.test.ts
import { describe, it, expect } from 'vitest'
import { isOverBudget, nextCooldownMs, BREAKER_FAILURE_THRESHOLD, todayKey, monthStartKey } from './api-governance'

describe('isOverBudget', () => {
  const cfg = { dailyUsd: 10, monthlyUsd: 150 }
  it('allows when both under budget', () => {
    expect(isOverBudget(9.99, 149, cfg)).toBe(false)
  })
  it('pauses when daily cost reaches budget (触达即暂停)', () => {
    expect(isOverBudget(10, 0, cfg)).toBe(true)
  })
  it('pauses when monthly cost reaches budget', () => {
    expect(isOverBudget(0, 150, cfg)).toBe(true)
  })
  it('zero-cost day never paused', () => {
    expect(isOverBudget(0, 0, cfg)).toBe(false)
  })
})

describe('nextCooldownMs', () => {
  it('base cooldown 5 minutes at threshold', () => {
    expect(nextCooldownMs(BREAKER_FAILURE_THRESHOLD)).toBe(5 * 60_000)
  })
  it('doubles per extra failure', () => {
    expect(nextCooldownMs(BREAKER_FAILURE_THRESHOLD + 1)).toBe(10 * 60_000)
    expect(nextCooldownMs(BREAKER_FAILURE_THRESHOLD + 2)).toBe(20 * 60_000)
  })
  it('capped at 30 minutes', () => {
    expect(nextCooldownMs(BREAKER_FAILURE_THRESHOLD + 5)).toBe(30 * 60_000)
  })
  it('below threshold returns base (not used for opening, defensive)', () => {
    expect(nextCooldownMs(1)).toBe(5 * 60_000)
  })
})

describe('date keys', () => {
  it('todayKey is YYYY-MM-DD (UTC)', () => {
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
  it('monthStartKey is YYYY-MM-01 (UTC)', () => {
    expect(monthStartKey()).toMatch(/^\d{4}-\d{2}-01$/)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run lib/api-governance.test.ts`
Expected: FAIL — `Cannot find module './api-governance'`

- [ ] **Step 3: 写实现**

```typescript
// lib/api-governance.ts
/**
 * API 治理：成本审计（api_call_logs / api_cost_daily）+ 免费预算闸 + 供应商熔断（provider_health）。
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

// ── Admin 查询（Task 7 使用） ──

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
```

注：熔断的 DB 读写函数（`recordProviderOutcome` / `isProviderCircuitOpen`）在 Task 3 追加到本文件。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run lib/api-governance.test.ts`
Expected: PASS（isOverBudget 4 + nextCooldownMs 4 + date keys 2 = 10）

- [ ] **Step 5: Commit**

```bash
git add lib/api-governance.ts lib/api-governance.test.ts
git commit -m "feat(b2): api cost ledger and free budget gate"
```

---

### Task 3: API 治理 —— 供应商熔断 + tiktok.ts 接线

**Files:**
- Modify: `lib/api-governance.ts`（追加熔断函数）
- Modify: `lib/tiktok.ts`（apiCallSingle 审计、fetchProfile audit ctx、provider 过滤）
- Test: `lib/api-governance.test.ts`（追加）

- [ ] **Step 1: 追加纯函数测试（如尚无 nextCooldownMs 覆盖则已在 Task 2；本步追加无需新纯函数，直接进实现）**

熔断阈值/冷却纯函数已在 Task 2 覆盖（`nextCooldownMs` / `BREAKER_FAILURE_THRESHOLD`）。本任务只加 DB 函数与接线，无新纯函数。

- [ ] **Step 2: 在 `lib/api-governance.ts` 末尾追加熔断 DB 函数**

```typescript
// ── 供应商熔断 ──
// 连续失败 ≥ BREAKER_FAILURE_THRESHOLD → 熔断冷却 nextCooldownMs()；
// 成功一次即清零。DB 故障 fail-open（不熔断任何供应商）。

export async function recordProviderOutcome(host: string, ok: boolean): Promise<void> {
  const s = await getSql()
  if (!s) return
  try {
    if (ok) {
      await s`
        INSERT INTO provider_health (host, consecutive_failures, open_until, updated_at)
        VALUES (${host}, 0, NULL, NOW())
        ON CONFLICT (host) DO UPDATE SET consecutive_failures = 0, open_until = NULL, updated_at = NOW()
      `
      return
    }
    const rows = await s`
      INSERT INTO provider_health (host, consecutive_failures, updated_at)
      VALUES (${host}, 1, NOW())
      ON CONFLICT (host) DO UPDATE SET
        consecutive_failures = provider_health.consecutive_failures + 1,
        updated_at = NOW()
      RETURNING consecutive_failures
    `
    const failures = Number(rows[0]?.consecutive_failures || 0)
    if (failures >= BREAKER_FAILURE_THRESHOLD) {
      const cooldown = nextCooldownMs(failures)
      await s`
        UPDATE provider_health
        SET open_until = NOW() + (${cooldown}::bigint * interval '1 millisecond')
        WHERE host = ${host}
      `
    }
  } catch (err) {
    console.warn('[api-governance] recordProviderOutcome failed (non-fatal):', err instanceof Error ? err.message : String(err))
  }
}

export async function isProviderCircuitOpen(host: string): Promise<boolean> {
  const s = await getSql()
  if (!s) return false
  try {
    const rows = await s`SELECT open_until FROM provider_health WHERE host = ${host}`
    const until = rows[0]?.open_until
    if (!until) return false
    return new Date(String(until)).getTime() > Date.now()
  } catch {
    return false // fail-open
  }
}
```

- [ ] **Step 3: 改 `lib/tiktok.ts` —— import 与 ProviderAdapter 签名**

文件顶部（第 1 行 `import { RawProfile, Post, SearchUserResult } from '@/types'` 之后）加：

```typescript
import { recordApiCall, recordProviderOutcome, isProviderCircuitOpen, readCostPerCallUsd } from '@/lib/api-governance'

/** 评估链路审计上下文：随 fetchProfile 传入，落到 api_call_logs（review_id / purchase_type 归属） */
export interface AuditCtx {
  reviewId?: string
  purchaseType?: string
}
```

`ProviderAdapter` 接口（~L424）改为：

```typescript
interface ProviderAdapter {
  name: string
  /** 获取用户资料（含视频），返回标准 RawProfile */
  fetchProfile(username: string, provider: ProviderConfig, audit?: AuditCtx): Promise<RawProfile>
}
```

- [ ] **Step 4: 改 `apiCallSingle` —— 审计 + 熔断上报**

签名（L316-322）改为：

```typescript
async function apiCallSingle(
  provider: ProviderConfig,
  method: 'GET' | 'POST',
  path: string,
  body: Record<string, unknown> | undefined,
  label: string,
  options: { timeoutMs?: number; throwOnError?: boolean; audit?: AuditCtx } = {}
): Promise<Record<string, unknown>> {
```

函数体开头（`const { host, apiKey } = provider` 之前）插入计时与包裹变量：

```typescript
  const fnStart = Date.now()
  let callOk = false
  const { host, apiKey } = provider
  const { timeoutMs = 15000, throwOnError = true, audit } = options
```

原 `const { timeoutMs = 15000, throwOnError = true } = options` 行删除。

将整个重试 for 循环与返回包进 try/finally：

```typescript
  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // ……原有循环体完全不变，仅以下两处微调……
      // 1) USER_NOT_FOUND 抛错前（`throw new TikTokApiError(errMsg, 'USER_NOT_FOUND', 404)` 之前）插一行：
      //    callOk = true // provider HTTP 往返正常，业务性 404 不计入熔断
      // 2) 函数末尾 `return root` 之前插一行：
      //    callOk = true
    }
    return root
  } finally {
    const durationMs = Date.now() - fnStart
    recordProviderOutcome(host, callOk).catch(() => {})
    recordApiCall({
      host,
      endpoint: label,
      ok: callOk,
      durationMs,
      costUsd: callOk ? readCostPerCallUsd() : 0,
      reviewId: audit?.reviewId ?? null,
      purchaseType: audit?.purchaseType ?? null,
    }).catch(() => {})
  }
```

具体落点（对照现有代码）：
- L402 `throw new TikTokApiError(errMsg, 'USER_NOT_FOUND', 404)` → 前一行加 `callOk = true`
- L416 `return root`（`console.log(...OK...)` 之后）→ 前一行加 `callOk = true`
- 其余 throw 路径（NETWORK_ERROR / RATE_LIMIT / API_ERROR / invalid JSON）保持 `callOk = false`，由 finally 统一上报失败
- `if (!throwOnError) return {}` 两处：`callOk` 保持 false（空响应即失败）✓

- [ ] **Step 5: 改 `fetchProfile` —— audit 参数 + 熔断过滤 + summary 记录**

整体替换 `fetchProfile`（L548-577）：

```typescript
export async function fetchProfile(inputUsername: string, audit?: AuditCtx): Promise<RawProfile> {
  const username = normalizeUsername(inputUsername)
  if (!username) throw new TikTokApiError('Empty username', 'INVALID_USERNAME', 400)

  const all = getProviders()
  if (all.length === 0) {
    throw new TikTokApiError('RAPIDAPI_KEY not configured', 'MISSING_API_KEY', 503)
  }

  // ── B2 熔断过滤：跳过 open_until 未到期的供应商；全部熔断时 fail-open 放行 ──
  const openFlags = await Promise.all(all.map(p => isProviderCircuitOpen(p.host)))
  let providers = all.filter((_, i) => !openFlags[i])
  if (providers.length === 0) {
    console.warn('[tiktok] all providers circuit-open — failing open')
    providers = all
  }

  let lastError: unknown = null

  for (const provider of providers) {
    const adapter = ADAPTERS[provider.host]
    if (!adapter) {
      console.warn(`[tiktok] no adapter for host ${provider.host}, skipping`)
      continue
    }
    try {
      console.log(`[tiktok] trying ${adapter.name} (${provider.host})`)
      const t0 = Date.now()
      const profile = await adapter.fetchProfile(username, provider, audit)
      // profile 级汇总审计（字段缺失观测）：dataQuality / postCount / secUid 是否齐全
      recordApiCall({
        host: provider.host,
        endpoint: 'profile_summary',
        ok: true,
        durationMs: Date.now() - t0,
        costUsd: 0,
        reviewId: audit?.reviewId ?? null,
        purchaseType: audit?.purchaseType ?? null,
        meta: {
          dataQuality: profile.dataQuality,
          postCount: profile.posts?.length ?? 0,
          secUidPresent: !!profile.secUid,
        },
      }).catch(() => {})
      return profile
    } catch (err) {
      // USER_NOT_FOUND 不切换 provider
      if (err instanceof TikTokApiError && err.code === 'USER_NOT_FOUND') throw err
      lastError = err
      console.warn(`[tiktok] ${adapter.name} failed: ${err instanceof Error ? err.message : err}, trying next provider...`)
    }
  }

  throw lastError || new TikTokApiError('All providers exhausted', 'API_ERROR', 500)
}
```

- [ ] **Step 6: 三个适配器与 fetchPosts 助手透传 audit**

机械改动（每个都是加一个可选参数并向下传递）：
- `API6_ADAPTER.fetchProfile(username, provider, audit?)`：`apiCallSingle(provider, 'POST', '/user/details', { username }, 'user/details', { timeoutMs: 20000, audit })`；`fetchPostsApi6(username, provider, audit)`
- `fetchPostsApi6(username, provider, audit?)`：内部 `apiCallSingle(..., { timeoutMs: 12000, audit })`
- `API23_ADAPTER.fetchProfile(username, provider, audit?)`：同样透传（该适配器内 user/info 调用与 `fetchPostsApi23(username, secUid, provider, audit)`）
- `fetchPostsApi23(username, secUid, provider, audit?)`：透传
- `SCRAPER7_ADAPTER.fetchProfile(username, provider, audit?)` 与 `fetchPostsScraper7(username, provider, audit?)`：同法
- `searchUsers` 不改（audit 为可选参数，旧调用零破坏；其 apiCallSingle 调用 audit 为 undefined，照常记日志但 review_id/purchase_type 为空）

- [ ] **Step 7: 类型检查 + 全量测试**

Run: `npx tsc --noEmit && npx vitest run lib/username-normalize.test.ts lib/api-governance.test.ts lib/review-state.test.ts`
Expected: TSC 零错误；三组测试全绿

- [ ] **Step 8: Commit**

```bash
git add lib/api-governance.ts lib/tiktok.ts
git commit -m "feat(b2): circuit breaker and per-call audit wired into tiktok providers"
```

---

### Task 4: 24h 账号快照缓存

**Files:**
- Create: `lib/snapshots.ts`

- [ ] **Step 1: 写实现（含纯函数；DB 部分运行时验证）**

```typescript
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
```

- [ ] **Step 2: 快照纯函数测试（新建 `lib/snapshots.test.ts`）**

```typescript
// lib/snapshots.test.ts
import { describe, it, expect } from 'vitest'
import { snapshotAgeHours, isSnapshotFresh, SNAPSHOT_TTL_HOURS } from './snapshots'

describe('snapshotAgeHours', () => {
  it('computes hours since fetch', () => {
    const now = Date.now()
    expect(snapshotAgeHours(new Date(now - 2 * 3600_000), now)).toBeCloseTo(2)
  })
  it('invalid date → Infinity (treated stale)', () => {
    expect(snapshotAgeHours('garbage')).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('isSnapshotFresh', () => {
  it('fresh within TTL', () => {
    expect(isSnapshotFresh(0)).toBe(true)
    expect(isSnapshotFresh(SNAPSHOT_TTL_HOURS - 0.01)).toBe(true)
  })
  it('stale at/after TTL, negative or infinite', () => {
    expect(isSnapshotFresh(SNAPSHOT_TTL_HOURS)).toBe(false)
    expect(isSnapshotFresh(48)).toBe(false)
    expect(isSnapshotFresh(-1)).toBe(false)
    expect(isSnapshotFresh(Number.POSITIVE_INFINITY)).toBe(false)
  })
})
```

- [ ] **Step 3: 跑测试**

Run: `npx vitest run lib/snapshots.test.ts`
Expected: PASS 4/4

- [ ] **Step 4: TSC + Commit**

Run: `npx tsc --noEmit`

```bash
git add lib/snapshots.ts lib/snapshots.test.ts
git commit -m "feat(b2): 24h account snapshot cache keyed by sec_uid"
```

---

### Task 5: username 辅闸（free_review_grants）

**Files:**
- Create: `lib/free-grants.ts`

- [ ] **Step 1: 写实现**

```typescript
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
```

- [ ] **Step 2: TSC 验证**

Run: `npx tsc --noEmit`
Expected: 零错误

- [ ] **Step 3: Commit**

```bash
git add lib/free-grants.ts
git commit -m "feat(b2): free username grant gate with atomic consume"
```

---

### Task 6: evaluate 路由接线（快照 + 三闸 + 预算）

**Files:**
- Modify: `lib/credits-server.ts:356`
- Modify: `app/api/evaluate/route.ts`

- [ ] **Step 1: 主闸收紧 —— `FREE_ALLOWANCE_LIMIT` 2 → 1**

`lib/credits-server.ts` L356：

```typescript
export const FREE_ALLOWANCE_LIMIT = 1
```

（Spec v2：免费试用一次。已用过 1 次的存量邮箱随收紧失去第 2 次——预期行为。）

- [ ] **Step 2: evaluate 路由 —— import 区追加**

```typescript
import { getFreshSnapshot, upsertSnapshot } from '@/lib/snapshots'
import { hasFreeGrant, consumeFreeGrant } from '@/lib/free-grants'
import { isFreeBudgetExceeded } from '@/lib/api-governance'
import type { RawProfile } from '@/types'
```

- [ ] **Step 3: paid 路径 —— 快照优先（anchor：L282 `const profile = await fetchProfile(normalized)`）**

替换为：

```typescript
        // ── B2: 24h 快照优先——命中跳过 RapidAPI（照常扣费）；force 刷新则跳过快照 ──
        let profile: RawProfile
        let dataRefreshedHoursAgo: number | undefined
        const snap = forceRefresh ? null : await getFreshSnapshot(normalized)
        if (snap) {
          profile = snap.profile
          dataRefreshedHoursAgo = Math.floor(snap.ageHours)
          await advance('data_saved')
        } else {
          profile = await fetchProfile(normalized, { reviewId: reviewRow?.id ?? undefined, purchaseType: 'credits' })
          await advance('data_saved')
          await upsertSnapshot(profile)
        }
```

paid 最终响应（L321）加字段：

```typescript
        return NextResponse.json({
          ...evaluation,
          isFree: false,
          ...(reviewRow ? { review_id: reviewRow.id } : {}),
          ...(dataRefreshedHoursAgo !== undefined ? { dataRefreshedHoursAgo } : {}),
        })
```

- [ ] **Step 4: free 路径 —— 预算闸（anchor：IP 限流 429 块之后、`// ── B1: 免费路径幂等` 之前）**

```typescript
    // ── B2: 免费预算闸——日/月 API 成本触达阈值 → 暂停免费生成（付费不受影响）──
    if (await isFreeBudgetExceeded()) {
      recordEventFromRequest(req, {
        event_type: 'api_error',
        path: '/api/evaluate',
        username: normalized,
        metadata: { error_code: 'FREE_BUDGET_PAUSED', ip: clientIp },
      }).catch(() => {})
      return NextResponse.json(
        { error: 'Free evaluations are temporarily paused due to high demand. Please try again later or upgrade to unlock yours now.', code: 'FREE_BUDGET_PAUSED' },
        { status: 503 }
      )
    }
```

- [ ] **Step 5: free 路径 —— 辅闸预检（anchor：`if (!IS_DEV) {` consumeFreeAllowance 块之前）**

```typescript
    // ── B2 辅闸预检：该 username 已被免费生成过 → 直接拒（不消耗邮箱主闸/IP 之外的任何东西；
    // 付费路径不受影响；本邮箱 24h 免费缓存命中已在更早处 return）──
    if (!IS_DEV || userEmail) {
      if (await hasFreeGrant(normalized)) {
        if (reviewStateMachineEnabled() && reviewRow && !isTerminalReview(reviewRow.status)) {
          await failReview(reviewRow.id, 'free_username_grant_used').catch(() => {})
          reviewRow = null
        }
        return NextResponse.json(
          { error: 'This account has already been analyzed with a free review. Upgrade to unlock a fresh one.', code: 'FREE_USERNAME_USED' },
          { status: 403 }
        )
      }
    }
```

（dev 无 token 时跳过：`!IS_DEV || userEmail` —— prod 必有 userEmail，dev 带 token 的降级用户也过闸。）

- [ ] **Step 6: free 路径 —— 快照优先 + 辅闸原子消耗（anchor：L427-435）**

替换：

```typescript
    if (reviewRow) {
      // 免费额度已在上方 consumeFreeAllowance 原子扣减
      await advance('quota_reserved')
      await advance('fetching_data')
    }

    const profile = await fetchProfile(normalized)
    await advance('data_saved')
    await advance('analyzing') // 免费路径 scoreProfile 即全部计算
```

为：

```typescript
    if (reviewRow) {
      // 免费额度已在上方 consumeFreeAllowance 原子扣减
      await advance('quota_reserved')
      await advance('fetching_data')
    }

    // ── B2: 快照优先——24h 内拉取过的账号直接复用，不调 RapidAPI、不耗辅闸 ──
    let profile: RawProfile | null = (await getFreshSnapshot(normalized))?.profile ?? null
    if (!profile) {
      // ── B2 辅闸原子消耗：并发下仅一个请求拿到该 username 的免费名额 ──
      const grant = await consumeFreeGrant(normalized, userEmail || undefined)
      if (!grant.ok) {
        if (reviewRow) {
          await failReview(reviewRow.id, 'free_username_grant_used').catch(() => {})
          reviewRow = null
        }
        return NextResponse.json(
          { error: 'This account has already been analyzed with a free review. Upgrade to unlock a fresh one.', code: 'FREE_USERNAME_USED' },
          { status: 403 }
        )
      }
      profile = await fetchProfile(normalized, { reviewId: reviewRow?.id ?? undefined, purchaseType: 'free_trial' })
      await upsertSnapshot(profile)
    }
    await advance('data_saved')
    await advance('analyzing') // 免费路径 scoreProfile 即全部计算
```

- [ ] **Step 7: TSC + 回归**

Run: `npx tsc --noEmit && npx vitest run lib/review-state.test.ts lib/username-normalize.test.ts lib/api-governance.test.ts lib/snapshots.test.ts`
Expected: 零错误，全绿

- [ ] **Step 8: Commit**

```bash
git add lib/credits-server.ts app/api/evaluate/route.ts
git commit -m "feat(b2): snapshot-first evaluate, free gates and budget pause"
```

---

### Task 7: admin 成本日志端点

**Files:**
- Modify: `app/api/tiktokmaster/logs/route.ts`
- Modify: `lib/api-governance.ts`（getRecentApiCalls / getCostSummary 已在 Task 2 定义，本任务直接使用）

- [ ] **Step 1: 扩展 logs 路由**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth } from '@/lib/admin-auth'
import { getRecentEvents } from '@/lib/analytics'
import { getRecentApiCalls, getCostSummary } from '@/lib/api-governance'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const authError = await requireAdminAuth(req)
  if (authError) return authError

  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 200)
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0)

  // ── B2: ?source=api → RapidAPI 调用审计 + 成本汇总（单次 Review 成本可查）──
  if (url.searchParams.get('source') === 'api') {
    try {
      const [items, cost] = await Promise.all([getRecentApiCalls(limit, offset), getCostSummary()])
      return NextResponse.json({ items: items.items, total: items.total, cost })
    } catch (err) {
      console.error('[admin-logs] api source error:', err)
      return NextResponse.json({ items: [], total: 0, cost: null, error: '获取 API 日志失败' }, { status: 500 })
    }
  }

  try {
    // 走 lib/analytics 统一管道，确保 initDb() 已执行（表已创建）
    const { items, total } = await getRecentEvents(limit, offset)
    return NextResponse.json({ items, total })
  } catch (err) {
    console.error('[admin-logs] error:', err)
    return NextResponse.json({ items: [], total: 0, error: '获取日志失败' }, { status: 500 })
  }
}
```

- [ ] **Step 2: TSC + Commit**

Run: `npx tsc --noEmit`

```bash
git add app/api/tiktokmaster/logs/route.ts
git commit -m "feat(b2): admin api cost logs endpoint"
```

---

### Task 8: 集成验证 + 批次文档

**Files:**
- Modify: `docs/TokValue-Batches.md`
- Modify: `docs/superpowers/plans/2026-08-19-b2-cost-gates.md`（勾选）

- [ ] **Step 1: 全量静态检查**

Run: `npx tsc --noEmit && npx vitest run lib/username-normalize.test.ts lib/api-governance.test.ts lib/snapshots.test.ts lib/review-state.test.ts`
Expected: 零错误全绿（`lib/scoring.test.ts` 既有失败与本批无关，不跑）

- [ ] **Step 2: dev server 回归（flag 关 + 无 DATABASE_URL 场景行为不变）**

```bash
npm run dev
curl -s --max-time 15 -X POST http://127.0.0.1:3000/api/evaluate -H 'Content-Type: application/json' -d '{"username":"demo"}'
```
Expected: 行为与 B1 验证时一致（dev 免费路径正常返回 / 或 dev token 流程照旧）。治理/快照/辅闸模块在无 DB 或 DB 故障时全部 no-op，不改变旧路径。

- [ ] **Step 3: DB 深度验证（Neon 网络恢复后；否则标注暂缓）**

带 token 验证四条（详见下方 SQL）：
1. 快照：同 username 连续两次 force=false 评估 → `SELECT COUNT(*) FROM api_call_logs WHERE created_at > NOW() - interval '5 minutes'` 第二次新增 0 行 user/details
2. 辅闸：换新邮箱免费评估同 username → 403 `FREE_USERNAME_USED`
3. 预算：`UPDATE api_cost_daily SET cost_usd = 999 WHERE date_key = CURRENT_DATE` → 免费评估 503 `FREE_BUDGET_PAUSED`；付费评估正常；验证后改回
4. 成本可查：`GET /api/tiktokmaster/logs?source=api`（admin token）→ items + cost.todayUsd

```sql
SELECT id, host, endpoint, ok, duration_ms, cost_usd, review_id FROM api_call_logs ORDER BY id DESC LIMIT 10;
SELECT * FROM account_snapshots ORDER BY fetched_at DESC LIMIT 5;
SELECT * FROM free_review_grants ORDER BY created_at DESC LIMIT 5;
SELECT * FROM provider_health;
```

- [ ] **Step 4: 更新 `docs/TokValue-Batches.md` B2 验收勾选 + 本计划勾选**

- [ ] **Step 5: 收尾 Commit**

```bash
git add docs/TokValue-Batches.md docs/superpowers/plans/2026-08-19-b2-cost-gates.md
git commit -m "docs(b2): batch verification results"
```

---

## Self-Review 记录

1. **Spec 覆盖**：快照缓存 24h/sec_uid/命中扣费（Task 4/6）✓；username 归一化（Task 1）✓；免费三闸 主闸邮箱 1 次（Task 6 Step 1）/ 辅闸 username 全网 1 次·缓存命中不计（Task 5/6 Step 5-6：快照命中路径在 consumeFreeGrant 之前 return profile）/ 兜底 IP 2 次每日（既有，未动）✓；API 审计 review_id/endpoint/耗时/字段缺失/成本（Task 2/3：api_call_logs + profile_summary meta.dataQuality）✓；日 $10/月 $150 预算暂停免费（Task 2 isFreeBudgetExceeded + Task 6 Step 4）✓；供应商连续失败熔断切换（Task 3）✓；验收五条各有对应验证步骤（Task 8）✓。
2. **占位符扫描**：无 TBD/TODO；所有代码步骤含完整代码；「机械改动」处逐文件列出签名与落点。
3. **类型一致性**：`AuditCtx` Task 3 定义、apiCallSingle/fetchProfile/适配器统一；`FreshSnapshot` Task 4 定义、Task 6 消费 `snap.profile`/`snap.ageHours` 一致；`consumeFreeGrant(username, email?)` Task 5 定义、Task 6 调用一致；`RawProfile` 来自 `@/types` 与 tiktok.ts 一致。免费路径变量名 `profile`（paid）与 `profile`（free，let null 起始）各自作用域独立无冲突。
4. **已知取舍**：辅闸并发双花边界（两新邮箱同秒同 username，后者邮箱主闸已耗）——概率极低，预算闸兜底；熔断/辅闸/预算 DB 故障全部 fail-open（治理不得中断业务）；`FREE_ALLOWANCE_LIMIT` 2→1 对存量用户是收紧（Spec 拍板）；searchUsers 不带 audit（低频，无 review 归属）。
