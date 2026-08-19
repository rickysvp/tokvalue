# Report v2 Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将评估报告从深色 4-Tab 重构为浅色金融风单页叙事报告（9 sections + Teaser 遮罩 + sticky 付费条），支付逻辑不动。

**Architecture:** 新建 `components/report-v2/` 组件树，EvaluatePage.tsx 只替换 `result` 渲染部分；数据层（pillar/valuation/verdict/commercial）零改动；`lib/tier.ts` TIER_COLORS 常量值更新为翡翠金板。

**Tech Stack:** Next.js 15 App Router、React 19、Tailwind CSS、Vitest、原生 Canvas / IntersectionObserver / rAF（动画零三方依赖）。

**Spec:** `docs/superpowers/specs/2026-08-19-report-v2-redesign-design.md`

**验证命令：** `npx vitest run`（160 存量测试必须全绿）、`npx tsc --noEmit`、浏览器访问 `http://127.0.0.1:3000/evaluate/@demo`

**全局硬约束：**
- 颜色一律读 `lib/tier.ts` 的 `TIER_COLORS` / `valueTierColor()`；新 UI 类名禁止出现旧 hex
- 用户可见文案不出现 S/A/B/C/D/E/F 字母，只用 Premium/Growth/Developing/Early Value
- 所有动画包 `prefers-reduced-motion` 降级
- 新文案进 `lib/i18n/dictionaries/en.ts`，复用 dict 结构

---

### Task 1: TIER_COLORS 翡翠金板

**Files:**
- Modify: `lib/tier.ts:3-11`

- [ ] **Step 1: 更新常量值**

```typescript
export const TIER_COLORS: Record<string, string> = {
  S: '#047857', // Premium Value — 翡翠绿
  A: '#047857',
  B: '#1d4ed8', // Growth Value — 藏蓝
  C: '#1d4ed8',
  D: '#b45309', // Developing Value — 金棕
  E: '#b45309',
  F: '#64748b', // Early Value — 石墨灰
}
```

（`tierColor()` 默认回退值 `#FF0050` 改为 `#64748b`。）

- [ ] **Step 2: 跑全量测试**

Run: `npx vitest run`
Expected: 160 passed（tier 颜色断言如有引用旧值需同步——`Grep '#FF0050' lib/*.test.ts` 确认）

- [ ] **Step 3: Commit**

```bash
git add lib/tier.ts && git commit -m "feat(report-v2): switch TIER_COLORS to light-friendly emerald palette"
```

---

### Task 2: CountUp 原子（TDD）

**Files:**
- Create: `components/report-v2/ui/CountUp.tsx`
- Test: `components/report-v2/ui/count-up.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
import { describe, it, expect } from 'vitest'
import { formatCountUpValue, easeOutCubic } from './CountUp'

describe('formatCountUpValue', () => {
  it('formats thousands with K suffix', () => {
    expect(formatCountUpValue(63800, 0, 1)).toBe('$0')
    expect(formatCountUpValue(63800, 0.5, 1)).toBe('$32K')
    expect(formatCountUpValue(63800, 1, 1)).toBe('$64K')
  })
  it('formats millions with M suffix', () => {
    expect(formatCountUpValue(2_500_000, 1, 1)).toBe('$2.5M')
  })
  it('rounds to step precision to avoid flicker', () => {
    expect(formatCountUpValue(100, 0.123, 1)).toBe('$12')
  })
})

describe('easeOutCubic', () => {
  it('is monotonic 0→1', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBeCloseTo(1)
    expect(easeOutCubic(0.5)).toBeGreaterThan(easeOutCubic(0.4))
    expect(easeOutCubic(0.5)).toBeLessThan(1)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run components/report-v2/ui/count-up.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 实现**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'

/** 按目标量级取整显示，避免动画中途小数抖动 */
export function formatCountUpValue(target: number, progress: number, _step: number): string {
  const current = target * Math.max(0, Math.min(1, progress))
  if (target >= 1_000_000) return `$${(current / 1_000_000).toFixed(1)}M`
  if (target >= 10_000) return `$${Math.round(current / 1000)}K`
  return `$${Math.round(current)}`
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function CountUp({ target, durationMs = 1200, className }: {
  target: number
  durationMs?: number
  className?: string
}) {
  const [text, setText] = useState(() => formatCountUpValue(target, 0, 1))
  const rafRef = useRef<number>(0)

  useEffect(() => {
    // 无障碍降级：直接显示终值
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setText(formatCountUpValue(target, 1, 1))
      return
    }
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs)
      setText(formatCountUpValue(target, easeOutCubic(progress), 1))
      if (progress < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, durationMs])

  return <span className={`tabular-nums ${className ?? ''}`}>{text}</span>
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run components/report-v2/ui/count-up.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/report-v2/ui/ && git commit -m "feat(report-v2): add CountUp atom with tests"
```

---

### Task 3: 其余 UI 原子

**Files:**
- Create: `components/report-v2/ui/SectionHeader.tsx`
- Create: `components/report-v2/ui/MetricCell.tsx`
- Create: `components/report-v2/ui/HelpHint.tsx`

- [ ] **Step 1: SectionHeader（编号 + 标题 + 说明）**

```tsx
'use client'

export function SectionHeader({ index, title, subtitle, id }: {
  index: number
  title: string
  subtitle?: string
  id?: string
}) {
  return (
    <div id={id} className="scroll-mt-24 mb-6">
      <div className="flex items-baseline gap-3">
        <span className="text-sm font-semibold text-[#6B7280] tabular-nums">{String(index).padStart(2, '0')}</span>
        <h2 className="text-xl font-semibold text-[#111827]">{title}</h2>
      </div>
      {subtitle && <p className="mt-1.5 text-sm text-[#6B7280]">{subtitle}</p>}
    </div>
  )
}
```

- [ ] **Step 2: MetricCell（指标格 + 悬停解释）**

```tsx
'use client'

import { Info } from 'lucide-react'

export function MetricCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-[13px] text-[#6B7280]">
        {label}
        {hint && (
          <span className="group relative inline-flex">
            <Info className="h-3.5 w-3.5 cursor-help text-[#9CA3AF]" />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-48 -translate-x-1/2 rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-xs leading-relaxed text-[#374151] opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              {hint}
            </span>
          </span>
        )}
      </div>
      <div className="mt-1 text-lg font-semibold text-[#111827] tabular-nums">{value}</div>
    </div>
  )
}
```

- [ ] **Step 3: HelpHint（复用现有 en.ts deepAnalysis hint 字段，本组件是行内 ? 按钮）**

```tsx
'use client'

import { HelpCircle } from 'lucide-react'
import { useState } from 'react'

export function HelpHint({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <button
      type="button"
      aria-label="What is this?"
      onClick={() => setOpen(v => !v)}
      className="inline-flex text-[#9CA3AF] hover:text-[#1d4ed8]"
    >
      <HelpCircle className="h-4 w-4" />
      {open && (
        <span className="absolute left-1/2 z-20 mt-6 w-56 -translate-x-1/2 rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-xs leading-relaxed text-[#374151] shadow-lg">
          {text}
        </span>
      )}
    </button>
  )
}
```

- [ ] **Step 4: TSC 验证**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 5: Commit**

```bash
git add components/report-v2/ui/ && git commit -m "feat(report-v2): add SectionHeader/MetricCell/HelpHint atoms"
```

---

### Task 4: VerdictHero

**Files:**
- Create: `components/report-v2/sections/VerdictHero.tsx`
- Modify: `lib/i18n/dictionaries/en.ts`（新增 reportV2 命名空间，本任务先加 hero 部分）

- [ ] **Step 1: en.ts 增加 reportV2.hero 文案**

```typescript
reportV2: {
  hero: {
    confidence: 'Confidence',
    unlockExact: 'Unlock your exact value',
    metrics: {
      followers: 'Followers',
      avgViews: 'Avg. Views',
      engagement: 'Engagement',
      percentile: 'Top Percentile',
    },
    hints: {
      followers: 'Total followers on your TikTok profile.',
      avgViews: 'Average views per video in your recent library.',
      engagement: 'Likes + comments + shares per view. Above 5% is strong.',
      percentile: 'Your position among similar-size accounts in your niche.',
    },
  },
},
```

- [ ] **Step 2: VerdictHero 组件**

```tsx
'use client'

import Image from 'next/image'
import { BadgeCheck } from 'lucide-react'
import { Evaluation } from '@/types'
import { valueTierOf, valueTierColor } from '@/lib/pillar'
import { formatNumber } from '@/lib/format'
import { CountUp } from '../ui/CountUp'
import { MetricCell } from '../ui/MetricCell'
import type { EnDict } from '@/lib/i18n/dictionaries/en'

const CONFIDENCE_LABEL: Record<string, string> = {
  medium_high: 'Medium-High', medium: 'Medium', medium_low: 'Medium-Low', low: 'Low',
}

export function VerdictHero({ result, dict, isPremium }: {
  result: Evaluation
  dict: EnDict
  isPremium: boolean
}) {
  const h = dict.reportV2.hero
  const range = result.valuationV2?.range
  const band = result.valuationV2?.band
  const tierName = valueTierOf(result.tier)
  const tierColor = valueTierColor(result.tier)

  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 sm:p-8 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      {/* 账号行 */}
      <div className="flex items-center gap-4">
        {result.avatar ? (
          <Image src={result.avatar} alt={result.nickname} width={56} height={56} className="h-14 w-14 rounded-full border border-[#E5E7EB] object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F3F4F6] text-xl font-bold text-[#374151]">
            {result.nickname.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-lg font-semibold text-[#111827]">{result.nickname}</span>
            {result.verified && <BadgeCheck className="h-5 w-5 shrink-0" style={{ color: tierColor }} />}
          </div>
          <p className="text-sm text-[#6B7280]">@{result.username}</p>
        </div>
        <span
          className="ml-auto shrink-0 rounded-full px-3 py-1 text-xs font-semibold"
          style={{ color: tierColor, backgroundColor: `${tierColor}14`, border: `1px solid ${tierColor}40` }}
        >
          {tierName}
        </span>
      </div>

      {/* 一句话判定 */}
      <p className="mt-6 text-lg font-medium leading-relaxed text-[#111827]">{result.summary.headline}</p>

      {/* 估值主数字 */}
      <div className="mt-6">
        {range ? (
          <div className="relative">
            <div
              className={`text-5xl sm:text-[56px] font-semibold leading-none text-[#111827] ${!isPremium ? 'blur-[6px] select-none' : ''}`}
              aria-label={isPremium ? `Estimated value $${formatNumber(range.mid)}` : 'Locked'}
            >
              {isPremium ? <CountUp target={range.mid} /> : <CountUp target={range.mid} />}
            </div>
            {!isPremium && (
              <span className="absolute inset-0 flex items-center justify-center text-sm font-medium text-[#6B7280]">
                {h.unlockExact}
              </span>
            )}
            <div className="mt-3 flex items-center gap-3 text-sm text-[#6B7280]">
              <span className="tabular-nums">${formatNumber(range.low)}</span>
              <span className="h-px flex-1 bg-[#E5E7EB]" />
              <span className="tabular-nums">${formatNumber(range.high)}</span>
              {band && (
                <span className="rounded-full border border-[#E5E7EB] bg-[#F7F8FA] px-2.5 py-0.5 text-xs text-[#374151]">
                  {h.confidence}: {CONFIDENCE_LABEL[band]}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="text-3xl font-semibold text-[#111827] tabular-nums">
            ${formatNumber(result.businessValue.high)}
          </div>
        )}
      </div>

      {/* 核心指标带 */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCell label={h.metrics.followers} value={formatNumber(result.followerCount)} hint={h.hints.followers} />
        <MetricCell label={h.metrics.avgViews} value={formatNumber(result.metrics.avgPlays)} hint={h.hints.avgViews} />
        <MetricCell label={h.metrics.engagement} value={`${result.metrics.engagementRate.toFixed(1)}%`} hint={h.hints.engagement} />
        <MetricCell label={h.metrics.percentile} value={`Top ${100 - result.peerRanking.overallPercentile}%`} hint={h.hints.percentile} />
      </div>
    </section>
  )
}
```

注意：`peerRanking.overallPercentile` 语义是「超过同侪百分比」，Top% = 100 − percentile；实现时用浏览器确认与现有 PeerRankingSection 文案方向一致。

- [ ] **Step 3: TSC + Commit**

Run: `npx tsc --noEmit`
```bash
git add components/report-v2/sections/VerdictHero.tsx lib/i18n/dictionaries/en.ts && git commit -m "feat(report-v2): VerdictHero with count-up valuation"
```

---

### Task 5: AccountValue

**Files:**
- Create: `components/report-v2/sections/AccountValue.tsx`
- Modify: `lib/i18n/dictionaries/en.ts`（reportV2.value）

- [ ] **Step 1: 文案（reportV2.value）**

```typescript
value: {
  title: 'Account Value',
  subtitle: 'What your account is worth, and what it is made of.',
  riskAdjustment: 'Risk adjustment',
  howEstimated: 'How this is estimated',
  components: 'Value breakdown',
},
```

- [ ] **Step 2: 组件（温度计区间条 + 四分项 + 风险折扣 + 折叠方法论）**

```tsx
'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Evaluation } from '@/types'
import { formatNumber } from '@/lib/format'
import { SectionHeader } from '../ui/SectionHeader'
import type { EnDict } from '@/lib/i18n/dictionaries/en'

export function AccountValue({ result, dict }: { result: Evaluation; dict: EnDict }) {
  const v = dict.reportV2.value
  const [showHow, setShowHow] = useState(false)
  const range = result.valuationV2?.range
  const discount = result.valuationV2?.riskDiscountPct ?? 0
  const components = result.businessValue.components
  const maxComp = Math.max(...components.map(c => c.amount), 1)

  return (
    <section>
      <SectionHeader index={2} title={v.title} subtitle={v.subtitle} id="account-value" />
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        {/* 温度计区间条 */}
        {range && (
          <div>
            <div className="relative h-2.5 rounded-full bg-[#F3F4F6]">
              <div className="absolute inset-y-0 left-[15%] right-[15%] rounded-full bg-[#1d4ed8]/15" />
              <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#1d4ed8] shadow" />
            </div>
            <div className="mt-2.5 flex justify-between text-sm">
              <span className="tabular-nums text-[#6B7280]">${formatNumber(range.low)}</span>
              <span className="font-semibold tabular-nums text-[#111827]">${formatNumber(range.mid)}</span>
              <span className="tabular-nums text-[#6B7280]">${formatNumber(range.high)}</span>
            </div>
          </div>
        )}

        {/* 四分项 */}
        <div className="mt-6 space-y-4">
          <p className="text-[13px] font-medium text-[#6B7280]">{v.components}</p>
          {components.map(c => (
            <div key={c.name}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-[#111827]">{c.name}</span>
                <span className="text-sm font-semibold tabular-nums text-[#111827]">${formatNumber(c.amount)}</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-[#F3F4F6]">
                <div className="h-full rounded-full bg-[#1d4ed8]" style={{ width: `${(c.amount / maxComp) * 100}%` }} />
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[#6B7280]">{c.detail}</p>
            </div>
          ))}
        </div>

        {/* 风险折扣 */}
        {discount > 0 && (
          <div className="mt-6 rounded-xl border border-[#b45309]/25 bg-[#b45309]/5 px-4 py-3 text-sm text-[#92400E]">
            {v.riskAdjustment}: −{discount}%
          </div>
        )}

        {/* 怎么算的 */}
        <button
          type="button"
          onClick={() => setShowHow(s => !s)}
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-[#1d4ed8] hover:underline"
        >
          {v.howEstimated}
          <ChevronDown className={`h-4 w-4 transition-transform ${showHow ? 'rotate-180' : ''}`} />
        </button>
        {showHow && (
          <div className="mt-3 rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] p-4 text-[13px] leading-relaxed text-[#374151]">
            {result.summary.headline ? '' : ''}
            Estimates combine your recent video views, engagement quality, follower base and niche
            market rates. Confidence reflects sample size and data coverage; the range widens when
            signals are mixed. All figures are estimates, not offers.
          </div>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: TSC + Commit**

```bash
git add components/report-v2/sections/AccountValue.tsx lib/i18n/dictionaries/en.ts && git commit -m "feat(report-v2): AccountValue section"
```

---

### Task 6: PillarCards（入场动画）

**Files:**
- Create: `components/report-v2/sections/PillarCards.tsx`
- Modify: `lib/i18n/dictionaries/en.ts`（reportV2.pillars）

- [ ] **Step 1: 文案**

```typescript
pillars: {
  title: 'What Drives Your Value',
  subtitle: 'Six pillars behind your score. Tap any card for details.',
  improve: 'How to improve',
},
```

- [ ] **Step 2: 组件**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Evaluation } from '@/types'
import { SectionHeader } from '../ui/SectionHeader'
import type { EnDict } from '@/lib/i18n/dictionaries/en'

const STATUS_COLOR: Record<string, string> = {
  'Strong': '#047857',
  'On track': '#1d4ed8',
  'Needs attention': '#b45309',
}

function PillarBar({ score, animate }: { score: number; animate: boolean }) {
  return (
    <div className="h-2 w-28 overflow-hidden rounded-full bg-[#F3F4F6]">
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: animate ? `${score}%` : '0%' }}
      />
    </div>
  )
}

export function PillarCards({ result, dict }: { result: Evaluation; dict: EnDict }) {
  const p = dict.reportV2.pillars
  const pillars = result.pillars?.pillars
  const [visible, setVisible] = useState(false)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setVisible(true); return }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); io.disconnect() }
    }, { threshold: 0.2 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  if (!pillars) return null

  return (
    <section ref={ref}>
      <SectionHeader index={3} title={p.title} subtitle={p.subtitle} id="pillars" />
      <div className="grid gap-3 sm:grid-cols-2">
        {pillars.map(pillar => {
          const color = STATUS_COLOR[pillar.status] ?? '#64748b'
          const open = openKey === pillar.key
          return (
            <button
              key={pillar.key}
              type="button"
              onClick={() => setOpenKey(open ? null : pillar.key)}
              className="rounded-2xl border border-[#E5E7EB] bg-white p-5 text-left shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-[#111827]">{pillar.name}</span>
                <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ color, backgroundColor: `${color}14` }}>
                  {pillar.status}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <PillarBar score={pillar.score} animate={visible} />
                <span className="text-sm font-semibold tabular-nums text-[#111827]">{pillar.score}</span>
                <ChevronDown className={`ml-auto h-4 w-4 text-[#9CA3AF] transition-transform ${open ? 'rotate-180' : ''}`} />
              </div>
              {open && (
                <div className="mt-3 space-y-2 border-t border-[#E5E7EB] pt-3">
                  <p className="text-[13px] leading-relaxed text-[#374151]">{pillar.attribution}</p>
                  <p className="text-[13px] leading-relaxed text-[#6B7280]"><span className="font-medium text-[#1d4ed8]">{p.improve}:</span> {result.summary.bestAction}</p>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
```

（注：PillarBar 颜色需随状态色 — 给 `PillarBar` 传入 `color` prop 用于内层 div 的 `backgroundColor`，实现时补上。）

- [ ] **Step 3: TSC + Commit**

```bash
git add components/report-v2/sections/PillarCards.tsx lib/i18n/dictionaries/en.ts && git commit -m "feat(report-v2): PillarCards with scroll-in animation"
```

---

### Task 7: DealPricing

**Files:**
- Create: `components/report-v2/sections/DealPricing.tsx`
- Modify: `lib/i18n/dictionaries/en.ts`（reportV2.deal）

- [ ] **Step 1: 文案**

```typescript
deal: {
  title: 'Price Your Next Deal',
  subtitle: 'Negotiation-ready rates for one branded video.',
  opening: 'Opening Ask',
  fairRange: 'Fair Range',
  floor: 'Walk-Away Floor',
  assumptions: 'Assumes',
  notIncluded: 'Not included',
  factors: 'What moves your rate',
},
```

- [ ] **Step 2: 组件（三卡 + 假设 + 不含 + 因素）**

```tsx
'use client'

import { Evaluation } from '@/types'
import { formatNumber } from '@/lib/format'
import { SectionHeader } from '../ui/SectionHeader'
import type { EnDict } from '@/lib/i18n/dictionaries/en'

export function DealPricing({ result, dict }: { result: Evaluation; dict: EnDict }) {
  const d = dict.reportV2.deal
  const deal = result.dealPricing
  if (!deal) return null

  const cards = [
    { label: d.opening, value: deal.openingRate, accent: '#047857' },
    { label: d.fairRange, value: null, range: deal.acceptableRange, accent: '#1d4ed8' },
    { label: d.floor, value: deal.privateMinimum, accent: '#b45309' },
  ]

  return (
    <section>
      <SectionHeader index={4} title={d.title} subtitle={d.subtitle} id="deal-pricing" />
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map(c => (
          <div key={c.label} className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p className="text-[13px] text-[#6B7280]">{c.label}</p>
            {c.value !== null ? (
              <p className="mt-1.5 text-2xl font-semibold tabular-nums text-[#111827]">${formatNumber(c.value)}</p>
            ) : c.range ? (
              <p className="mt-1.5 text-2xl font-semibold tabular-nums text-[#111827]">
                ${formatNumber(c.range.low)}–${formatNumber(c.range.high)}
              </p>
            ) : null}
            <div className="mt-2 h-1 w-10 rounded-full" style={{ backgroundColor: c.accent }} />
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
          <p className="text-sm font-semibold text-[#111827]">{d.assumes}</p>
          <p className="mt-2 text-[13px] leading-relaxed text-[#6B7280]">{deal.assumptions}</p>
          <p className="mt-4 text-sm font-semibold text-[#111827]">{d.notIncluded}</p>
          <ul className="mt-2 space-y-1">
            {deal.notIncluded.map(item => (
              <li key={item} className="text-[13px] text-[#6B7280]">— {item}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
          <p className="text-sm font-semibold text-[#111827]">{d.factors}</p>
          <ul className="mt-2 space-y-2.5">
            {deal.factors.map(f => (
              <li key={f.label} className="text-[13px] leading-relaxed text-[#374151]">
                <span className="font-medium">{f.label}:</span> {f.note}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: TSC + Commit**

```bash
git add components/report-v2/sections/DealPricing.tsx lib/i18n/dictionaries/en.ts && git commit -m "feat(report-v2): DealPricing section"
```

---

### Task 8: PeerRanking

**Files:**
- Create: `components/report-v2/sections/PeerRanking.tsx`
- Modify: `lib/i18n/dictionaries/en.ts`（reportV2.peer）

- [ ] **Step 1: 文案**

```typescript
peer: {
  title: 'How You Compare',
  subtitle: 'You vs. similar-size creators in your niche.',
  you: 'You',
  peerMedian: 'Peer median',
  insight: 'Insight',
},
```

- [ ] **Step 2: 组件（rankingBreakdown 条形对比，双 bar：你 vs 中位）**

```tsx
'use client'

import { Evaluation } from '@/types'
import { SectionHeader } from '../ui/SectionHeader'
import type { EnDict } from '@/lib/i18n/dictionaries/en'

export function PeerRanking({ result, dict }: { result: Evaluation; dict: EnDict }) {
  const p = dict.reportV2.peer
  const rows = result.peerRanking.rankingBreakdown
  return (
    <section>
      <SectionHeader index={5} title={p.title} subtitle={p.subtitle} id="peer-ranking" />
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="space-y-5">
          {rows.map(row => (
            <div key={row.metric}>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-[#111827]">{row.metric}</span>
                <span className="text-sm font-semibold tabular-nums text-[#1d4ed8]">{row.value}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-[#F3F4F6]">
                <div className="h-full rounded-full bg-[#1d4ed8]" style={{ width: `${row.percentile}%` }} />
              </div>
              <p className="mt-1 text-xs text-[#6B7280]">Top {100 - row.percentile}% of peers</p>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] px-4 py-3 text-[13px] leading-relaxed text-[#374151]">
          <span className="font-medium">{p.insight}: </span>{result.peerRanking.insight}
        </div>
      </div>
    </section>
  )
}
```

（`row.barColor` 是旧深色 hex，v2 忽略该字段统一用藏蓝，满足「颜色读常量」精神——条形对比不区分 tier。）

- [ ] **Step 3: TSC + Commit**

```bash
git add components/report-v2/sections/PeerRanking.tsx lib/i18n/dictionaries/en.ts && git commit -m "feat(report-v2): PeerRanking section"
```

---

### Task 9: RiskHealth

**Files:**
- Create: `components/report-v2/sections/RiskHealth.tsx`
- Modify: `lib/i18n/dictionaries/en.ts`（reportV2.risk）

- [ ] **Step 1: 文案**

```typescript
risk: {
  title: 'Risk & Account Health',
  subtitle: 'Signals brands check before they pay.',
  noneDetected: 'No risk signals detected in public data.',
  riskScore: 'Risk Score',
  healthChecks: 'Health checks',
},
```

- [ ] **Step 2: 组件**

```tsx
'use client'

import { ShieldCheck, ShieldAlert } from 'lucide-react'
import { Evaluation } from '@/types'
import { SectionHeader } from '../ui/SectionHeader'
import type { EnDict } from '@/lib/i18n/dictionaries/en'

const LEVEL_COLOR: Record<string, string> = { high: '#dc2626', medium: '#b45309', low: '#6B7280' }

export function RiskHealth({ result, dict }: { result: Evaluation; dict: EnDict }) {
  const r = dict.reportV2.risk
  const risks = result.riskFlags ?? []
  const riskScore = result.valuationV2?.riskScore ?? 0

  return (
    <section>
      <SectionHeader index={6} title={r.title} subtitle={r.subtitle} id="risk-health" />
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-[#111827]">{r.riskScore}</span>
          <span className="text-lg font-semibold tabular-nums text-[#111827]">{riskScore}<span className="text-sm text-[#9CA3AF]">/100</span></span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-[#F3F4F6]">
          <div className="h-full rounded-full bg-[#dc2626]" style={{ width: `${riskScore}%` }} />
        </div>

        {risks.length === 0 ? (
          <div className="mt-5 flex items-center gap-2.5 rounded-xl border border-[#047857]/25 bg-[#047857]/5 px-4 py-3 text-sm text-[#047857]">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            {r.noneDetected}
          </div>
        ) : (
          <ul className="mt-5 space-y-3">
            {risks.map(flag => (
              <li key={flag.label} className="flex gap-2.5">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" style={{ color: LEVEL_COLOR[flag.level] }} />
                <div>
                  <p className="text-sm font-medium text-[#111827]">{flag.label}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-[#6B7280]">{flag.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: TSC + Commit**

```bash
git add components/report-v2/sections/RiskHealth.tsx lib/i18n/dictionaries/en.ts && git commit -m "feat(report-v2): RiskHealth section"
```

---

### Task 10: ThirtyDayPlan（localStorage 勾选）

**Files:**
- Create: `components/report-v2/sections/ThirtyDayPlan.tsx`
- Modify: `lib/i18n/dictionaries/en.ts`（reportV2.plan）

- [ ] **Step 1: 文案**

```typescript
plan: {
  title: 'Raise Your Value in 30 Days',
  subtitle: 'Four weeks of focused actions, built from your data.',
  week: 'Week',
  goal: 'Goal',
  doneWhen: 'Done when',
  effort: 'hrs',
},
```

- [ ] **Step 2: 组件**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { Evaluation } from '@/types'
import { SectionHeader } from '../ui/SectionHeader'
import type { EnDict } from '@/lib/i18n/dictionaries/en'

export function ThirtyDayPlan({ result, dict }: { result: Evaluation; dict: EnDict }) {
  const p = dict.reportV2.plan
  const plan = result.thirtyDayPlan
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`tv_plan:${result.username}`)
      if (raw) setChecked(JSON.parse(raw))
    } catch {}
  }, [result.username])

  const toggle = (key: string) => {
    setChecked(prev => {
      const next = { ...prev, [key]: !prev[key] }
      try { localStorage.setItem(`tv_plan:${result.username}`, JSON.stringify(next)) } catch {}
      return next
    })
  }

  if (!plan?.tasks?.length) return null

  return (
    <section>
      <SectionHeader index={7} title={p.title} subtitle={p.subtitle} id="thirty-day-plan" />
      <div className="relative space-y-4 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-[#E5E7EB]">
        {plan.tasks.map(task => (
          <div key={task.week} className="relative pl-8">
            <span className="absolute left-0 top-1.5 flex h-[15px] w-[15px] items-center justify-center rounded-full border-2 border-[#1d4ed8] bg-white" />
            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold text-[#1d4ed8]">{p.week} {task.week}</span>
                <span className="text-xs text-[#6B7280]">{task.effortHours} {p.effort}</span>
              </div>
              <p className="mt-1 text-sm font-medium text-[#111827]">{task.goal}</p>
              <ul className="mt-3 space-y-2">
                {task.actions.map((action, i) => {
                  const key = `${task.week}-${i}`
                  const done = !!checked[key]
                  return (
                    <li key={key}>
                      <button type="button" onClick={() => toggle(key)} className="flex w-full items-start gap-2.5 text-left">
                        <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${done ? 'border-[#047857] bg-[#047857]' : 'border-[#D1D5DB] bg-white'}`}>
                          {done && <Check className="h-3 w-3 text-white" />}
                        </span>
                        <span className={`text-[13px] leading-relaxed ${done ? 'text-[#9CA3AF] line-through' : 'text-[#374151]'}`}>{action}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
              <p className="mt-3 border-t border-[#E5E7EB] pt-2.5 text-xs text-[#6B7280]">{p.doneWhen}: {task.doneWhen}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: TSC + Commit**

```bash
git add components/report-v2/sections/ThirtyDayPlan.tsx lib/i18n/dictionaries/en.ts && git commit -m "feat(report-v2): ThirtyDayPlan with localStorage checkoff"
```

---

### Task 11: ShareCard（canvas 布局纯函数 TDD）

**Files:**
- Create: `components/report-v2/share-canvas.ts`
- Create: `components/report-v2/sections/ShareCardSection.tsx`
- Test: `components/report-v2/share-canvas.test.ts`

- [ ] **Step 1: 布局纯函数失败测试**

```typescript
import { describe, it, expect } from 'vitest'
import { layoutShareCard } from './share-canvas'

describe('layoutShareCard', () => {
  it('returns fixed canvas size and element boxes', () => {
    const l = layoutShareCard()
    expect(l.width).toBe(1200)
    expect(l.height).toBe(630)
    expect(l.username.x).toBeGreaterThan(0)
    expect(l.value.y).toBeGreaterThan(l.username.y)
    expect(l.watermark.y).toBeGreaterThan(l.value.y)
  })
})
```

- [ ] **Step 2: 确认失败**

Run: `npx vitest run components/report-v2/share-canvas.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 share-canvas.ts（布局常量 + 绘制函数）**

```typescript
import { Evaluation } from '@/types'
import { valueTierOf, valueTierColor } from '@/lib/pillar'
import { formatNumber } from '@/lib/format'

export function layoutShareCard() {
  return {
    width: 1200,
    height: 630,
    logo: { x: 80, y: 72, size: 40 },
    username: { x: 80, y: 180, size: 44 },
    value: { x: 80, y: 320, size: 96 },
    range: { x: 80, y: 440, size: 34 },
    badge: { x: 80, y: 500, size: 28 },
    watermark: { x: 880, y: 580, size: 24 },
  }
}

export function drawShareCard(canvas: HTMLCanvasElement, result: Evaluation, isPremium: boolean): void {
  const l = layoutShareCard()
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  canvas.width = l.width
  canvas.height = l.height

  const tierColor = valueTierColor(result.tier)

  ctx.fillStyle = '#F7F8FA'
  ctx.fillRect(0, 0, l.width, l.height)

  ctx.fillStyle = tierColor
  ctx.font = `600 ${l.logo.size}px sans-serif`
  ctx.fillText('TokValue', l.logo.x, l.logo.y + l.logo.size)

  ctx.fillStyle = '#111827'
  ctx.font = `600 ${l.username.size}px sans-serif`
  ctx.fillText(`@${result.username}`, l.username.x, l.username.y + l.username.size)

  const range = result.valuationV2?.range
  ctx.fillStyle = tierColor
  ctx.font = `700 ${l.value.size}px sans-serif`
  const mid = range?.mid ?? result.businessValue.high
  ctx.fillText(isPremium ? `$${formatNumber(mid)}` : '$•••••', l.value.x, l.value.y + l.value.size)

  if (range) {
    ctx.fillStyle = '#6B7280'
    ctx.font = `400 ${l.range.size}px sans-serif`
    ctx.fillText(`Estimated value range: $${formatNumber(range.low)} – $${formatNumber(range.high)}`, l.range.x, l.range.y + l.range.size)
  }

  ctx.fillStyle = tierColor
  ctx.font = `600 ${l.badge.size}px sans-serif`
  const percentile = result.peerRanking.overallPercentile
  ctx.fillText(`${valueTierOf(result.tier)} · Top ${100 - percentile}% of similar creators`, l.badge.x, l.badge.y + l.badge.size)

  ctx.fillStyle = '#9CA3AF'
  ctx.font = `400 ${l.watermark.size}px sans-serif`
  ctx.fillText('tokvalue.com', l.watermark.x, l.watermark.y + l.watermark.size)
}
```

- [ ] **Step 4: 测试通过 + Section 组件**

Run: `npx vitest run components/report-v2/share-canvas.test.ts` → PASS

```tsx
'use client'
// components/report-v2/sections/ShareCardSection.tsx
import { useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { Evaluation } from '@/types'
import { drawShareCard } from '../share-canvas'
import { SectionHeader } from '../ui/SectionHeader'
import type { EnDict } from '@/lib/i18n/dictionaries/en'

export function ShareCardSection({ result, dict, isPremium, labels }: {
  result: Evaluation
  dict: EnDict
  isPremium: boolean
  labels: { title: string; subtitle: string; download: string }
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [rendered, setRendered] = useState(false)

  const render = () => {
    if (canvasRef.current) {
      drawShareCard(canvasRef.current, result, isPremium)
      setRendered(true)
    }
  }

  const download = () => {
    if (!canvasRef.current) return
    render()
    const link = document.createElement('a')
    link.download = `tokvalue-${result.username}.png`
    link.href = canvasRef.current.toDataURL('image/png')
    link.click()
  }

  return (
    <section>
      <SectionHeader index={8} title={labels.title} subtitle={labels.subtitle} id="share-card" />
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <canvas ref={canvasRef} className="w-full rounded-xl border border-[#E5E7EB]" style={{ aspectRatio: '1200/630' }} />
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onMouseEnter={render}
            onClick={download}
            className="inline-flex items-center gap-2 rounded-xl bg-[#1d4ed8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1e40af] transition-colors"
          >
            <Download className="h-4 w-4" />
            {labels.download}
          </button>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add components/report-v2/share-canvas.ts components/report-v2/share-canvas.test.ts components/report-v2/sections/ShareCardSection.tsx lib/i18n/dictionaries/en.ts && git commit -m "feat(report-v2): ShareCard canvas with layout tests"
```

---

### Task 12: Methodology + TeaserMask + UnlockBar

**Files:**
- Create: `components/report-v2/sections/Methodology.tsx`
- Create: `components/report-v2/TeaserMask.tsx`
- Create: `components/report-v2/UnlockBar.tsx`
- Modify: `lib/i18n/dictionaries/en.ts`（reportV2.unlock / reportV2.method）

- [ ] **Step 1: 文案**

```typescript
method: {
  title: 'Methodology',
  body: 'TokValue estimates are derived from public TikTok data: recent video views, engagement, follower base, niche market rates and account risk signals. Confidence bands widen the range when sample size or data coverage is limited. Figures are estimates for creator guidance, not offers or guarantees.',
},
unlock: {
  bar: 'Unlock full report',
  included: 'What’s included',
  teaserCta: 'Unlock your exact value',
},
```

- [ ] **Step 2: Methodology（折叠附录）**

```tsx
'use client'
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { SectionHeader } from '../ui/SectionHeader'
import type { EnDict } from '@/lib/i18n/dictionaries/en'

export function Methodology({ dict }: { dict: EnDict }) {
  const [open, setOpen] = useState(false)
  const m = dict.reportV2.method
  return (
    <section>
      <SectionHeader index={9} title={m.title} id="methodology" />
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <button type="button" onClick={() => setOpen(v => !v)} className="flex w-full items-center justify-between text-left">
          <span className="text-sm font-medium text-[#1d4ed8]">{m.title}</span>
          <ChevronDown className={`h-4 w-4 text-[#9CA3AF] transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && <p className="mt-3 text-[13px] leading-relaxed text-[#374151]">{m.body}</p>}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: TeaserMask（渐变遮罩包装器 + 锁定判定测试）**

```tsx
'use client'
import { Lock } from 'lucide-react'
import { useState } from 'react'

/** 锁定判定：非 premium 时 section 显示首屏 + 遮罩 */
export function shouldMaskSection(isPremium: boolean, sectionHasData: boolean): boolean {
  return !isPremium && sectionHasData
}

export function TeaserMask({ locked, children, ctaText }: {
  locked: boolean
  children: React.ReactNode
  ctaText: string
}) {
  const [expanded, setExpanded] = useState(false)
  if (!locked) return <>{children}</>
  return (
    <div className="relative">
      <div className="max-h-[280px] overflow-hidden" aria-hidden="true">
        <div className="pointer-events-none select-none">{children}</div>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex h-[120px] flex-col items-center justify-end bg-gradient-to-b from-white/0 via-white/80 to-white pb-4">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-white px-3.5 py-1.5 text-[13px] font-medium text-[#374151] shadow-sm">
          <Lock className="h-3.5 w-3.5 text-[#6B7280]" />
          {ctaText}
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: TeaserMask 判定单测**

Test: `components/report-v2/TeaserMask.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { shouldMaskSection } from './TeaserMask'

describe('shouldMaskSection', () => {
  it('masks free tier with data', () => expect(shouldMaskSection(false, true)).toBe(true))
  it('never masks premium', () => expect(shouldMaskSection(true, true)).toBe(false))
  it('hides section entirely when no data', () => expect(shouldMaskSection(false, false)).toBe(false))
})
```

Run: `npx vitest run components/report-v2/TeaserMask.test.ts` → PASS

- [ ] **Step 5: UnlockBar（sticky 底部付费条 + included 浮层）**

```tsx
'use client'
import { useState } from 'react'
import { Lock, ChevronDown } from 'lucide-react'

export function UnlockBar({ price, ctaText, includedText, includedItems, onUnlock }: {
  price: string
  ctaText: string
  includedText: string
  includedItems: string[]
  onUnlock: () => void
}) {
  const [showIncluded, setShowIncluded] = useState(false)
  return (
    <div className="sticky bottom-0 z-40 border-t border-[#E5E7EB] bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[#111827]">{ctaText} — {price}</p>
          <button type="button" onClick={() => setShowIncluded(v => !v)} className="inline-flex items-center gap-1 text-xs text-[#1d4ed8] hover:underline">
            {includedText}
            <ChevronDown className={`h-3 w-3 transition-transform ${showIncluded ? 'rotate-180' : ''}`} />
          </button>
        </div>
        <button
          type="button"
          onClick={onUnlock}
          className="shrink-0 rounded-xl bg-[#1d4ed8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1e40af] transition-colors"
        >
          <span className="inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" />{ctaText}</span>
        </button>
      </div>
      {showIncluded && (
        <div className="border-t border-[#E5E7EB] bg-white px-4 py-4">
          <ul className="mx-auto grid max-w-3xl gap-2 sm:grid-cols-2">
            {includedItems.map(item => (
              <li key={item} className="text-[13px] text-[#374151]">✓ {item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: TSC + Commit**

```bash
git add components/report-v2/ && git commit -m "feat(report-v2): Methodology, TeaserMask, UnlockBar"
```

---

### Task 13: ReportShell 组装 + EvaluatePage 切换 + 删旧组件

**Files:**
- Create: `components/report-v2/ReportShell.tsx`
- Modify: `components/EvaluatePage.tsx`（渲染部分换 ReportShell，保留全部状态/支付/埋点逻辑）
- Delete: `components/report/`（7 组件）、`components/ReportTabs.tsx`、`components/DeepAnalysisSection.tsx`
- Modify: `lib/i18n/dictionaries/en.ts`（reportV2.shell：included 列表文案）

- [ ] **Step 1: shell 文案**

```typescript
shell: {
  included: [
    'Exact account value & full breakdown',
    'Negotiation-ready deal pricing',
    'Six-pillar scorecard with attributions',
    'Peer benchmarking across your niche',
    'Risk & account health checks',
    'Your 30-day value growth plan',
  ],
},
```

- [ ] **Step 2: ReportShell（编排 + 解锁滚动锚点）**

```tsx
'use client'

import { Evaluation } from '@/types'
import type { EnDict } from '@/lib/i18n/dictionaries/en'
import { VerdictHero } from './sections/VerdictHero'
import { AccountValue } from './sections/AccountValue'
import { PillarCards } from './sections/PillarCards'
import { DealPricing } from './sections/DealPricing'
import { PeerRanking } from './sections/PeerRanking'
import { RiskHealth } from './sections/RiskHealth'
import { ThirtyDayPlan } from './sections/ThirtyDayPlan'
import { ShareCardSection } from './sections/ShareCardSection'
import { Methodology } from './sections/Methodology'
import { TeaserMask } from './TeaserMask'
import { UnlockBar } from './UnlockBar'

export function ReportShell({ result, dict, isPremium, onUnlock }: {
  result: Evaluation
  dict: EnDict
  isPremium: boolean
  onUnlock: () => void
}) {
  const u = dict.reportV2.unlock
  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-10">
      <VerdictHero result={result} dict={dict} isPremium={isPremium} />

      <div id="unlocked-content" className="scroll-mt-24 space-y-10">
        <TeaserMask locked={!isPremium} ctaText={u.teaserCta}>
          <AccountValue result={result} dict={dict} />
        </TeaserMask>
        {result.pillars && (
          <TeaserMask locked={!isPremium} ctaText={u.teaserCta}>
            <PillarCards result={result} dict={dict} />
          </TeaserMask>
        )}
        {result.dealPricing && (
          <TeaserMask locked={!isPremium} ctaText={u.teaserCta}>
            <DealPricing result={result} dict={dict} />
          </TeaserMask>
        )}
        <TeaserMask locked={!isPremium} ctaText={u.teaserCta}>
          <PeerRanking result={result} dict={dict} />
        </TeaserMask>
        <TeaserMask locked={!isPremium} ctaText={u.teaserCta}>
          <RiskHealth result={result} dict={dict} />
        </TeaserMask>
        {result.thirtyDayPlan && (
          <TeaserMask locked={!isPremium} ctaText={u.teaserCta}>
            <ThirtyDayPlan result={result} dict={dict} />
          </TeaserMask>
        )}
        <ShareCardSection
          result={result}
          dict={dict}
          isPremium={isPremium}
          labels={{
            title: dict.evaluation.shareCard,
            subtitle: 'Save your result and share it.',
            download: dict.evaluation.exportPng,
          }}
        />
        <Methodology dict={dict} />
      </div>

      {!isPremium && (
        <UnlockBar
          price="$9"
          ctaText={u.bar}
          includedText={u.included}
          includedItems={dict.reportV2.shell.included}
          onUnlock={onUnlock}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: EvaluatePage.tsx 切换**

替换 L706-L749 的 Tab 渲染块为：

```tsx
{result && (
  <div className="bg-[#F7F8FA]">
    <ReportShell
      result={result}
      dict={dict}
      isPremium={isPremium}
      onUnlock={() => { setPaidWallMode('unlock'); setShowPaidWallModal(true) }}
    />
  </div>
)}
```

同步修改：
- `handleUnlock` 成功后的 `tabsRef.current?.scrollIntoView(...)` 改为 `document.getElementById('unlocked-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' })`（或给该 div 设 ref）
- 主容器背景 `bg-[#0a0a0a]` → `bg-[#F7F8FA]`；TopBar/搜索条保持现状（后续批次统一），仅报告区域浅色
- 删除 activeTab 状态、ReportTabs/TeaserReport/CommercialSnapshotTab 等 import 及 UnlockFooter/FreeBanner 引用（保留 EvaluatingModal、PaidWallModal、VerifyEmailModal、ShareModal、ShareCardModal、RatingPrompt 等支付与增长组件）
- 免费态 teaser_viewed 埋点保留；report_viewed 埋点保留

- [ ] **Step 4: 删除旧组件**

```bash
git rm -r components/report/ components/ReportTabs.tsx components/DeepAnalysisSection.tsx
```

（先 `Grep -l "from '@/components/report/" .` 与 `Grep "ReportTabs\|DeepAnalysisSection"` 确认仅 EvaluatePage 引用；history/dashboard 若有引用则保留该组件并在验收记录。）

- [ ] **Step 5: TSC + 全量测试**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 错误；160+ 新增测试全绿

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(report-v2): wire ReportShell into EvaluatePage, remove legacy tabs"
```

---

### Task 14: 浏览器验收 + 付费链路回归 + 层级色泄漏检查

**Files:** 无新文件（验收任务）

- [ ] **Step 1: 浏览器验收（demo，付费态）**

访问 `http://127.0.0.1:3000/evaluate/@demo`，检查：
1. 浅色金融风首屏；估值数字 0→终值滚动；层级徽章翡翠绿
2. 九 section 顺序正确；Pillar 滚动入场动画；卡片展开归因
3. 分享卡 canvas 渲染 + PNG 下载
4. Methodology 折叠展开

- [ ] **Step 2: 免费态验收**

DevTools 或临时账号走免费评估，检查：
1. Hero 中值 blur + "Unlock your exact value"
2. ②–⑦ 遮罩 + 锁 pill
3. sticky UnlockBar + What's included 浮层
4. 点击 Unlock → PaidWallModal 弹出（支付逻辑回归）

- [ ] **Step 3: 解锁滚动验证**

解锁成功后页面平滑滚动到 `#unlocked-content` 顶部。

- [ ] **Step 4: 层级色泄漏目检**

检查首页（Recently Evaluated）、/history 历史页、Dashboard：TIER_COLORS 新色在深色背景组件上是否可读；不可读处最小化修复（如历史页徽章文字色改 `#F9FAFB` 底色叠加）——记录发现，必要时补一个 hotfix commit。

- [ ] **Step 5: 付费链路回归**

`.env.local` 临时 `DEV_SKIP_PAYMENT=false` → 走 unlock 全流程（测试卡 4242）→ 恢复 `true`。

- [ ] **Step 6: 最终提交**

```bash
git add -A && git commit -m "chore(report-v2): acceptance fixes from browser QA"
git push
```

---

## Self-Review 记录

- **Spec 覆盖**：9 sections ✓（Task 4-11,12）；Teaser 遮罩 ✓（Task 12）；sticky 付费条 ✓（Task 12）；解锁滚动 ✓（Task 13）；TIER_COLORS ✓（Task 1）；删旧组件 ✓（Task 13）；无障碍降级 ✓（CountUp/PillarCards）；i18n ✓（每 task 增量）
- **占位符**：无 TBD/TODO；AccountValue howEstimated 文案为完整英文段落（非占位）
- **类型一致性**：`valueTierOf/valueTierColor` 来自 lib/pillar.ts（已存在）；`dict.reportV2.*` 命名空间统一；`Evaluation` 可缺省字段（pillars/dealPricing/thirtyDayPlan/valuationV2）均有 null-guard
- **已知实现注意**：① PillarBar 需传入状态色（Task 6 注明）② percentile 语义在浏览器确认 ③ 删组件前全局 grep 引用

---

# Phase 2: 深度内容回填（v1.13.0 后追加，2026-08-19 确认）

**Goal:** 将旧版报告的深度数据（10 维雷达、8 渠道收入、12 月路线图、Top 视频/趋势/内容策略、品牌匹配/商业准备度、账号健康明细）以 v2 浅色叙事设计语言加回，报告从 9 sections 扩到 14 sections，并新增 sticky 锚点导航。

**已确认决策：** 全部数据字段在 `Evaluation`（types.ts L109-149）中完整存在，本阶段零数据层改动，纯呈现层。

**新 section 清单与插入位置（最终顺序）：**

| # | id | 组件 | 数据源 |
|---|---|---|---|
| 1 | verdict-hero | VerdictHero（现有） | summary/valuationV2 |
| 2 | account-value | AccountValue（现有） | businessValue |
| 3 | dimension-radar | 新 DimensionRadar | dimensions（10 维）|
| 4 | pillars | PillarCards（现有） | pillars |
| 5 | income | 新 IncomeOpportunities | incomeEstimate.breakdown（8 渠道）|
| 6 | deal-pricing | DealPricing（现有） | dealPricing |
| 7 | revenue-roadmap | 新 RevenueRoadmapSection | revenueRoadmap.projections |
| 8 | peer-ranking | PeerRanking（现有） | peerRanking |
| 9 | growth-content | 新 GrowthContent | topPosts/trendAnalysis/contentStrategy |
| 10 | brand-commerce | 新 BrandCommerce | brandMatching/commerceReadiness |
| 11 | risk-health | RiskHealth（增强） | riskFlags/accountHealth |
| 12 | thirty-day-plan | ThirtyDayPlan（现有） | thirtyDayPlan |
| 13 | share-card | ShareCardSection（现有） | — |
| 14 | methodology | Methodology（现有） | — |

**配套：** ReportShell 加 sticky 锚点导航（ReportNav）：桌面左侧竖排固定（fixed），移动端顶部横滚 pill 条；IntersectionObserver 高亮当前 section；新 section 全部套 TeaserMask（share-card/methodology 除外，维持现状）。

### Task 15: 雷达图几何纯函数（TDD）

**Files:** Create `components/report-v2/radar-geometry.ts` + `radar-geometry.test.ts`

核心契约（先写失败测试再实现）：

```typescript
export interface RadarPoint { x: number; y: number }
// radarPolygonPoints(scores, cx, cy, radius)：第 i 轴角度 = -90° + 360°/n * i；
// r = radius * clamp(score,0,100)/100；返回 {x: cx + r·cosθ, y: cy + r·sinθ}
// radarAxisAnchors(count, cx, cy, radius)：满半径的轴端点（放 label 用）
```

测试断言：首轴在正上方（x=cx, y=cy-r）；score=100 时点在轴端；score 越界 clamp；n 轴均匀分布。测试通过后 commit `feat(report-v2): radar geometry pure functions with tests`。

### Task 16: DimensionRadar section

**Files:** Create `components/report-v2/sections/DimensionRadar.tsx`；Modify en.ts（reportV2.radar）

数据：result.dimensions（10 维）。布局：左 SVG 雷达（viewBox 240×240，cx=cy=120，radius=100；网格 3 圈 = scores 全 33/66/100 的多边形描边 #E5E7EB；轴线同色；数据多边形 fill rgba(29,78,216,0.15) + stroke #1d4ed8），右维度分数列表（名称+分数条+数值）。en.ts radar.labels 用用户可见名（Reach/Engagement/Content/Authenticity/Momentum/Consistency/Brand Fit/Monetization/Health/Influence）。commit `feat(report-v2): DimensionRadar section with SVG radar`。

### Task 17: IncomeOpportunities section

**Files:** Create `components/report-v2/sections/IncomeOpportunities.tsx`；Modify en.ts（reportV2.income）

数据：result.incomeEstimate（monthlyTotal 区间 + breakdown 8 渠道 + categoryLabel/regionLabel）。布局：顶部月度总额卡（大数字区间 + niche/region pill）；渠道列表每行：label + monthlyAmount.mid + percentage 条 + confidence pill（high 绿 #15803d/medium 蓝 #1d4ed8/low 灰 #6B7280）+ detail。commit `feat(report-v2): IncomeOpportunities section`。

### Task 18: RevenueRoadmapSection

**Files:** Create `components/report-v2/sections/RevenueRoadmapSection.tsx`；Modify en.ts（reportV2.roadmap）

数据：result.revenueRoadmap（currentMonthly/projections[]/total12Month）。布局：顶部 Now → 12-month 两卡；竖向里程碑时间线（复用 ThirtyDayPlan 视觉：左线+圆点），每节点 Month N + label + revenue 区间 + milestone + unlocks ✓ 列表。commit `feat(report-v2): RevenueRoadmap section`。

### Task 19: GrowthContent section

**Files:** Create `components/report-v2/sections/GrowthContent.tsx`；Modify en.ts（reportV2.growth）

数据：result.topPosts（前 3）、result.trendAnalysis.topics、result.contentStrategy。布局三块：Top Videos（desc 截断 60 字 + Views/Likes/Shares）；Trending pills（growth% 正绿负红）；Content Strategy 折叠（pillars/hashtags/optimalSchedule/collabIdeas）。commit `feat(report-v2): GrowthContent section`。

### Task 20: BrandCommerce section

**Files:** Create `components/report-v2/sections/BrandCommerce.tsx`；Modify en.ts（reportV2.brand）

数据：result.brandMatching.matches、result.commerceReadiness（overallScore/tier/summary/channels/productMatches/recommendation）。布局：准备度卡（大数字 + tier 徽章 + summary + recommendation）；品牌匹配列表（brand + dealValue + fitReason）；渠道适配条（channel + fit 标签 + score 条）；产品匹配折叠。commit `feat(report-v2): BrandCommerce section`。

### Task 21: RiskHealth 增强

**Files:** Modify `components/report-v2/sections/RiskHealth.tsx`；en.ts（reportV2.risk 追加）

新增 Account Health 子卡：shadowban 风险（low 绿/medium 金/high 红 + signals 列表）、fakeFollowerEstimate 数字、engagementAuthenticity 分数条、healthReasoning 小字。commit `feat(report-v2): RiskHealth account health detail block`。

### Task 22: ReportNav + ReportShell 接线

**Files:** Create `components/report-v2/ReportNav.tsx`；Modify ReportShell.tsx + 各 section SectionHeader index

ReportNav：桌面 `hidden lg:flex fixed left-6 top-1/3 z-30 flex-col gap-1` 竖排、移动 `lg:hidden sticky top-16 z-30 overflow-x-auto flex gap-2` pill 条；IntersectionObserver rootMargin '-40% 0px -55%' 高亮。ReportShell 按 14-section 表重排，新 section 套 TeaserMask。en.ts reportV2.nav（12 个短 label）。验证 tsc + vitest 全量。commit `feat(report-v2): wire 14-section shell with ReportNav`。

### Task 23: 浏览器验收（Phase 2）

demo 付费态（14 sections 顺序/雷达/8 渠道/路线图/Top 视频/品牌/健康明细/导航两形态/锚点高亮）+ demo-free 免费态（新 section 遮罩、nav 可见）+ 控制台无红错。修复后最终 commit + push。
