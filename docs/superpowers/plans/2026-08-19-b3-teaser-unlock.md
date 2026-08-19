# B3 Teaser 分层 + 解锁门 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 免费报告从「全量白名单」收紧为 Spec §3.3 的 Teaser 边界，付费墙成为统一解锁门（走现有支付，零支付改动），解锁后平滑滚动至解锁区。

**Architecture:** 后端把 `stripForFreeMode` 替换为纯函数 `stripForTeaser`（lib/teaser.ts，TDD）；API 响应统一携带派生字段 `access_level: 'teaser' | 'full'`（不新增 DB 列，`is_free` 仍是唯一事实源）。前端新增 `TeaserReport` 组件（三层钩子：免费钩子 → 半遮罩预览 → 锁定价值栈），免费态渲染它、付费态保留 CommercialSnapshotTab；解锁流补 404 回退（无 Teaser → 发起新完整 Review）、`unlock_completed` 埋点与平滑滚动。

**Tech Stack:** Next.js 15 App Router、TypeScript、Vitest、Neon（免迁移）、lucide-react。

---

## 关键设计决策（已拍板，任务中不再讨论）

1. **`access_level` 是 API 派生字段，不加 DB 列**。`evaluations.is_free` 已完整表达 teaser/full 语义，新增列会制造双事实源。响应里 `isFree: true → access_level: 'teaser'`；`isFree: false → access_level: 'full'`。
2. **Teaser 白名单基于现有数据结构**（Spec §3.3 ↔ 现有字段映射）：
   - 价值区间 = `businessValue.totalValue`（**去掉 components/summary**——四分项拆解锁定）
   - 置信度 = `commercialSnapshot.dataConfidence`（已存在）
   - 价值层级 = `tier` + `commercialSnapshot.readinessBand`（已存在，B5a 才改展示名）
   - 最大瓶颈 = `commercialSnapshot.primaryRateBlocker` + `riskFlags[0]`
   - Top 3 视频 = `posts` 按 `playCount` 降序取 3（**新增下发**，当前免费层无 posts）
   - 任务#1 标题 = **B6 范围，本批不实现**，在锁定栈中作占位项
3. **从免费层移除（收紧）**：`dimensions`、`metrics`、`peerBenchmark`、`summary`、`verdict`、`advice`，以及 `commercialSnapshot` 的 `readinessScore / positioning / strongestLever / nextMove / suggestedRateRange`（全部归入锁定内容）。
4. **前端分叉渲染**：`isPremium ? CommercialSnapshotTab : TeaserReport`。CommercialSnapshotTab 不动（付费态继续用），避免到处加 undefined 守卫。MonetizationChecklist 两态都保留（平台资格事实，免费可见）。
5. **埋点**：`/api/track` 白名单加 `teaser_viewed / paywall_viewed / unlock_completed`；`deal_toolkit_paywall_viewed` 改名为 `paywall_viewed`（admin 无引用，已核实仅 `paywall_view` 被 dashboard 引用，保留不动）。
6. **upgrade 路由机制不动**：已满足「同报告升 full、零 API 成本」（不调 RapidAPI）。只补 `access_level: 'full'` 响应字段。前端补 404 分支 → `handleEvaluate`（带 token 走付费完整 Review）。

---

### Task 1: lib/teaser.ts — stripForTeaser 纯函数（TDD）

**Files:**
- Create: `lib/teaser.ts`
- Test: `lib/teaser.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// lib/teaser.test.ts
import { describe, it, expect } from 'vitest'
import { stripForTeaser, topPostsByPlays } from './teaser'
import type { Evaluation, Post } from '../types'

const post = (id: string, playCount: number): Post => ({
  id, playCount, likeCount: 10, commentCount: 1, shareCount: 1,
  createTime: 1700000000, desc: `video ${id}`,
})

const baseEvaluation = {
  username: 'demo', nickname: 'Demo', score: 72, tier: 'B',
  followerCount: 10000, followingCount: 100, totalLikes: 500000, videoCount: 40,
  region: 'US', verified: false,
  summary: { headline: 'x' }, verdict: 'v', advice: 'a', priceAdvice: 'p',
  metrics: { engagementRate: 1, avgPlays: 2, playGrowth: 3 },
  riskFlags: [
    { level: 'low', label: 'minor', detail: 'd' },
    { level: 'high', label: 'serious', detail: 'd2' },
  ],
  accountProfile: { categories: ['Beauty'], personaType: 'p', postingRhythm: 'r' },
  businessValue: {
    totalValue: { low: 18400, mid: 22000, high: 26700 },
    components: [{ label: 'Brand Deal Potential', icon: 'i', amount: { low: 1, mid: 2, high: 3 }, percentage: 40, detail: 'd' }],
    summary: 's',
  },
  commercialSnapshot: {
    readinessScore: 66,
    readinessBand: 'Growth Value',
    positioning: 'pos',
    suggestedRateRange: { low: 1, mid: 2, high: 3 },
    strongestLever: { label: 'l', detail: 'd' },
    primaryRateBlocker: { label: 'blocker', detail: 'why', impact: 'i' },
    nextMove: { title: 't', detail: 'd', effortHours: 1 },
    dataConfidence: 'medium',
  },
  peerBenchmark: { percentile: 50 },
  posts: [post('a', 100), post('b', 500), post('c', 300), post('d', 50), post('e', 400)],
  computedAt: '2026-08-19T00:00:00Z',
} as unknown as Evaluation

describe('topPostsByPlays', () => {
  it('returns top N posts sorted by playCount desc', () => {
    expect(topPostsByPlays(baseEvaluation.posts, 3).map(p => p.id)).toEqual(['b', 'e', 'c'])
  })
  it('handles undefined posts', () => {
    expect(topPostsByPlays(undefined, 3)).toEqual([])
  })
})

describe('stripForTeaser', () => {
  const t = stripForTeaser(baseEvaluation)

  it('marks teaser access level', () => {
    expect(t.isFree).toBe(true)
    expect(t.access_level).toBe('teaser')
  })

  it('keeps basic public account info', () => {
    expect(t.username).toBe('demo')
    expect(t.followerCount).toBe(10000)
    expect(t.accountProfile).toBeDefined()
    expect(t.computedAt).toBeDefined()
  })

  it('keeps score + tier (header gauge) and top3 posts', () => {
    expect(t.score).toBe(72)
    expect(t.tier).toBe('B')
    expect(t.posts).toHaveLength(3)
    expect(t.posts![0].id).toBe('b')
  })

  it('keeps value RANGE but strips components/summary', () => {
    expect(t.businessValue?.totalValue).toEqual({ low: 18400, mid: 22000, high: 26700 })
    expect(t.businessValue?.components).toBeUndefined()
    expect(t.businessValue?.summary).toBeUndefined()
  })

  it('keeps commercialSnapshot SUBSET (band/confidence/blocker only)', () => {
    const c = t.commercialSnapshot as Record<string, unknown>
    expect(c.readinessBand).toBe('Growth Value')
    expect(c.dataConfidence).toBe('medium')
    expect(c.primaryRateBlocker).toBeDefined()
    expect(c.readinessScore).toBeUndefined()
    expect(c.positioning).toBeUndefined()
    expect(c.suggestedRateRange).toBeUndefined()
    expect(c.strongestLever).toBeUndefined()
    expect(c.nextMove).toBeUndefined()
  })

  it('keeps exactly ONE risk flag (the primary blocker)', () => {
    expect(t.riskFlags).toHaveLength(1)
    expect(t.riskFlags![0].level).toBe('high')
  })

  it('strips locked analysis fields entirely', () => {
    const locked = t as unknown as Record<string, unknown>
    for (const key of ['dimensions', 'metrics', 'peerBenchmark', 'summary', 'verdict', 'advice', 'priceAdvice']) {
      expect(locked[key]).toBeUndefined()
    }
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run lib/teaser.test.ts`
Expected: FAIL — `Cannot find module './teaser'`

- [ ] **Step 3: 写实现**

```typescript
// lib/teaser.ts
import type { Evaluation, Post } from '@/types'

/**
 * Teaser 免费边界（Spec §3.3）——纯函数，供 evaluate 路由 FREE 路径裁剪响应。
 *
 * 可见：账号公开信息 / score+tier（头部仪表）/ 价值区间（仅 totalValue，无分项）/
 *       置信度 + 价值层级（commercialSnapshot 子集）/ 最大瓶颈（1 条）/ Top3 视频。
 * 锁定：估值四分项、dimensions/metrics/peerBenchmark、summary/verdict/advice、
 *       commercialSnapshot 的 readinessScore/positioning/strongestLever/nextMove/suggestedRateRange。
 * DB 仍存全量（is_free=true），付费解锁后 upgrade 路由补发完整报告。
 */
export type AccessLevel = 'teaser' | 'full'

export interface TeaserCommercialSnapshot {
  readinessBand: Evaluation['commercialSnapshot'] extends infer C ? (C extends { readinessBand: infer B } ? B : never) : never
  dataConfidence: 'high' | 'medium' | 'low'
  primaryRateBlocker: { label: string; detail: string; impact: string }
}

export type TeaserPayload = Partial<Evaluation> & {
  isFree: true
  access_level: 'teaser'
}

/** posts 按 playCount 降序取前 N（Teaser Top3 视频用） */
export function topPostsByPlays(posts: Post[] | undefined, n = 3): Post[] {
  if (!Array.isArray(posts)) return []
  return [...posts].sort((a, b) => b.playCount - a.playCount).slice(0, n)
}

export function stripForTeaser(evaluation: Evaluation): TeaserPayload {
  // 免费仅保留一个 primary rate blocker（high > medium > low）
  const rank = { high: 0, medium: 1, low: 2 }
  const primaryBlocker = [...(evaluation.riskFlags || [])].sort((a, b) => rank[a.level] - rank[b.level])[0]

  const snap = evaluation.commercialSnapshot
  const teaserSnap: TeaserCommercialSnapshot | undefined = snap
    ? {
        readinessBand: snap.readinessBand,
        dataConfidence: snap.dataConfidence,
        primaryRateBlocker: snap.primaryRateBlocker,
      }
    : undefined

  return {
    isFree: true,
    access_level: 'teaser',
    // ── 账号公开信息（头部卡片 + 基础统计）──
    username: evaluation.username,
    nickname: evaluation.nickname,
    avatar: evaluation.avatar,
    avatarData: evaluation.avatarData,
    bio: evaluation.bio,
    verified: evaluation.verified,
    mock: evaluation.mock,
    region: evaluation.region,
    followerCount: evaluation.followerCount,
    followingCount: evaluation.followingCount,
    totalLikes: evaluation.totalLikes,
    videoCount: evaluation.videoCount,
    accountProfile: evaluation.accountProfile,
    computedAt: evaluation.computedAt,
    // ── Teaser 核心（Spec §3.3）──
    score: evaluation.score,
    tier: evaluation.tier,
    businessValue: evaluation.businessValue
      ? { totalValue: evaluation.businessValue.totalValue }
      : undefined,
    commercialSnapshot: teaserSnap,
    riskFlags: primaryBlocker ? [primaryBlocker] : [],
    posts: topPostsByPlays(evaluation.posts, 3),
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run lib/teaser.test.ts`
Expected: PASS（全部用例）

- [ ] **Step 5: Commit**

```bash
git add lib/teaser.ts lib/teaser.test.ts
git commit -m "feat(b3): stripForTeaser pure function with TDD (Spec 3.3 free boundary)"
```

---

### Task 2: evaluate 路由接线 — FREE 输出 teaser、PAID 标记 full

**Files:**
- Modify: `app/api/evaluate/route.ts`（L107-141 删旧函数；L222、L243、L337-342、L373、L548 六处响应）

- [ ] **Step 1: 删除 `stripForFreeMode`，引入 `stripForTeaser`**

删除 L98-141 整个 `stripForFreeMode` 函数（含注释块），并在文件头部 import 区加：

```typescript
import { stripForTeaser } from '@/lib/teaser'
```

- [ ] **Step 2: FREE 两处响应改为 teaser**

L373（免费缓存命中）：

```typescript
      // 免费缓存命中同样只下发 Teaser 白名单字段（缓存中是全量数据，必须裁剪）
      return NextResponse.json({ ...stripForTeaser(hydrateCommercial(freeCached)), cached: true, ...(reviewRow ? { review_id: reviewRow.id } : {}) })
```

L548（免费新评估）：

```typescript
    // 免费模式只下发 Teaser 白名单字段（数据库已存全量，付费升级后可取回完整报告）
    return NextResponse.json({ ...stripForTeaser(evaluation), ...(reviewRow ? { review_id: reviewRow.id } : {}) })
```

- [ ] **Step 3: PAID 三处响应加 `access_level: 'full'`**

L222（付费缓存命中）：

```typescript
          return NextResponse.json({ ...hydrateCommercial(cached), cached: true, isFree: false, access_level: 'full' })
```

L243（review 幂等重放）：

```typescript
            return NextResponse.json({ ...hydrateCommercial(cached), cached: true, isFree: false, access_level: 'full', review_id: res.review.id })
```

L337-342（付费新评估）：

```typescript
        return NextResponse.json({
          ...evaluation,
          isFree: false,
          access_level: 'full',
          ...(reviewRow ? { review_id: reviewRow.id } : {}),
          ...(dataRefreshedHoursAgo !== undefined ? { dataRefreshedHoursAgo } : {}),
        })
```

- [ ] **Step 4: 类型检查 + 全量单测**

Run: `npx tsc --noEmit && npx vitest run`
Expected: TSC 无错误；测试全绿

- [ ] **Step 5: Commit**

```bash
git add app/api/evaluate/route.ts
git commit -m "feat(b3): evaluate route serves teaser payload for free, marks paid responses full"
```

---

### Task 3: 埋点事件类型 + track 白名单 + upgrade 响应

**Files:**
- Modify: `lib/analytics.ts`（L15-18 EventType）
- Modify: `app/api/track/route.ts`（L25-35 白名单）
- Modify: `app/api/evaluate/upgrade/route.ts`（L146 响应）

- [ ] **Step 1: 扩展 EventType 联合类型**

`lib/analytics.ts` L15-18 改为：

```typescript
export type EventType = 'page_view' | 'search' | 'evaluate_start' | 'evaluate_done'
  | 'paywall_view' | 'paywall_click' | 'purchase' | 'api_error'
  | 'free_evaluate'
  | 'checkout_start' | 'checkout_success' | 'credit_claim' | 'share_create'
  | 'teaser_viewed' | 'paywall_viewed' | 'unlock_completed'
```

- [ ] **Step 2: track 路由白名单替换事件名**

`app/api/track/route.ts` L25-35 改为（`deal_toolkit_paywall_viewed` 改名 `paywall_viewed`，无 admin 引用已核实）：

```typescript
const TRACK_EVENT_TYPES: readonly string[] = [
  'page_view',
  'search',
  'paywall_view',
  'paywall_click',
  'upgrade_click',
  // Commercial Growth PMF 事件（区分新定位与旧估值定位的转化差异）
  'commercial_snapshot_ready',
  // B3 Teaser 转化漏斗事件
  'teaser_viewed',
  'paywall_viewed',
  'unlock_completed',
  'deal_toolkit_unlock_clicked',
]
```

- [ ] **Step 3: upgrade 响应加 access_level**

`app/api/evaluate/upgrade/route.ts` L146 改为：

```typescript
    return NextResponse.json({ ...enriched, isFree: false, access_level: 'full' })
```

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 5: Commit**

```bash
git add lib/analytics.ts app/api/track/route.ts app/api/evaluate/upgrade/route.ts
git commit -m "feat(b3): teaser/paywall/unlock event types and full access_level on upgrade"
```

---

### Task 4: EvaluatePage 解锁流 — 404 回退 + unlock_completed + 平滑滚动

**Files:**
- Modify: `components/EvaluatePage.tsx`（handleUnlock L200-243；ReportTabs L662 加 ref；`paywall_viewed` L175）

- [ ] **Step 1: handleUnlock 补 404 回退与埋点、滚动**

L200-243 的 `handleUnlock` 整体替换为（新增：tabsRef 引用、404 分支、成功埋点 + 平滑滚动）：

```typescript
  // 解锁内容区锚点（解锁成功后平滑滚动至此，避免直接跳到底部）
  const tabsRef = useRef<HTMLDivElement | null>(null)

  // Handle unlock
  async function handleUnlock() {
    if (!result) return
    const token = getSessionToken()
    if (!token) {
      // Not logged in — redirect to auth flow via PaidWall
      setPaidWallMode('unlock')
      setShowPaidWallModal(true)
      return
    }
    setIsUnlocking(true)
    trackEvent('upgrade_click', { username: result.username })
    try {
      // Call upgrade endpoint to enrich free evaluation with AI
      const res = await fetch('/api/evaluate/upgrade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username: result.username }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 402) {
          setNeedPurchase(true)
          setPaidWallMode('unlock')
          setShowPaidWallModal(true)
        } else if (res.status === 404) {
          // 无 Teaser 报告可升级（快照过期/从未免费评估）→ 带 token 发起新完整付费 Review
          toast('Starting your full review…')
          handleEvaluate(result.username)
        } else {
          toast(data.error || dict.errors.evaluationFailed)
        }
        return
      }
      // Refresh with full result
      setResult(data)
      setIsPremium(true)
      setIsLoggedIn(true)
      toast('Report unlocked! 🎉')
      setCreditBalance(prev => prev ? { ...prev, credits: Math.max(0, prev.credits - 1) } : null)
      trackEvent('unlock_completed', { username: result.username })
      // 平滑滚动至解锁内容区顶部（报告 tabs），下一帧等 full 渲染挂载
      requestAnimationFrame(() => {
        tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    } catch {
      toast(dict.errors.networkError)
    } finally {
      setIsUnlocking(false)
    }
  }
```

注意：`handleEvaluate` 定义在 L276（useCallback），`handleUnlock` 是普通函数在其之后定义，可直接调用。

- [ ] **Step 2: ReportTabs 容器挂 ref + scroll margin**

L661-662 改为：

```tsx
            {/* Tab Navigation — PMF 决策页顺序 */}
            <div ref={tabsRef} className="scroll-mt-24">
              <ReportTabs active={activeTab} onChange={setActiveTab} isPremium={isPremium} />
            </div>
```

- [ ] **Step 3: 付费墙曝光事件改名 `paywall_viewed`**

L175 的 `trackEvent('deal_toolkit_paywall_viewed', ...)` 改为：

```typescript
      trackEvent('paywall_viewed', {
        username: result?.username || pendingUsername.current || username,
        mode: paidWallMode,
      })
```

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 5: Commit**

```bash
git add components/EvaluatePage.tsx
git commit -m "feat(b3): unlock fallback to full review on 404, unlock_completed + smooth scroll"
```

---

### Task 5: TeaserReport 组件 + 接线 + teaser_viewed

**Files:**
- Create: `components/report/TeaserReport.tsx`
- Modify: `components/EvaluatePage.tsx`（import、snapshot tab 分叉、teaser_viewed effect）

- [ ] **Step 1: 创建 TeaserReport 组件**

```tsx
'use client'

// ── Teaser 免费报告（B3，Spec §3.3）──
// 三层钩子结构：L1 免费钩子（已可见清单）→ L2 半遮罩预览（模糊暗示）→ L3 锁定价值栈（图标+关键词+一句话）。
// 可见：价值区间 + 置信度 + 层级 / 最大瓶颈 / Top3 视频；锁定栈承载全部付费承诺 + 单一 CTA。

import { Evaluation } from '@/types'
import { useI18n } from '@/lib/i18n'
import { formatNumber, formatUsd } from '@/lib/format'
import { SectionHeader } from '@/components/SectionHeader'
import { TIER_COLORS } from '@/lib/tier'
import {
  Star, ShieldAlert, Play, ThumbsUp, Lock, Check, ChevronRight,
  DollarSign, BarChart3, TrendingDown, TrendingUp, Sparkles, FileDown, Target,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface TeaserReportProps {
  result: Evaluation
  onUnlock: () => void
}

const BAND_STYLES: Record<string, string> = {
  'Premium Value': 'text-[#00F2EA] border-[#00F2EA]/40 bg-[#00F2EA]/10',
  'Strong Value': 'text-[#FF0050] border-[#FF0050]/40 bg-[#FF0050]/10',
  'Growth Value': 'text-amber-400 border-amber-400/40 bg-amber-400/10',
  'Early Value': 'text-neutral-300 border-neutral-600 bg-neutral-800',
}

const CONFIDENCE_LABEL: Record<string, string> = {
  high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence',
}

/** L3 锁定价值栈条目（图标 + 关键词 + 一句话） */
const LOCKED_MODULES: { icon: LucideIcon; accent: string; title: string; desc: string }[] = [
  { icon: DollarSign,   accent: '#FF0050', title: 'Valuation Breakdown',  desc: 'See exactly how your $ range splits across Brand Deals, Content, Audience & Growth.' },
  { icon: BarChart3,    accent: '#00F2EA', title: 'Full Score Analysis',  desc: 'Every scoring dimension with per-item attribution — what helps, what hurts.' },
  { icon: TrendingDown, accent: '#FF0050', title: 'Bottom 3 Videos',      desc: 'Your 3 weakest posts and the specific reason each one underperformed.' },
  { icon: Target,       accent: '#00F2EA', title: 'Deal Rate Card',       desc: 'Opening rate, acceptable range and walk-away floor for your next brand deal.' },
  { icon: TrendingUp,   accent: '#FF0050', title: 'Growth Plan',          desc: 'Prioritized 30-day actions tied to your real videos and scores.' },
  { icon: Sparkles,     accent: '#00F2EA', title: 'Deep AI Analysis',     desc: 'Trend, monetization and content-strategy insights generated for your account.' },
  { icon: FileDown,     accent: '#FF0050', title: 'PDF & Share',          desc: 'Export a polished report or share a link — take your value anywhere.' },
]

export function TeaserReport({ result, onUnlock }: TeaserReportProps) {
  const { dict } = useI18n()
  const snap = result.commercialSnapshot
  const bv = result.businessValue
  const blocker = snap?.primaryRateBlocker ?? (result.riskFlags?.[0]
    ? { label: result.riskFlags[0].label, detail: result.riskFlags[0].detail, impact: '' }
    : undefined)
  const topPosts = [...(result.posts || [])].sort((a, b) => b.playCount - a.playCount).slice(0, 3)
  const band = snap?.readinessBand
  const bandStyle = band ? (BAND_STYLES[band] || BAND_STYLES['Early Value']) : ''
  const tierColor = TIER_COLORS[result.tier] || '#ffffff'
  const freeHooks = [
    { label: 'Estimated value range', value: bv ? `${formatUsd(bv.totalValue.low)} – ${formatUsd(bv.totalValue.high)}` : '—' },
    { label: 'Value tier', value: band || result.tier },
    { label: 'Biggest growth blocker', value: blocker?.label || '—' },
  ]

  return (
    <>
      <SectionHeader step="01" title="Your Free Snapshot" icon={<Star className="h-4 w-4" />} />

      {/* ═══ ① 价值区间 + 置信度 + 层级（Teaser 首屏主卡）═══ */}
      <div className="mb-6 rounded-2xl border border-neutral-800 bg-gradient-to-br from-[#0f0f0f] to-[#141414] p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-widest text-neutral-500">Estimated Business Value</span>
          {snap?.dataConfidence && (
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${snap.dataConfidence === 'high' ? 'border-[#00F2EA]/40 bg-[#00F2EA]/10 text-[#00F2EA]' : snap.dataConfidence === 'medium' ? 'border-amber-400/40 bg-amber-400/10 text-amber-400' : 'border-neutral-600 bg-neutral-800 text-neutral-400'}`}>
              <ShieldAlert className="h-3 w-3" /> {CONFIDENCE_LABEL[snap.dataConfidence] || 'Medium confidence'}
            </span>
          )}
        </div>
        {bv ? (
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3">
            <span className="text-3xl font-black tabular-nums text-white sm:text-4xl" style={{ textShadow: `0 0 24px ${tierColor}33` }}>
              {formatUsd(bv.totalValue.low)}
            </span>
            <span className="text-xl font-bold text-neutral-500">–</span>
            <span className="text-3xl font-black tabular-nums text-white sm:text-4xl" style={{ textShadow: `0 0 24px ${tierColor}33` }}>
              {formatUsd(bv.totalValue.high)}
            </span>
            <span className="text-sm text-neutral-500">/ year</span>
          </div>
        ) : (
          <p className="mt-3 text-sm text-neutral-500">Value estimate unavailable for this account.</p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {band && <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${bandStyle}`}><Star className="h-3.5 w-3.5" /> {band}</span>}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-800/50 px-3 py-1 text-xs text-neutral-400">Score {result.score}/100</span>
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-neutral-600">{dict.common.dataDisclaimer}</p>
      </div>

      {/* ═══ ② 最大瓶颈 + 一句话原因 ═══ */}
      {blocker && (
        <div className="mb-6 rounded-2xl border border-[#FF0050]/25 bg-[#FF0050]/5 p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#FF0050]">
            <ShieldAlert className="h-4 w-4" /> Your #1 growth blocker
          </div>
          <p className="mt-2 text-lg font-bold text-white">{blocker.label}</p>
          {blocker.detail && <p className="mt-1 text-sm leading-relaxed text-neutral-400">{blocker.detail}</p>}
          {blocker.impact && <p className="mt-2 text-xs text-neutral-500">{blocker.impact}</p>}
        </div>
      )}

      {/* ═══ ③ Top 3 表现最好视频 ═══ */}
      {topPosts.length > 0 && (
        <div className="mb-6 rounded-2xl border border-neutral-800 bg-[#0f0f0f] p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Play className="h-4 w-4 text-[#00F2EA]" /> Your Top {topPosts.length} videos
          </div>
          <div className="mt-4 space-y-3">
            {topPosts.map((p, i) => (
              <div key={p.id} className="flex items-center gap-4 rounded-xl border border-neutral-800/80 bg-neutral-900/50 p-3.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#00F2EA]/10 text-sm font-black text-[#00F2EA]">#{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-neutral-200">{p.desc || '(no caption)'}</p>
                  <div className="mt-1 flex items-center gap-3 text-xs text-neutral-500">
                    <span className="inline-flex items-center gap-1"><Play className="h-3 w-3" /> {formatNumber(p.playCount)}</span>
                    <span className="inline-flex items-center gap-1"><ThumbsUp className="h-3 w-3" /> {formatNumber(p.likeCount)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ ④ 锁定价值栈：三层钩子 ═══ */}
      <div className="relative overflow-hidden rounded-2xl border border-[#FF0050]/30 bg-gradient-to-b from-[#16070c] to-[#0d0d0d] p-6 sm:p-8">
        {/* L1 免费钩子：已可见清单 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-widest text-neutral-500">Free in your snapshot</span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {freeHooks.map(h => (
            <div key={h.label} className="rounded-xl border border-[#00F2EA]/20 bg-[#00F2EA]/5 p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-neutral-500"><Check className="h-3 w-3 text-[#00F2EA]" /> {h.label}</div>
              <p className="mt-1 truncate text-sm font-semibold text-white">{h.value}</p>
            </div>
          ))}
        </div>

        {/* L2 半遮罩预览：模糊化暗示更多内容 */}
        <div className="pointer-events-none mt-6 select-none" aria-hidden>
          <div className="space-y-2.5 opacity-70 blur-[2px]">
            <div className="h-6 w-3/4 rounded-md bg-gradient-to-r from-[#FF0050]/50 to-transparent" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="h-16 rounded-lg bg-neutral-800/80" />
              <div className="h-16 rounded-lg bg-[#FF0050]/25" />
              <div className="h-16 rounded-lg bg-[#00F2EA]/20" />
              <div className="h-16 rounded-lg bg-neutral-800/80" />
            </div>
            <div className="h-4 w-1/2 rounded bg-neutral-800/80" />
          </div>
          <div className="absolute inset-x-0 bottom-40 h-24 bg-gradient-to-t from-[#0d0d0d] to-transparent" />
        </div>

        {/* L3 锁定价值栈：图标 + 关键词 + 一句话 */}
        <div className="relative mt-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Lock className="h-4 w-4 text-[#FF0050]" /> Unlock your full report
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {LOCKED_MODULES.map(m => (
              <div key={m.title} className="flex items-start gap-3 rounded-xl border border-neutral-800 bg-neutral-900/40 p-3.5">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${m.accent}1a`, color: m.accent }}>
                  <m.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{m.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">{m.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={onUnlock}
            className="group mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#FF0050] px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#FF0050]/25 transition-all hover:bg-[#ff1a64] hover:shadow-[#FF0050]/40 sm:w-auto"
          >
            <Lock className="h-4 w-4" /> Unlock Full Report
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    </>
  )
}
```

注：`TIER_COLORS` 的 key 类型以 `lib/tier.ts` 实际导出为准（子代理执行时先读该文件确认导出名与键型；若 key 为 `Evaluation['tier']` 联合类型可直接索引，否则按现有组件用法对齐）。`formatUsd` 若 `lib/format.ts` 未导出则用现有 `formatNumber` + `$` 前缀替代（执行时以实际导出为准，参考 `components/sections/IncomeBreakdownSection.tsx` 的金额格式化方式）。

- [ ] **Step 2: EvaluatePage 接线（import + 分叉渲染 + teaser_viewed 埋点）**

a) import 区加：

```typescript
import { TeaserReport } from '@/components/report/TeaserReport'
```

b) L669-684 的 snapshot tab 改为分叉渲染：

```tsx
            {/* ═══ SNAPSHOT TAB（免费 Teaser / 付费完整快照）═══ */}
            {activeTab === 'snapshot' && (<>
              {isPremium ? (
                <CommercialSnapshotTab
                  result={result}
                  isPremium={isPremium}
                  onUnlock={() => { setPaidWallMode('unlock'); setShowPaidWallModal(true) }}
                />
              ) : (
                <TeaserReport
                  result={result}
                  onUnlock={() => { setPaidWallMode('unlock'); setShowPaidWallModal(true) }}
                />
              )}
              {/* 变现门槛检查（平台资格事实，免费可见） */}
              <MonetizationChecklist
                followerCount={result.followerCount}
                videoCount={result.videoCount}
                region={result.region}
                isUnlocked={true}
                hasHighRisk={result.riskFlags?.some(r => r.level === 'high')}
              />
            </>)}
```

c) `commercial_snapshot_ready` 埋点 effect（L185-197）后新增 teaser 曝光埋点：

```typescript
  // B3 埋点：Teaser 报告曝光（免费态每个 username 一次）
  const teaserViewedRef = useRef<string | null>(null)
  useEffect(() => {
    if (isPremium || !result?.username) return
    if (teaserViewedRef.current === result.username) return
    teaserViewedRef.current = result.username
    trackEvent('teaser_viewed', { username: result.username, tier: result.tier })
  }, [result, isPremium])
```

- [ ] **Step 3: 类型检查 + 全量单测**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 无错误、全绿

- [ ] **Step 4: 浏览器手测（dev server）**

Run: `npm run dev`（已运行则直接访问）
1. 访问 `http://127.0.0.1:3000/`，无 token 免费评估一个真实账号（dev 环境无 token 可走免费）
2. 验收点：
   - 免费报告 snapshot tab 显示 Teaser 三段（价值区间/瓶颈/Top3）+ 锁定栈
   - DevTools Network 里 `/api/evaluate` 响应**不含** `dimensions / metrics / peerBenchmark / businessValue.components / commercialSnapshot.suggestedRateRange`，含 `access_level: "teaser"`
   - deal/plan/analysis 三个 tab 仍为 LockedTabPreview
   - 点击 Unlock → PaidWallModal（mode=unlock），付费墙容器移动端完整
   - 解锁成功（dev: DEV_SKIP_PAYMENT）→ 报告变 full，平滑滚动至 tabs 顶部，Network 无第二次 RapidAPI 调用（upgrade 不拉数据）
3. `@demo` 演示报告仍为 premium 全量

- [ ] **Step 5: Commit**

```bash
git add components/report/TeaserReport.tsx components/EvaluatePage.tsx
git commit -m "feat(b3): teaser report view with three-hook locked stack, teaser_viewed event"
```

---

### Task 6: 集成验证 + 批次文档更新

**Files:**
- Modify: `docs/TokValue-Batches.md`（B3 验收标准勾选 + 实施状态）

- [ ] **Step 1: 全量回归**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 测试全绿、TSC 干净

- [ ] **Step 2: 端到端验收清单核对（浏览器）**

逐项核对 Batches 文档 B3 验收标准：
- [ ] 免费报告严格符合 Teaser 边界（逐项核对 Spec §3.3：Network 响应字段白名单检查）
- [ ] 现有支付成功 → 同一报告升 full，无重新拉数据（upgrade 响应 access_level=full，无 RapidAPI 日志）
- [ ] 无 Teaser 时支付 → 发起新完整 Review（404 分支触发 handleEvaluate）
- [ ] 移动端付费墙容器完整（max-h-90vh 约定，DevTools 手机视口检查）
- [ ] 埋点：teaser_viewed / paywall_viewed / unlock_completed（DevTools Network `/api/track` 请求体核对）

- [ ] **Step 3: 更新批次文档**

`docs/TokValue-Batches.md` B3 节验收标准全部勾选 `[x]` 并附证据说明，新增「实施状态」段落（交付文件清单 + 验证方式 + commit hash），格式对齐 B2 节。

- [ ] **Step 4: Commit**

```bash
git add docs/TokValue-Batches.md
git commit -m "docs(b3): check off acceptance criteria, record implementation status"
```

---

## Self-Review 结论

- **Spec 覆盖**：§3.3 可见/锁定清单 → Task 1 白名单 + Task 5 组件；§3.3 CTA（$9 单次 / 订阅）→ 现有 PaidWall 套餐文案不动（Batches B3-6 沿用现有规范）；§7.3 L1/L2/L3 → TeaserReport + LockedTabPreview + PaidWallModal；任务#1 标题 → B6 范围已显式标记；Batches B3 五条验收 → Task 5 Step 4 + Task 6 Step 2 逐项核对。
- **占位符扫描**：无 TBD/TODO；Task 5 对 `TIER_COLORS`/`formatUsd` 给了执行期对齐指令（以实际导出为准），属防御性说明而非占位。
- **类型一致性**：`stripForTeaser` 返回 `TeaserPayload`（Task 1 定义）；`access_level` 字面量 'teaser'/'full' 全文一致；`handleEvaluate`/`handleUnlock`/`tabsRef` 引用在 Task 4/5 间一致。
