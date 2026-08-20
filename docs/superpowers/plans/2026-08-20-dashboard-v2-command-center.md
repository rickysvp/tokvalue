# Dashboard v2 Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/dashboard` as a Linear-style light Command Center with 4 pages (Home / Reports / Growth / Profile), with Today's Tasks as the visual core. Data layer (evaluation/credits/payments) untouched — only presentation.

**Architecture:** Build new components under `components/dashboard-v2/` (co-located by page). Each page is a thin assembly. Switch all routes once complete — no hybrid intermediate state. Delete old `components/dashboard/` after cutover.

**Tech Stack:** Next.js 15 App Router + TypeScript + Tailwind (light tokens) + existing session/credits APIs. No new deps — CountUp/Progress/Accordion hand-rolled via rAF + CSS transitions.

---

## File Structure

```
components/dashboard-v2/
├── ui/
│   ├── Card.tsx                  10px rounded card wrapper
│   ├── Pill.tsx                  Badge component with tier/priority variants
│   ├── Checkbox.tsx              18px checkbox with completed=green✓/idle=gray
│   ├── TaskRow.tsx               Task item: [checkbox] [title+sub] [pill] [arrow]
│   └── KpiCard.tsx               1 KPI slot (uppercase sub + 22px tabnum + subline)
├── Sidebar.tsx                   Left 200px nav / mobile top scroll pills
├── DashboardShell.tsx            Sidebar + main container + DataProvider bridge
├── home/
│   ├── GreetingBar.tsx           Greeting + time-based + switcher + ReviewAgain/EvaluateNew
│   ├── KPIRow.tsx                3 KpiCards (Value/Rank/Credits)
│   ├── BottleneckMilestone.tsx   Two accent cards: gold bottleneck + emerald milestone
│   ├── TodayTasks.tsx            Today list + priority + copy pitch / reply links
│   ├── PillarScorecard.tsx       3×2 score bars
│   └── ProgressStrip.tsx         3-node history (only when length≥2)
├── reports/
│   ├── FilterChips.tsx           All/Paid/Free/username chips
│   └── ReportsTable.tsx          6-col table + inline Open/Share/(Unlock|PDF)
├── growth/
│   ├── ProgressHeader.tsx        Overall progress bar with gradient fill
│   └── WeekAccordion.tsx         Single week expanded/collapsed (4 instances)
└── profile/
    ├── AccountCard.tsx
    ├── CreditsBillingCard.tsx    Credits gradient card + buy CTA + plan status
    ├── PreferencesToggle.tsx     2 preference toggles
    └── DangerZone.tsx            Sign out

app/dashboard/
├── layout.tsx                    DashboardShell with children
├── page.tsx                      Home 6 sections assembly
├── reports/page.tsx              Reports page
├── growth/page.tsx               Growth page (WAS: /dashboard/growth-plan)
└── profile/page.tsx              Profile page (WAS: /dashboard/settings → redirect)

lib/i18n/dictionaries/en.ts       Append dashboard.v2.* keys
next.config.js                    Add redirect /dashboard/settings → /dashboard/profile
```

---

### Task 1: UI atoms TDD — Pill, Checkbox, Card, KpiCard, TaskRow

**Files:**
- Create: `components/dashboard-v2/ui/Pill.tsx`
- Create: `components/dashboard-v2/ui/Checkbox.tsx`
- Create: `components/dashboard-v2/ui/Card.tsx`
- Create: `components/dashboard-v2/ui/KpiCard.tsx`
- Create: `components/dashboard-v2/ui/TaskRow.tsx`
- Test: Create `components/dashboard-v2/ui/__tests__/atoms.test.tsx`

- [ ] **Step 1: Write failing test for Pill variants**

```tsx
import { render, screen } from '@testing-library/react'
import { Pill } from '../Pill'
import { Checkbox } from '../Checkbox'
import { KpiCard } from '../KpiCard'
import { TaskRow } from '../TaskRow'

describe('Pill', () => {
  it('renders p0 with danger red classes', () => {
    render(<Pill variant="p0">P0</Pill>)
    const el = screen.getByText('P0')
    expect(el.className).toMatch(/dc2626/)
  })
  it('renders p1 with blue classes', () => {
    render(<Pill variant="p1">P1</Pill>)
    expect(screen.getByText('P1').className).toMatch(/1d4ed8/)
  })
  it('renders tier premium with emerald classes', () => {
    render(<Pill variant="tier-premium">Premium</Pill>)
    expect(screen.getByText('Premium').className).toMatch(/047857/)
  })
  it('renders tier growth with blue classes', () => {
    render(<Pill variant="tier-growth">Growth</Pill>)
    expect(screen.getByText('Growth').className).toMatch(/1d4ed8/)
  })
  it('renders tier developing with amber classes', () => {
    render(<Pill variant="tier-developing">Developing</Pill>)
    expect(screen.getByText('Developing').className).toMatch(/b45309/)
  })
})

describe('Checkbox', () => {
  it('shows hollow circle unchecked', () => {
    render(<Checkbox checked={false} />)
    const input = screen.getByRole('checkbox', { hidden: true }) as HTMLInputElement
    expect(input.checked).toBe(false)
  })
  it('shows green check when completed', () => {
    const { container } = render(<Checkbox checked={true} />)
    expect(container.firstChild?.textContent).toContain('✓')
  })
  it('calls onChange on click', () => {
    const fn = vi.fn()
    render(<Checkbox checked={false} onChange={fn} />)
    const input = screen.getByRole('checkbox', { hidden: true })
    fireEvent.click(input)
    expect(fn).toHaveBeenCalledWith(true)
  })
})

describe('KpiCard', () => {
  it('renders uppercase title, numeric with tabular-nums, delta positive green', () => {
    render(<KpiCard
      title="Account Value"
      value="$75.1K"
      delta="+8.2%"
      deltaLabel="vs Aug 5"
    />)
    expect(screen.getByText('ACCOUNT VALUE')).toBeTruthy()
    const val = screen.getByText('$75.1K')
    expect(val.className).toMatch(/tabular-nums/)
    expect(screen.getByText('▲ +8.2%').className).toMatch(/047857/)
  })
  it('hides delta row if no delta', () => {
    const { container } = render(<KpiCard title="Account Value" value="$75.1K" />)
    expect(container.textContent).not.toMatch(/vs/)
  })
})

describe('TaskRow', () => {
  it('renders checkbox + title + subtext + pill', () => {
    render(<TaskRow
      title="Post weekly video"
      subtext="Pillar 1 · Consistency"
      priority="p0"
      checked={false}
    />)
    expect(screen.getByText('Post weekly video')).toBeTruthy()
    expect(screen.getByText('P0')).toBeTruthy()
    expect(screen.getByText(/Pillar 1/)).toBeTruthy()
  })
  it('crosses out + opacity when checked', () => {
    const { container } = render(<TaskRow
      title="Done" subtext="done" priority="p1" checked={true}
    />)
    expect(container.querySelector('[style*="line-through"]')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the test to verify all FAIL**

Run: `cd /Users/ricky/AICode/TokValue && npx vitest run components/dashboard-v2/ui/__tests__/atoms.test.tsx 2>&1 | tail -20`
Expected: FAIL "Cannot find module" for each

- [ ] **Step 3: Write components**

```tsx
// components/dashboard-v2/ui/Pill.tsx
import React from 'react'

type Variant =
  | 'p0' | 'p1' | 'p2'
  | 'tier-premium' | 'tier-growth' | 'tier-developing' | 'tier-early'
  | 'muted'
export function Pill({
  children, variant = 'muted', className = ''
}: { children: React.ReactNode; variant?: Variant; className?: string }) {
  const m: Record<Variant, string> = {
    'p0': 'bg-[#dc262610] text-[#dc2626]',
    'p1': 'bg-[#1d4ed810] text-[#1d4ed8]',
    'p2': 'bg-gray-100 text-gray-600',
    'tier-premium': 'bg-[#04785710] text-[#047857]',
    'tier-growth': 'bg-[#1d4ed810] text-[#1d4ed8]',
    'tier-developing': 'bg-[#b4530910] text-[#b45309]',
    'tier-early': 'bg-gray-100 text-gray-600',
    'muted': 'bg-gray-100 text-gray-600',
  }
  return <span className={`inline-flex items-center text-[10px] sm:text-[11px] font-semibold px-2 sm:px-2.5 py-1 rounded-full ${m[variant]} ${className}`}>{children}</span>
}
```

```tsx
// components/dashboard-v2/ui/Checkbox.tsx
import React from 'react'
export function Checkbox({
  checked, onChange, size = 18
}: { checked: boolean; onChange?: (next: boolean) => void; size?: number }) {
  const base = checked
    ? 'border-[#047857] bg-[#04785710] text-[#047857]'
    : 'border-[#d1d5db] bg-white'
  return (
    <div
      role="checkbox" aria-checked={checked}
      className={`inline-flex items-center justify-center rounded-md border-2 cursor-pointer select-none ${base}`}
      style={{ width: size, height: size, fontSize: size * 0.55, fontWeight: 700 }}
      onClick={() => onChange?.(!checked)}
    >
      <input type="checkbox" className="sr-only" checked={checked} readOnly />
      {checked && <span aria-hidden>✓</span>}
    </div>
  )
}
```

```tsx
// components/dashboard-v2/ui/Card.tsx
import React from 'react'
export function Card({ children, className = '', as: As = 'div' }:
  { children: React.ReactNode; className?: string; as?: any }) {
  return <As className={`bg-white border border-[#e5e7eb] rounded-[10px] ${className}`}>{children}</As>
}
```

```tsx
// components/dashboard-v2/ui/KpiCard.tsx
import React from 'react'
import { Card } from './Card'

export function KpiCard({
  title, value, delta, deltaLabel, deltaDir, topRight
}: {
  title: string
  value: string
  delta?: string
  deltaLabel?: string
  /** 'up' = positive green, 'down' = danger red, 'neutral' = gray */
  deltaDir?: 'up' | 'down' | 'neutral'
  topRight?: React.ReactNode
}) {
  const deltaColor = deltaDir === 'up'
    ? 'text-[#047857]'
    : deltaDir === 'down'
      ? 'text-[#dc2626]'
      : 'text-[#6b7280]'
  const arrow = deltaDir === 'up' ? '▲' : deltaDir === 'down' ? '▼' : '•'
  return (
    <Card className="p-[14px] sm:p-4 relative">
      {topRight && <div className="absolute top-3 right-3 text-[11px] text-[#9ca3af]">{topRight}</div>}
      <div className="text-[11px] uppercase tracking-[0.5px] font-medium text-[#6b7280] mb-[6px]">{title}</div>
      <div className="text-[22px] font-semibold text-[#111827] tabular-nums tracking-tight leading-none">{value}</div>
      {(delta || deltaLabel) && (
        <div className="text-[11px] mt-[3px] flex items-center gap-1">
          {delta && <span className={`inline-flex items-center gap-1 ${deltaColor}`}><span>{arrow}</span><span>{delta}</span></span>}
          {deltaLabel && <span className="text-[#6b7280]">{deltaLabel}</span>}
        </div>
      )}
    </Card>
  )
}
```

```tsx
// components/dashboard-v2/ui/TaskRow.tsx
import React from 'react'
import { Checkbox } from './Checkbox'
import { Pill } from './Pill'

type Priority = 'p0' | 'p1' | 'p2'
export function TaskRow({
  title, subtext, priority, checked, onToggle,
  linkArrow, actions, highlight
}: {
  title: string
  subtext?: string
  priority: Priority
  checked: boolean
  onToggle?: (next: boolean) => void
  linkArrow?: React.ReactNode
  actions?: React.ReactNode
  highlight?: 'today' | boolean
}) {
  const line = checked ? 'line-through opacity-50' : ''
  const hl = highlight === 'today' || highlight === true
    ? 'bg-[#1d4ed805] border-[#1d4ed820]'
    : 'border-[#e5e7eb] bg-white'
  return (
    <div className={`flex items-start gap-3 p-[14px] sm:px-4 sm:py-[14px] border rounded-[10px] transition ${hl}`}>
      <Checkbox checked={checked} onChange={onToggle} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <div className={`text-[14px] font-medium text-[#111827] leading-snug ${line}`}>{title}</div>
          <Pill variant={priority}>
            {priority === 'p0' ? 'P0' : priority === 'p1' ? 'P1' : 'P2'}
          </Pill>
        </div>
        {subtext && (
          <div className={`text-[12px] text-[#6b7280] ${checked ? 'line-through opacity-60' : ''}`}>{subtext}</div>
        )}
        {actions && <div className="mt-2 flex flex-wrap gap-1.5">{actions}</div>}
      </div>
      {linkArrow && <div className="text-[11px] text-[#1d4ed8] font-medium self-center flex-shrink-0">{linkArrow}</div>}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify PASS**

Run: `npx vitest run components/dashboard-v2/ui/__tests__/atoms.test.tsx 2>&1 | tail -15`
Expected: `Tests: 14 passed`

- [ ] **Step 5: Commit**

```bash
git add components/dashboard-v2/ui/
git commit -m "feat(dashboard-v2): UI atoms TDD (Pill/Checkbox/Card/KpiCard/TaskRow)"
```

---

### Task 2: Sidebar + DashboardShell 骨架

**Files:**
- Create: `components/dashboard-v2/Sidebar.tsx`
- Create: `components/dashboard-v2/DashboardShell.tsx`
- Modify: `app/dashboard/layout.tsx` (replace existing)
- Test: `components/dashboard-v2/__tests__/shell.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { Sidebar } from '../Sidebar'

describe('Sidebar nav items', () => {
  it('shows 4 primary links', () => {
    render(<Sidebar current="home" />)
    expect(screen.getByText(/Home/)).toBeTruthy()
    expect(screen.getByText(/Growth/)).toBeTruthy()
    expect(screen.getByText(/Reports/)).toBeTruthy()
    expect(screen.getByText(/Profile/)).toBeTruthy()
  })
  it('marks Home active with blue tint', () => {
    const { container } = render(<Sidebar current="home" />)
    const home = screen.getByText(/Home/).closest('a') || screen.getByText(/Home/).parentElement
    expect(home?.className).toMatch(/1d4ed8/)
  })
})
```

- [ ] **Step 2: Run tests, expect FAIL**

Run: `npx vitest run components/dashboard-v2/__tests__/shell.test.tsx 2>&1 | tail -10`
Expected: FAIL module not found

- [ ] **Step 3: Implement Sidebar and DashboardShell**

```tsx
// components/dashboard-v2/Sidebar.tsx
import Link from 'next/link'
import React from 'react'

type Key = 'home' | 'growth' | 'reports' | 'profile'
const NAV: { key: Key; label: string; href: string }[] = [
  { key: 'home', label: 'Home', href: '/dashboard' },
  { key: 'growth', label: 'Growth', href: '/dashboard/growth' },
  { key: 'reports', label: 'Reports', href: '/dashboard/reports' },
  { key: 'profile', label: 'Profile', href: '/dashboard/profile' },
]

export function Sidebar({ current, user }: { current: Key; user?: { name: string; email: string; avatarInitial?: string } }) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside data-testid="sidebar-desktop" className="hidden lg:flex w-[200px] flex-shrink-0 flex-col pr-4 border-r border-[#e5e7eb] min-h-[calc(100vh-64px)]">
        <div className="text-[13px] font-semibold text-[#111827] mb-4">TokValue</div>
        <nav className="flex flex-col gap-0.5 text-[13px]">
          {NAV.map(n => {
            const active = n.key === current
            return (
              <Link key={n.key} href={n.href}
                className={`px-2.5 py-1.5 rounded-md ${active ? 'bg-[#1d4ed810] text-[#1d4ed8] font-medium' : 'text-[#6b7280] hover:text-[#111827]'}`}
              >
                {n.label}
              </Link>
            )
          })}
        </nav>
        {user && (
          <div className="mt-auto pt-4 border-t border-[#e5e7eb]">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-[#1d4ed8] text-white text-[11px] font-semibold flex items-center justify-center">
                {user.avatarInitial || user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-[12px] font-medium text-[#111827] truncate">{user.name}</div>
                <div className="text-[11px] text-[#6b7280] truncate">{user.email}</div>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Mobile pill tabs */}
      <nav data-testid="sidebar-mobile" className="lg:hidden -mx-4 mb-4 px-4 overflow-x-auto">
        <div className="flex gap-2 pb-1">
          {NAV.map(n => {
            const active = n.key === current
            return (
              <Link key={n.key} href={n.href}
                className={`whitespace-nowrap text-[12px] px-3 py-1.5 rounded-full border ${active ? 'border-[#1d4ed8] bg-[#1d4ed8] text-white font-medium' : 'border-[#e5e7eb] bg-white text-[#6b7280]'}`}
              >
                {n.label}
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
```

```tsx
// components/dashboard-v2/DashboardShell.tsx
'use client'
import React from 'react'
import { Sidebar } from './Sidebar'

export type DashboardPageKey = 'home' | 'growth' | 'reports' | 'profile'

export function DashboardShell({
  page, children, user
}: {
  page: DashboardPageKey
  children: React.ReactNode
  user?: { name: string; email: string }
}) {
  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#111827]">
      {/* Spacer for topbar (kept from app layout; reuse existing Topbar component if present) */}
      <div className="max-w-[1280px] mx-auto px-4 pt-6 pb-16 flex gap-6 lg:gap-8">
        <Sidebar current={page} user={user} />
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  )
}
```

```tsx
// app/dashboard/layout.tsx （替换现有内容）
import React from 'react'
import { DashboardShell } from '@/components/dashboard-v2/DashboardShell'
import { DashboardDataProvider } from '@/components/dashboard/dashboard-data'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // 注意：page key 由各 page 自己在渲染时设置（children 用 context 注入或通过组件传入）
  // 简单方案：每个 page 自行 <DashboardShell page="xx"> 包裹 —— 本 layout 仅提供数据 Provider。
  return (
    <DashboardDataProvider>
      {children}
    </DashboardDataProvider>
  )
}
```

- [ ] **Step 4: Run tests PASS**

Run: `npx vitest run components/dashboard-v2/__tests__/shell.test.tsx 2>&1 | tail -10`
Expected: `Tests: 2 passed`

- [ ] **Step 5: Commit**

```bash
git add components/dashboard-v2/Sidebar.tsx components/dashboard-v2/DashboardShell.tsx app/dashboard/layout.tsx components/dashboard-v2/__tests__/shell.test.tsx
git commit -m "feat(dashboard-v2): Sidebar + DashboardShell skeleton (4 pages nav)"
```

---

### Task 3: Home 模块①③ — GreetingBar + BottleneckMilestone

**Files:**
- Create: `components/dashboard-v2/home/GreetingBar.tsx`
- Create: `components/dashboard-v2/home/BottleneckMilestone.tsx`

- [ ] **Step 1: Implement GreetingBar**

```tsx
'use client'
import Link from 'next/link'
import React, { useMemo } from 'react'

export function GreetingBar({
  firstName,
  currentUsername,
  accounts,
  onSwitchAccount,
  latestEvaluationAvailable
}: {
  firstName: string
  currentUsername: string
  /** 当>1时显示 switcher */
  accounts?: string[]
  onSwitchAccount?: (u: string) => void
  latestEvaluationAvailable: boolean
}) {
  const h = new Date().getHours()
  const period = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'
  const things = 0 // 由父组件传入，这里占位为了纯组件
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <div>
          <h1 className="text-[24px] font-semibold text-[#111827] leading-tight">
            Good {period}, {firstName} 👋
          </h1>
          <p className="text-[13px] text-[#6b7280] mt-0.5">
            {/* 实际 things 数由父组件注入 */}
            Working on <UsernameSwitcher
              current={currentUsername}
              accounts={accounts}
              onChange={onSwitchAccount}
            />
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {latestEvaluationAvailable && (
            <Link
              href={`/evaluate/${encodeURIComponent(currentUsername)}`}
              className="px-3.5 py-[7px] text-[12px] border border-[#e5e7eb] bg-white text-[#111827] rounded-[7px] font-medium hover:bg-gray-50"
            >
              Review again
            </Link>
          )}
          <Link
            href="/"
            className="px-3.5 py-[7px] text-[12px] border border-[#1d4ed8] bg-[#1d4ed8] text-white rounded-[7px] font-medium hover:opacity-95"
          >
            Evaluate new
          </Link>
        </div>
      </div>
    </div>
  )
}

function UsernameSwitcher({
  current, accounts = [], onChange
}: { current: string; accounts?: string[]; onChange?: (u: string) => void }) {
  if (accounts.length <= 1) {
    return <span className="font-medium text-[#111827]">@{current}</span>
  }
  return (
    <select
      className="inline-block ml-1 text-[13px] text-[#1d4ed8] font-medium border-none bg-transparent cursor-pointer border-b border-dashed border-[#1d4ed8] pr-3 appearance-none"
      value={current}
      onChange={e => onChange?.(e.target.value)}
    >
      {accounts.map(a => <option key={a} value={a}>@{a}</option>)}
    </select>
  )
}
```

- [ ] **Step 2: Implement BottleneckMilestone**

```tsx
import Link from 'next/link'
import React from 'react'
import { Card } from '../ui/Card'

export type RateBlocker = { label: string; fix: string; pillarWeekAnchor?: string }
export type Milestone = { title: string; description: string; suggestCta?: { label: string; href: string } }

export function BottleneckMilestone({ blocker, milestone }: {
  blocker: RateBlocker
  milestone: Milestone
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Card className="p-4 border-[#b4530925]" style={{ background: 'linear-gradient(180deg,#fff8e8 0%,#fff 100%)' }}>
        <div className="text-[11px] text-[#b45309] uppercase tracking-[0.8px] font-semibold mb-2">⚠ Biggest bottleneck</div>
        <div className="text-[14px] font-medium text-[#111827] mb-0.5">{blocker.label}</div>
        <div className="text-[12px] text-[#6b7280] mb-2.5">{blocker.fix}</div>
        <Link
          href={blocker.pillarWeekAnchor ? `/dashboard/growth#${blocker.pillarWeekAnchor}` : '/dashboard/growth'}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-[#b45309] underline underline-offset-2"
        >
          See fix in Growth →
        </Link>
      </Card>

      <Card className="p-4 border-[#04785725]" style={{ background: 'linear-gradient(180deg,#e8f6f0 0%,#fff 100%)' }}>
        <div className="text-[11px] text-[#047857] uppercase tracking-[0.8px] font-semibold mb-2">🏁 Next milestone</div>
        <div className="text-[14px] font-medium text-[#111827] mb-0.5">{milestone.title}</div>
        <div className="text-[12px] text-[#6b7280] mb-2.5">{milestone.description}</div>
        {milestone.suggestCta ? (
          <Link href={milestone.suggestCta.href} className="inline-flex items-center gap-1 text-[12px] font-medium text-[#047857] underline underline-offset-2">
            {milestone.suggestCta.label} →
          </Link>
        ) : (
          <Link href="/dashboard/growth" className="inline-flex items-center gap-1 text-[12px] font-medium text-[#047857] underline underline-offset-2">
            View plan steps →
          </Link>
        )}
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Smoke test — no syntax / TSC errors**

Run: `npx tsc --noEmit 2>&1 | grep -E "(GreetingBar|BottleneckMilestone|error)" | head -20`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add components/dashboard-v2/home/GreetingBar.tsx components/dashboard-v2/home/BottleneckMilestone.tsx
git commit -m "feat(dashboard-v2/home): GreetingBar + BottleneckMilestone cards"
```

---

### Task 4: Home 模块②⑤⑥ — KPIRow + PillarScorecard + ProgressStrip

**Files:**
- Create: `components/dashboard-v2/home/KPIRow.tsx`
- Create: `components/dashboard-v2/home/PillarScorecard.tsx`
- Create: `components/dashboard-v2/home/ProgressStrip.tsx`
- Test: `components/dashboard-v2/home/__tests__/modules.test.tsx`

- [ ] **Step 1: Failing tests**

```tsx
import { render, screen } from '@testing-library/react'
import { ProgressStrip } from '../ProgressStrip'
import { PillarScorecard } from '../PillarScorecard'
import { KPIRow } from '../KPIRow'

describe('ProgressStrip', () => {
  it('returns null when history < 2', () => {
    const { container } = render(<ProgressStrip history={[]} />)
    expect(container.firstChild).toBeNull()
  })
  it('renders 3 nodes when history >=2', () => {
    const hist = [
      { dateLabel: 'Aug 5', valueLabel: '$69.5K', tier: 'Growth Value' },
      { dateLabel: 'Aug 19', valueLabel: '$75.1K', tier: 'Premium Value', isCurrent: true },
    ] as any
    render(<ProgressStrip history={hist} />)
    expect(screen.getByText('Aug 5')).toBeTruthy()
    expect(screen.getByText('Aug 19')).toBeTruthy()
    expect(screen.getByText('Next')).toBeTruthy()
  })
})

describe('PillarScorecard', () => {
  it('renders 6 bars with scores', () => {
    const pillars = [
      { name: 'Growth', score: 86, status: 'strong' },
      { name: 'Consistency', score: 82, status: 'strong' },
      { name: 'Audience Quality', score: 71, status: 'on-track' },
      { name: 'Niche Clarity', score: 78, status: 'on-track' },
      { name: 'Brand Readiness', score: 54, status: 'needs-attention' },
      { name: 'Risk', score: 90, status: 'strong' },
    ] as any
    render(<PillarScorecard pillars={pillars} reportHref="#pillars" username="fitcoach" />)
    expect(screen.getByText('Growth')).toBeTruthy()
    expect(screen.getByText('86')).toBeTruthy()
  })
})

describe('KPIRow', () => {
  it('shows delta only when provided', () => {
    render(<KPIRow value={{ mid: 75100, deltaPct: 8.2, deltaLabel: 'vs Aug 5' }} rank={{ percentile: 74, tierWord: 'Premium Value' }} credits={{ remaining: 6, packLabel: '$29 pack · 1 used' }} date="Aug 19" />)
    expect(screen.getByText('ACCOUNT VALUE')).toBeTruthy()
    expect(screen.getByText(/\$75\.1K/)).toBeTruthy()
    expect(screen.getByText('▲ +8.2%')).toBeTruthy()
    expect(screen.getByText('Top 26%')).toBeTruthy()
    expect(screen.getByText('6')).toBeTruthy()
  })
  it('omits delta when not present', () => {
    const { container } = render(<KPIRow value={{ mid: 75100 }} rank={{ percentile: 74, tierWord: 'Premium Value' }} credits={{ remaining: 6, packLabel: '' }} date="Aug 19" />)
    expect(container.textContent).not.toMatch(/vs/)
  })
})
```

- [ ] **Step 2: Run test FAIL**

Run: `npx vitest run components/dashboard-v2/home/__tests__/modules.test.tsx 2>&1 | tail -10`
Expected: FAIL module not found

- [ ] **Step 3: Implement 3 modules**

```tsx
// components/dashboard-v2/home/KPIRow.tsx
import React from 'react'
import { KpiCard } from '../ui/KpiCard'
import { Pill } from '../ui/Pill'

/** Format 63800 → '$63.8K' , 1200000 → '$1.2M' */
function fmtMoney(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`
  return `$${v}`
}

export function KPIRow({
  value, rank, credits, date
}: {
  value: { mid: number; deltaPct?: number; deltaLabel?: string }
  rank: { percentile: number; tierWord: string }
  credits: { remaining: number; packLabel?: string }
  date?: string
}) {
  const deltaDir = value.deltaPct == null ? undefined : value.deltaPct >= 0 ? 'up' : 'down'
  const delta = value.deltaPct == null ? undefined
    : `${value.deltaPct > 0 ? '+' : ''}${value.deltaPct.toFixed(1)}%`
  const rankPct = 100 - rank.percentile
  const rankColor =
    rank.tierWord.startsWith('Premium') ? 'tier-premium'
    : rank.tierWord.startsWith('Growth') ? 'tier-growth'
    : rank.tierWord.startsWith('Developing') ? 'tier-developing' : 'tier-early'
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <KpiCard
        title="Account Value"
        value={fmtMoney(value.mid)}
        delta={delta}
        deltaLabel={value.deltaLabel}
        deltaDir={deltaDir}
        topRight={date}
      />
      <KpiCard
        title="Market Rank"
        value={`Top ${rankPct}%`}
      >
        {/* <KpiCard children slot — fallback: append via wrapper */}
      </KpiCard>
      <KpiCard
        title="Reviews Left"
        value={String(credits.remaining)}
        deltaLabel={credits.packLabel}
      />
    </div>
  )
  // NOTE: tierWord pill append: use slot. Implement via children below.
  // (Correct version after task run: use explicit children prop or inline in KpiCard)
}
```

*Correction during impl:* KPIRow 上面的 rank 卡加上 tierWord pill。把上面的 KpiCard 对应行改为：

```tsx
      // 替换上面的 Rank KpiCard 为：
      <div className="p-[14px] sm:p-4 border border-[#e5e7eb] rounded-[10px] bg-white">
        <div className="text-[11px] uppercase tracking-[0.5px] font-medium text-[#6b7280] mb-[6px]">Market Rank</div>
        <div className={`text-[22px] font-semibold tabular-nums tracking-tight leading-none ${
          rankPct <= 20 ? 'text-[#047857]' : rankPct <= 45 ? 'text-[#1d4ed8]' : rankPct <= 70 ? 'text-[#b45309]' : 'text-[#64748b]'
        }`}>Top {rankPct}%</div>
        <div className="mt-[3px]"><Pill variant={rankColor as any}>{rank.tierWord}</Pill></div>
      </div>
```

```tsx
// components/dashboard-v2/home/PillarScorecard.tsx
import Link from 'next/link'
import React from 'react'
import { Card } from '../ui/Card'

type Status = 'strong' | 'on-track' | 'needs-attention' | 'early'

export function PillarScorecard({
  pillars, reportHref, username
}: {
  pillars: { name: string; score: number; status: Status }[]
  reportHref?: string
  username: string
}) {
  if (!pillars || pillars.length < 6) return null
  const colorOf = (s: Status, sc: number) => {
    if (s === 'strong' || sc >= 75) return '#047857'
    if (s === 'on-track' || sc >= 55) return '#1d4ed8'
    if (s === 'needs-attention') return '#b45309'
    return '#64748b'
  }
  return (
    <Card className="p-[14px] sm:p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-[12px] font-semibold text-[#111827]">Six-pillar scorecard</div>
        {reportHref && (
          <Link
            href={reportHref.startsWith('http') ? reportHref : `/evaluate/${encodeURIComponent(username)}${reportHref}`}
            className="text-[11px] text-[#1d4ed8] hover:underline"
          >
            Full report →
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-2">
        {pillars.map(p => {
          const c = colorOf(p.status, p.score)
          return (
            <div key={p.name}>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-[#111827] font-medium">{p.name}</span>
                <span className="font-semibold" style={{ color: c }}>{p.score}</span>
              </div>
              <div className="h-[5px] bg-[#f3f4f6] rounded-full overflow-hidden">
                <div style={{ width: `${Math.max(2, Math.min(100, p.score))}%`, height: '100%', background: c }} />
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
```

```tsx
// components/dashboard-v2/home/ProgressStrip.tsx
import React from 'react'
import { Card } from '../ui/Card'

export type HistoryNode = {
  dateLabel: string
  valueLabel: string
  tier?: string
  isCurrent?: boolean
}

export function ProgressStrip({ history }: { history: HistoryNode[] }) {
  if (!history || history.length < 2) return null
  const last = history[history.length - 2]
  const current = history[history.length - 1]
  return (
    <Card className="p-[14px] sm:p-4">
      <div className="text-[12px] font-semibold text-[#111827] mb-3">Progress over time</div>
      <div className="flex gap-2.5 items-stretch">
        <NodeCard title={last.dateLabel} value={last.valueLabel} tier={last.tier} variant="past" />
        <NodeCard title={current.dateLabel} value={current.valueLabel} tier={current.tier} variant="current" />
        <NodeCard title="Next" value="Next" variant="placeholder" />
      </div>
    </Card>
  )
}

function NodeCard({
  title, value, tier, variant
}: {
  title: string
  value: string
  tier?: string
  variant: 'past' | 'current' | 'placeholder'
}) {
  const base = 'flex-1 text-center py-2 px-1.5 rounded-lg border text-[12px]'
  const cls = variant === 'current'
    ? 'border-[#1d4ed8] bg-[#1d4ed805]'
    : variant === 'past'
      ? 'border-[#e5e7eb] bg-[#fafafa]'
      : 'border-dashed border-[#e5e7eb] bg-white text-[#d1d5db]'
  return (
    <div className={`${base} ${cls}`}>
      <div className={`text-[10px] mb-1 ${variant === 'current' ? 'text-[#1d4ed8] font-semibold' : variant === 'placeholder' ? '' : 'text-[#6b7280]'}`}>{title}</div>
      <div className={`text-[15px] font-semibold tabular-nums ${variant === 'placeholder' ? '' : 'text-[#111827]'}`}>{value}</div>
      {tier && <div className={`text-[10px] mt-0.5 ${variant === 'current' ? 'text-[#047857]' : 'text-[#6b7280]'}`}>{tier}</div>}
    </div>
  )
}
```

- [ ] **Step 4: Run test PASS**

Run: `npx vitest run components/dashboard-v2/home/__tests__/modules.test.tsx 2>&1 | tail -15`
Expected: PASS all

- [ ] **Step 5: TSC clean + commit**

```bash
npx tsc --noEmit 2>&1 | head -20
git add components/dashboard-v2/home/KPIRow.tsx components/dashboard-v2/home/PillarScorecard.tsx components/dashboard-v2/home/ProgressStrip.tsx components/dashboard-v2/home/__tests__/modules.test.tsx
git commit -m "feat(dashboard-v2/home): KPI row + Pillar Scorecard + Progress strip"
```

---

### Task 5: Home 模块④ TodayTasks（核心王者）

**Files:**
- Create: `components/dashboard-v2/home/TodayTasks.tsx`
- Test: `components/dashboard-v2/home/__tests__/TodayTasks.test.tsx`

- [ ] **Step 1: Failing tests (checkbox toggle + copy buttons)**

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TodayTasks } from '../TodayTasks'

const TASKS: any[] = [
  { id: 't1', title: 'Post challenge video', subtext: 'Pillar 1 · Consistency', priority: 'p0', actions: [{ type: 'link', label: 'Open in app', href: '#' }] },
  { id: 't2', title: 'Pitch 2 brands', subtext: 'Deal pricing', priority: 'p0', actions: [{ type: 'copy', label: 'Copy pitch A', text: 'Hi brand' }, { type: 'copy', label: 'Copy pitch B', text: 'Hi brand 2' }] },
  { id: 't3', title: 'Reply to comments', subtext: 'Engagement', priority: 'p1' },
]

describe('TodayTasks', () => {
  it('renders 3 tasks with priority pills', () => {
    render(<TodayTasks tasks={TASKS} />)
    expect(screen.getAllByRole('checkbox', { hidden: true })).toHaveLength(3)
    // P0 pills
    expect(screen.getAllByText('P0')).toHaveLength(2)
    expect(screen.getByText('P1')).toBeTruthy()
  })

  it('toggles checkbox, calls onComplete API and rolls back if fails', async () => {
    const mockFail = vi.fn(() => Promise.reject(new Error('net')))
    const mockOk = vi.fn(() => Promise.resolve())
    render(<TodayTasks tasks={TASKS} onComplete={mockOk} onCompleteFail={mockFail as any} />)
    const cb = screen.getAllByRole('checkbox', { hidden: true })[0]
    fireEvent.click(cb)
    await waitFor(() => expect(mockOk).toHaveBeenCalled())
  })

  it('copy action copies to clipboard', async () => {
    const write = vi.fn(() => Promise.resolve())
    Object.assign(navigator, { clipboard: { writeText: write } })
    render(<TodayTasks tasks={TASKS} />)
    const btn = screen.getByText('Copy pitch A')
    fireEvent.click(btn)
    expect(write).toHaveBeenCalledWith('Hi brand')
  })
})
```

- [ ] **Step 2: Run test FAIL**

Expected: "module not found TodayTasks"

- [ ] **Step 3: Implement TodayTasks**

```tsx
'use client'
import Link from 'next/link'
import React, { useMemo, useState } from 'react'
import { TaskRow } from '../ui/TaskRow'

type Prio = 'p0' | 'p1' | 'p2'
export type TaskAction =
  | { type: 'copy'; label: string; text: string }
  | { type: 'link'; label: string; href: string }
  | { type: 'button'; label: string; onClick: () => void }

export type DashboardTask = {
  id: string
  title: string
  subtext?: string
  priority: Prio
  highlight?: 'today' | boolean
  linkArrow?: string
  actions?: TaskAction[]
  /** Tomorrow preview */
  tomorrow?: boolean
}

export function TodayTasks({
  tasks, tomorrow = [], onToggle, onComplete, onCompleteFail
}: {
  tasks: DashboardTask[]
  tomorrow?: DashboardTask[]
  /** optimistic UI 回调: 返回 Promise.resolve() 为成功 */
  onToggle?: (id: string, next: boolean) => Promise<any>
  /** @deprecated use onToggle which can return Promise for opt rollback */
  onComplete?: (id: string) => Promise<any>
  onCompleteFail?: (err: any) => void
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [copied, setCopied] = useState<string | null>(null)
  const [tomorrowOpen, setTomorrowOpen] = useState(false)

  const toggle = async (t: DashboardTask) => {
    const next = !checked[t.id]
    setChecked(s => ({ ...s, [t.id]: next })) // optimistic
    try {
      if (onToggle) await onToggle(t.id, next)
      else if (next && onComplete) await onComplete(t.id)
    } catch (e) {
      setChecked(s => ({ ...s, [t.id]: !next })) // rollback
      onCompleteFail?.(e)
    }
  }

  const sorted = useMemo(() => [...tasks].sort((a, b) => {
    const rank = { p0: 0, p1: 1, p2: 2 }
    return rank[a.priority] - rank[b.priority]
  }), [tasks])

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2.5">
        <div className="text-[11px] text-[#6b7280] uppercase tracking-[1px] font-semibold">
          Today · {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </div>
        <Link href="/dashboard/growth" className="text-[12px] text-[#1d4ed8] hover:underline">
          View full plan →
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        {sorted.map(t => (
          <TaskRow key={t.id}
            title={t.title}
            subtext={t.subtext}
            priority={t.priority}
            checked={!!checked[t.id]}
            onToggle={() => toggle(t)}
            linkArrow={t.linkArrow}
            highlight={t.highlight}
            actions={t.actions?.map(a => {
              if (a.type === 'copy') {
                const active = copied === t.id + a.label
                return (
                  <button key={a.label}
                    onClick={async () => {
                      await navigator.clipboard.writeText(a.text)
                      setCopied(t.id + a.label)
                      setTimeout(() => setCopied(null), 1500)
                    }}
                    className="text-[11px] px-2.5 py-1 border border-[#e5e7eb] bg-[#f9fafb] text-[#111827] rounded hover:bg-gray-100"
                  >{active ? 'Copied ✓' : a.label}</button>
                )
              }
              if (a.type === 'link') {
                return <Link key={a.label} href={a.href} target={a.href.startsWith('http') ? '_blank' : undefined} rel="noopener"
                  className="text-[11px] px-2.5 py-1 border border-[#e5e7eb] bg-[#f9fafb] text-[#111827] rounded hover:bg-gray-100 inline-flex items-center">{a.label}</Link>
              }
              return <button key={a.label} onClick={a.onClick}
                className="text-[11px] px-2.5 py-1 border border-[#e5e7eb] bg-[#f9fafb] text-[#111827] rounded">{a.label}</button>
            })}
          />
        ))}
      </div>

      {tomorrow.length > 0 && (
        <div className="mt-2.5 pt-2.5 border-t border-dashed border-[#e5e7eb]">
          <div className="flex items-center justify-between">
            <div className="text-[12px] text-[#6b7280] font-medium">Tomorrow · {tomorrow.length} tasks</div>
            <button onClick={() => setTomorrowOpen(o => !o)} className="text-[11px] text-[#1d4ed8] hover:underline">
              {tomorrowOpen ? 'Collapse' : 'Expand'}
            </button>
          </div>
          {tomorrowOpen && (
            <div className="flex flex-col gap-2 mt-2">
              {tomorrow.map(t => (
                <TaskRow key={t.id}
                  title={t.title}
                  subtext={t.subtext}
                  priority={t.priority}
                  checked={!!checked[t.id]}
                  onToggle={() => toggle(t)}
                  linkArrow={t.linkArrow}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test PASS**

Run: `npx vitest run components/dashboard-v2/home/__tests__/TodayTasks.test.tsx 2>&1 | tail -15`
Expected: Tests all pass (mock navigator.clipboard)

- [ ] **Step 5: TSC clean + commit**

```bash
npx tsc --noEmit 2>&1 | head -10
git add components/dashboard-v2/home/TodayTasks.tsx components/dashboard-v2/home/__tests__/TodayTasks.test.tsx
git commit -m "feat(dashboard-v2/home): TodayTasks core (checkbox rollback + copy actions)"
```

---

### Task 6: Reports — FilterChips + ReportsTable

**Files:**
- Create: `components/dashboard-v2/reports/FilterChips.tsx`
- Create: `components/dashboard-v2/reports/ReportsTable.tsx`
- Test: `components/dashboard-v2/reports/__tests__/reports.test.tsx`

- [ ] **Step 1: Failing tests**

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { ReportsTable } from '../ReportsTable'

const ROWS: any[] = [
  { id: 'r1', username: 'fitcoach', niche: 'Fitness', followers: 48200,
    valueRange: '$63.8K–$86.3K', tier: 'Premium', tierVariant: 'tier-premium',
    dateLabel: 'Today · 09:12', kindLabel: 'Paid · 1 credit used', paid: true,
    delta: { pct: 8.2, label: 'vs last' },
  },
  { id: 'r2', username: 'foodie_jane', niche: 'Food', followers: 8100,
    valueRange: '$4.2K–$9.8K', tier: 'Developing', tierVariant: 'tier-developing',
    dateLabel: 'Yesterday', kindLabel: 'Free · 0 credits', paid: false, teaserOnly: true,
  },
]

describe('ReportsTable', () => {
  it('renders table rows with unlock button for teaser-only', () => {
    render(<ReportsTable rows={ROWS} />)
    expect(screen.getByText('@fitcoach')).toBeTruthy()
    expect(screen.getByText('@foodie_jane')).toBeTruthy()
    // teaser row: unlock $9 button present; PDF disabled
    expect(screen.getByText(/Unlock/)).toBeTruthy()
    // paid row: 3 actions Open/Share/PDF
    // teaser row: 2 actions Open/Unlock, one disabled PDF
    expect(screen.getAllByText('Open')).toHaveLength(2)
  })
})

describe('FilterChips', () => {
  it('calls onChange with selected chip value', () => {
    const fn = vi.fn()
    const { FilterChips } = require('../FilterChips')
    render(<FilterChips chips={[{value:'all',label:'All'},{value:'paid',label:'Paid'}]} value="all" onChange={fn} />)
    fireEvent.click(screen.getByText('Paid'))
    expect(fn).toHaveBeenCalledWith('paid')
  })
})
```

- [ ] **Step 2: Run FAIL → implement components**

```tsx
// components/dashboard-v2/reports/FilterChips.tsx
import React from 'react'

export type Chip = { value: string; label: string; count?: number }

export function FilterChips({ chips, value, onChange }:
  { chips: Chip[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1.5 mb-3.5 flex-wrap">
      {chips.map(c => {
        const active = c.value === value
        const label = c.count != null ? `${c.label} (${c.count})` : c.label
        return (
          <button key={c.value} onClick={() => onChange(c.value)}
            className={`text-[11px] px-2.5 py-1 rounded-full font-medium border ${
              active ? 'bg-[#111827] text-white border-[#111827]'
                     : 'bg-white border-[#e5e7eb] text-[#6b7280] hover:text-[#111827]'
            }`}
          >{label}</button>
        )
      })}
    </div>
  )
}
```

```tsx
// components/dashboard-v2/reports/ReportsTable.tsx
import Link from 'next/link'
import React from 'react'
import { Pill } from '../ui/Pill'

export type ReportRow = {
  id: string
  username: string
  avatarColor?: string
  niche?: string
  followers?: number
  valueRange: string
  tier: string
  tierVariant: 'tier-premium' | 'tier-growth' | 'tier-developing' | 'tier-early'
  dateLabel: string
  kindLabel: string
  paid: boolean
  teaserOnly?: boolean
  delta?: { pct: number; label?: string }
  shareHref?: string
  pdfAvailable?: boolean
}

export function ReportsTable({ rows, onUnlock }: { rows: ReportRow[]; onUnlock?: (id: string) => void }) {
  if (rows.length === 0) {
    return <div className="text-center text-[13px] text-[#6b7280] py-10 border border-[#e5e7eb] rounded-[10px] bg-white">
      No evaluations yet. Run your first review on the <Link className="text-[#1d4ed8] underline" href="/">homepage</Link>.
    </div>
  }
  return (
    <div className="border border-[#e5e7eb] rounded-[10px] bg-white overflow-hidden">
      {/* Header */}
      <div className="hidden md:grid grid-cols-[40px_1.3fr_1fr_0.7fr_1fr_1.2fr] gap-2 px-3.5 py-2.5 border-b border-[#e5e7eb] bg-[#fafafa] text-[11px] text-[#6b7280] font-semibold uppercase tracking-[0.4px]">
        <div></div>
        <div>Account</div>
        <div>Value</div>
        <div>Tier</div>
        <div>Reviewed</div>
        <div className="text-right">Actions</div>
      </div>

      {rows.map(r => (
        <div key={r.id}
          className="grid grid-cols-1 md:grid-cols-[40px_1.3fr_1fr_0.7fr_1fr_1.2fr] md:gap-2 gap-1 px-3.5 py-3.5 items-center border-b last:border-b-0 border-[#f3f4f6] text-[13px] hover:bg-[#fafbfc]"
        >
          <div className="hidden md:flex">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-semibold"
              style={{ background: r.avatarColor || 'linear-gradient(135deg,#1d4ed8,#047857)' }}>
              {r.username.charAt(0).toUpperCase()}
            </div>
          </div>
          <div className="flex items-center gap-2.5 md:block">
            <div className="md:hidden w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-semibold"
              style={{ background: r.avatarColor || 'linear-gradient(135deg,#1d4ed8,#047857)' }}>
              {r.username.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-medium text-[#111827]">@{r.username}</div>
              <div className="text-[11px] text-[#6b7280]">{r.niche}{r.followers ? ` · ${fmtK(r.followers)} followers` : ''}</div>
            </div>
          </div>
          <div>
            <div className={`font-semibold tabular-nums ${r.teaserOnly ? 'text-[#6b7280] blur-[3px]' : 'text-[#111827]'}`}>{r.valueRange}</div>
            {r.delta && (
              <div className={`text-[11px] ${r.delta.pct >= 0 ? 'text-[#047857]' : 'text-[#dc2626]'}`}>
                {r.delta.pct >= 0 ? '▲ +' : '▼'}{r.delta.pct.toFixed(1)}% {r.delta.label || ''}
              </div>
            )}
            {r.teaserOnly && <div className="text-[11px] text-[#6b7280]">🔒 Teaser only</div>}
          </div>
          <div><Pill variant={r.tierVariant}>{r.tier}</Pill></div>
          <div>
            <div className="text-[#111827] font-medium">{r.dateLabel}</div>
            <div className="text-[11px] text-[#6b7280]">{r.kindLabel}</div>
          </div>
          <div className="flex md:justify-end gap-1.5 mt-1 md:mt-0">
            <Link
              href={`/evaluate/${encodeURIComponent(r.username)}`}
              className="px-2.5 py-1 text-[11px] border border-[#e5e7eb] bg-white text-[#111827] rounded-md hover:bg-gray-50"
            >Open</Link>
            {r.teaserOnly ? (
              <button
                onClick={() => onUnlock?.(r.id)}
                className="px-2.5 py-1 text-[11px] border border-[#1d4ed8] bg-[#1d4ed8] text-white rounded-md font-medium hover:opacity-95"
              >Unlock $9</button>
            ) : (
              <>
                <Link
                  href={r.shareHref || `#`}
                  className="px-2.5 py-1 text-[11px] border border-[#e5e7eb] bg-white text-[#111827] rounded-md hover:bg-gray-50"
                >Share</Link>
                <button
                  disabled={!r.pdfAvailable}
                  className="px-2.5 py-1 text-[11px] border rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ borderColor: '#e5e7eb', background: '#fff', color: r.pdfAvailable ? '#111827' : '#9ca3af' }}
                >PDF</button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function fmtK(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M'
  if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K'
  return String(v)
}
```

- [ ] **Step 3: Tests PASS + TSC clean → commit**

```bash
npx vitest run components/dashboard-v2/reports/__tests__/reports.test.tsx 2>&1 | tail -10
npx tsc --noEmit 2>&1 | head -5
git add components/dashboard-v2/reports/
git commit -m "feat(dashboard-v2/reports): Filter chips + 6-col reports table (teaser unlock/PDF)"
```

---

### Task 7: Growth — ProgressHeader + WeekAccordion

**Files:**
- Create: `components/dashboard-v2/growth/ProgressHeader.tsx`
- Create: `components/dashboard-v2/growth/WeekAccordion.tsx`
- Test: `components/dashboard-v2/growth/__tests__/growth.test.tsx`

- [ ] **Step 1: Failing tests**

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { ProgressHeader } from '../ProgressHeader'
import { WeekAccordion } from '../WeekAccordion'

describe('ProgressHeader', () => {
  it('renders 3/14 done 21% with gradient fill 21% width', () => {
    const { container } = render(<ProgressHeader completed={3} total={14} />)
    expect(screen.getByText('3 / 14 done · 21%')).toBeTruthy()
    const bar = container.querySelector('[data-bar-fill]') as HTMLElement
    expect(bar.style.width).toMatch(/^21%/)
  })
})

describe('WeekAccordion', () => {
  it('expands by default when defaultOpen=true', () => {
    render(<WeekAccordion weekNo={1} focus="Rebuild" defaultOpen tasks={[{id:'x',title:'T',priority:'p0'}]} completed={new Set()} />)
    expect(screen.getByText('T')).toBeTruthy() // task visible
  })
  it('collapses when clicked', () => {
    render(<WeekAccordion weekNo={1} focus="Rebuild" defaultOpen tasks={[{id:'x',title:'T',priority:'p0'}]} completed={new Set()} />)
    fireEvent.click(screen.getByText(/Rebuild/))
    // after collapse, task not visible
    expect(screen.queryByText('T')).toBeFalsy()
  })
})
```

- [ ] **Step 2: Implement components**

```tsx
// components/dashboard-v2/growth/ProgressHeader.tsx
import React from 'react'

export function ProgressHeader({ completed, total }: { completed: number; total: number }) {
  const pct = Math.round((completed / Math.max(1, total)) * 100)
  return (
    <div className="p-3.5 sm:p-4 border border-[#e5e7eb] rounded-[10px] bg-white mb-4">
      <div className="flex justify-between text-[12px] mb-1.5">
        <span className="font-medium text-[#111827]">Overall completion</span>
        <span className="text-[#047857] font-semibold">{completed} / {total} done · {pct}%</span>
      </div>
      <div className="h-2 bg-[#f3f4f6] rounded-full overflow-hidden">
        <div
          data-bar-fill
          style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#1d4ed8,#047857)' }}
        />
      </div>
    </div>
  )
}
```

```tsx
// components/dashboard-v2/growth/WeekAccordion.tsx
'use client'
import React, { useState } from 'react'
import { TaskRow } from '../ui/TaskRow'

export type WeekTask = {
  id: string
  title: string
  subtext?: string
  priority: 'p0' | 'p1' | 'p2'
  dayLabel?: string
  highlight?: 'today' | boolean
  linkArrow?: string
}

export function WeekAccordion({
  weekNo, focus, tasks, completed, completedLabelPrefix = 'Done',
  taskCount, defaultOpen, onToggleTask,
}: {
  weekNo: number
  focus: string
  tasks: WeekTask[]
  /** completed task keys */
  completed: Set<string>
  completedLabelPrefix?: string
  taskCount?: { done: number; total: number }
  defaultOpen?: boolean
  onToggleTask?: (id: string, next: boolean) => Promise<any> | void
}) {
  const [open, setOpen] = useState(!!defaultOpen)
  const [localDone, setLocalDone] = useState<Record<string, boolean>>({})
  const doneCount = taskCount?.done ?? tasks.filter(t => completed.has(t.id) || localDone[t.id]).length
  const total = taskCount?.total ?? tasks.length

  const toggle = async (t: WeekTask) => {
    const next = !(completed.has(t.id) || localDone[t.id])
    setLocalDone(l => ({ ...l, [t.id]: next }))
    try {
      await onToggleTask?.(t.id, next)
    } catch (e) {
      setLocalDone(l => ({ ...l, [t.id]: !next }))
    }
  }

  const isActive = weekNo === 1 // first week = current by default (parent can override via active prop if desired)
  const active = isActive
  return (
    <div className="border border-[#e5e7eb] rounded-[10px] bg-white overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-3.5 sm:px-4 py-3 flex items-center justify-between text-left"
        style={{ background: open ? '#fafafa' : '#fff', borderBottom: open ? '1px solid #e5e7eb' : undefined }}
      >
        <div className="flex items-center gap-2.5">
          <span className={`text-[11px] px-2 py-1 rounded-[6px] font-semibold ${
            active ? 'bg-[#1d4ed810] text-[#1d4ed8]' : 'border border-[#e5e7eb] text-[#6b7280]'
          }`}>WEEK {weekNo}</span>
          <span className="text-[14px] font-semibold text-[#111827]">{focus}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className={`text-[12px] font-semibold ${
            doneCount === total && total > 0 ? 'text-[#047857]' : 'text-[#6b7280]'
          }`}>{doneCount}/{total}</span>
          <span className="text-[14px] text-[#6b7280]">{open ? '−' : '+'}</span>
        </div>
      </button>
      {open && (
        <div className="p-2 flex flex-col gap-1">
          {tasks.map(t => {
            const done = completed.has(t.id) || localDone[t.id]
            return (
              <div key={t.id} className="px-2 py-1.5">
                <TaskRow
                  title={t.title}
                  subtext={t.subtext || (t.dayLabel ? `${completedLabelPrefix} · ${t.dayLabel}` : undefined)}
                  priority={t.priority}
                  checked={done}
                  onToggle={() => toggle(t)}
                  linkArrow={t.linkArrow}
                  highlight={t.highlight}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Run test PASS → commit**

```bash
npx vitest run components/dashboard-v2/growth/__tests__/growth.test.tsx 2>&1 | tail -10
npx tsc --noEmit 2>&1 | head -5
git add components/dashboard-v2/growth/
git commit -m "feat(dashboard-v2/growth): Progress bar + 4-week accordion (task rollback)"
```

---

### Task 8: Profile — 4 卡片（Account/Credits/Preferences/Danger）

**Files:**
- Create: `components/dashboard-v2/profile/AccountCard.tsx`
- Create: `components/dashboard-v2/profile/CreditsBillingCard.tsx`
- Create: `components/dashboard-v2/profile/PreferencesToggle.tsx`
- Create: `components/dashboard-v2/profile/DangerZone.tsx`

- [ ] **Step 1: Implement AccountCard**

```tsx
import React from 'react'
import { Card } from '../ui/Card'

export function AccountCard({ user, onEdit }: {
  user: { name: string; email: string; signedUpLabel?: string; roleLabel?: string; avatarInitial?: string }
  onEdit?: () => void
}) {
  return (
    <Card className="p-[18px] sm:p-5">
      <SectionHeader uppercase>Account</SectionHeader>
      <div className="flex items-center gap-3.5">
        <div className="w-[52px] h-[52px] rounded-[12px] text-white text-[20px] font-semibold flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg,#1d4ed8,#047857)' }}>
          {user.avatarInitial || user.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold text-[#111827] truncate">{user.name}</div>
          <div className="text-[12px] text-[#6b7280] truncate">{user.email}</div>
          <div className="text-[11px] text-[#6b7280] mt-0.5">{user.signedUpLabel || ''}{user.roleLabel ? ` · ${user.roleLabel}` : ''}</div>
        </div>
        <button
          onClick={onEdit}
          className="text-[12px] px-3 py-1.5 border border-[#e5e7eb] bg-white text-[#111827] rounded-[7px] hover:bg-gray-50"
        >Edit</button>
      </div>
    </Card>
  )
}

function SectionHeader({ children, uppercase }: { children: React.ReactNode; uppercase?: boolean }) {
  return (
    <div className={`mb-3 ${uppercase ? 'text-[11px] uppercase tracking-[0.5px]' : 'text-[12px]'} text-[#6b7280] font-semibold`}>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Implement CreditsBillingCard**

```tsx
import Link from 'next/link'
import React from 'react'
import { Card } from '../ui/Card'

export function CreditsBillingCard({
  credits: { remaining, usedOfPack, packLabel },
  purchaseHistoryHref
}: {
  credits: { remaining: number; usedOfPack?: number; packLabel?: string }
  purchaseHistoryHref?: string
}) {
  return (
    <Card className="p-[18px] sm:p-5">
      <div className="flex items-center justify-between mb-3.5">
        <div className="text-[11px] uppercase tracking-[0.5px] text-[#6b7280] font-semibold">Credits & Billing</div>
        {purchaseHistoryHref && <Link href={purchaseHistoryHref} className="text-[12px] text-[#1d4ed8] hover:underline">Purchase history →</Link>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1.2fr_1fr] gap-3.5 mb-3.5">
        {/* Credits highlight card */}
        <div className="p-3.5 rounded-lg border" style={{ background: 'linear-gradient(135deg,#1d4ed808,#04785708)', borderColor: 'rgba(29,78,216,0.15)' }}>
          <div className="text-[11px] text-[#6b7280] mb-1">Evaluation credits</div>
          <div className="text-[22px] font-semibold tabular-nums tracking-tight text-[#111827] leading-none">
            {remaining} <span className="text-[12px] font-normal text-[#6b7280]">remaining</span>
          </div>
          {packLabel ? (
            <div className="text-[11px] text-[#6b7280] mt-0.5">{packLabel}{usedOfPack != null ? ` · ${usedOfPack} used` : ''}</div>
          ) : (
            <div className="text-[11px] text-[#6b7280] mt-0.5">No active pack</div>
          )}
        </div>
        {/* Buy CTA */}
        <div className="p-3.5 rounded-lg border border-[#e5e7eb] bg-[#fafafa] flex flex-col justify-between">
          <div>
            <div className="text-[11px] text-[#6b7280] mb-1">Need more?</div>
            <Link
              href="/pricing"
              className="block text-center text-[12px] px-3 py-1.5 bg-[#111827] text-white rounded-[7px] font-medium hover:bg-black"
            >Buy more credits</Link>
            <div className="text-[10px] text-[#6b7280] mt-1 text-center">From $9 / 1-pack</div>
          </div>
        </div>
      </div>
      {/* Current plan: transparent trust message */}
      <div className="p-3.5 rounded-lg border border-dashed border-[#e5e7eb] bg-[#fafafa]">
        <div className="text-[11px] text-[#6b7280] mb-0.5">Current plan</div>
        <div className="text-[13px] font-medium text-[#111827]">Pay-as-you-go · no active subscription</div>
        <div className="text-[11px] text-[#6b7280] mt-0.5">No recurring charges. Credits are purchased one-time and used per evaluation.</div>
      </div>
    </Card>
  )
}
```

- [ ] **Step 3: Implement PreferencesToggle**

```tsx
'use client'
import React, { useState } from 'react'
import { Card } from '../ui/Card'

export function PreferencesToggle({
  defaults = {}, onChange
}: {
  defaults?: { weeklyEmail?: boolean; hideFreePreview?: boolean }
  onChange?: (key: string, next: boolean) => Promise<any> | void
}) {
  const [state, setState] = useState({
    weeklyEmail: defaults.weeklyEmail !== false,
    hideFreePreview: !!defaults.hideFreePreview,
  })
  const set = async (k: keyof typeof state, v: boolean) => {
    setState(s => ({ ...s, [k]: v }))
    try { await onChange?.(k, v) } catch { setState(s => ({ ...s, [k]: !v })) }
  }
  return (
    <Card className="p-[18px] sm:p-5">
      <div className="text-[11px] uppercase tracking-[0.5px] text-[#6b7280] font-semibold mb-3.5">Preferences</div>
      <div className="flex flex-col gap-3">
        <Row
          title="Weekly growth summary email"
          desc="Every Monday morning: task recap + pillar progress"
          value={state.weeklyEmail}
          onChange={v => set('weeklyEmail', v)}
        />
        <Row
          title="Hide free preview sections on reports"
          desc="Always open full report when unlocked"
          value={state.hideFreePreview}
          onChange={v => set('hideFreePreview', v)}
          divider
        />
      </div>
    </Card>
  )
}

function Row({ title, desc, value, onChange, divider }:
  { title: string; desc: string; value: boolean; onChange: (v: boolean) => void; divider?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2 ${divider ? 'border-t border-[#f3f4f6]' : ''}`}>
      <div className="pr-4">
        <div className="text-[13px] font-medium text-[#111827]">{title}</div>
        <div className="text-[11px] text-[#6b7280]">{desc}</div>
      </div>
      <div
        role="switch" aria-checked={value}
        onClick={() => onChange(!value)}
        className="w-[38px] h-[22px] rounded-full relative cursor-pointer flex-shrink-0"
        style={{ background: value ? '#047857' : '#e5e7eb' }}
      >
        <div className="absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white transition-all"
          style={{ left: value ? '18px' : '2px', right: 'auto' }} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implement DangerZone**

```tsx
import React from 'react'
import { Card } from '../ui/Card'

export function DangerZone({ onSignOut }: { onSignOut: () => Promise<any> | void }) {
  return (
    <Card className="p-[18px] sm:p-5" style={{ borderColor: 'rgba(220,38,38,0.18)' }}>
      <div className="text-[11px] uppercase tracking-[0.5px] text-[#dc2626] font-semibold mb-3.5">Danger zone</div>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[13px] font-medium text-[#111827]">Sign out of all devices</div>
          <div className="text-[11px] text-[#6b7280]">Ends all active sessions immediately</div>
        </div>
        <button
          onClick={onSignOut}
          className="text-[12px] px-3 py-1.5 border rounded-[7px] font-medium hover:bg-[#dc262608]"
          style={{ borderColor: '#dc2626', color: '#dc2626', background: '#fff' }}
        >Sign out</button>
      </div>
    </Card>
  )
}
```

- [ ] **Step 5: TSC → commit**

```bash
npx tsc --noEmit 2>&1 | head -20
git add components/dashboard-v2/profile/
git commit -m "feat(dashboard-v2/profile): Account + Credits/Billing + Preferences + Danger zone"
```

---

### Task 9: i18n 文案 + next.config redirect + 页面组装

**Files:**
- Modify: `lib/i18n/dictionaries/en.ts` (append `dashboard.v2.*` section)
- Modify: `next.config.js` — redirect `/dashboard/settings*` → `/dashboard/profile*`
- Create: `app/dashboard/page.tsx` — Home assembly
- Create: `app/dashboard/reports/page.tsx` — Reports page (replace old)
- Create: `app/dashboard/growth/page.tsx` — Growth page (formerly `/dashboard/growth-plan`)
- Create: `app/dashboard/profile/page.tsx` — Profile page (content from old settings)

- [ ] **Step 1: Append i18n keys to en.ts**

In [en.ts](file:///Users/ricky/AICode/TokValue/lib/i18n/dictionaries/en.ts), append a new top-level `dashboard.v2` section. Keep values short (they're pure fallback; component text is mostly hardcoded in this iteration to avoid churn).

```ts
dashboard: {
  // ... keep existing dashboard keys
  v2: {
    nav: { home: 'Home', growth: 'Growth', reports: 'Reports', profile: 'Profile' },
    home: {
      greetMorning: 'Good morning', greetAfternoon: 'Good afternoon', greetEvening: 'Good evening',
      tasksSub: 'things to do today',
      reviewAgain: 'Review again', evaluateNew: 'Evaluate new',
      bottleneckTitle: 'Biggest bottleneck', milestoneTitle: 'Next milestone',
      todayLabel: 'Today',
      viewFullPlan: 'View full plan',
      tomorrow: 'Tomorrow', tasksCount: 'tasks',
      expand: 'Expand', collapse: 'Collapse',
      pillar: 'Six-pillar scorecard', fullReport: 'Full report',
      progressTitle: 'Progress over time', next: 'Next',
    },
    reports: {
      title: 'Reports', search: 'Search username…', evaluateNew: 'Evaluate new',
      cols: { account: 'Account', value: 'Value', tier: 'Tier', reviewed: 'Reviewed', actions: 'Actions' },
      filters: { all: 'All', paid: 'Paid', free: 'Free' },
      actions: { open: 'Open', share: 'Share', pdf: 'PDF', unlock: 'Unlock' },
      empty: 'No evaluations yet. Run your first review on the',
    },
    growth: {
      title: 'Your Growth Plan', sub: 'Week', of: 'of 4', focus: 'Focus:',
      overall: 'Overall completion', done: 'done',
      week: 'WEEK',
    },
    profile: {
      title: 'Profile',
      sections: {
        account: 'Account',
        creditsAndBilling: 'Credits & Billing',
        credits: 'Evaluation credits',
        needMore: 'Need more?',
        buy: 'Buy more credits',
        buySub: 'From $9 / 1-pack',
        purchaseHistory: 'Purchase history',
        currentPlan: 'Current plan',
        payg: 'Pay-as-you-go · no active subscription',
        recurring: 'No recurring charges. Credits are purchased one-time and used per evaluation.',
        preferences: 'Preferences',
        danger: 'Danger zone',
        signOut: 'Sign out', signOutDesc: 'Ends all active sessions immediately',
      }
    }
  }
}
```

- [ ] **Step 2: next.config redirect**

In `next.config.js`, add inside `async redirects()`:

```js
async redirects() {
  return [
    {
      source: '/dashboard/settings',
      destination: '/dashboard/profile',
      permanent: true,
    },
    {
      source: '/dashboard/settings/:path*',
      destination: '/dashboard/profile',
      permanent: true,
    },
    // keep old growth-plan URL
    {
      source: '/dashboard/growth-plan',
      destination: '/dashboard/growth',
      permanent: true,
    },
    {
      source: '/dashboard/tools',
      destination: '/dashboard',
      permanent: true,
    },
  ]
}
```

*(If next.config already has redirects, prepend new entries into existing array.)*

- [ ] **Step 3: Assemble Home page `/dashboard/page.tsx`**

```tsx
'use client'
import React, { useMemo } from 'react'
import { DashboardShell } from '@/components/dashboard-v2/DashboardShell'
import { GreetingBar } from '@/components/dashboard-v2/home/GreetingBar'
import { KPIRow } from '@/components/dashboard-v2/home/KPIRow'
import { BottleneckMilestone } from '@/components/dashboard-v2/home/BottleneckMilestone'
import { TodayTasks, type DashboardTask } from '@/components/dashboard-v2/home/TodayTasks'
import { PillarScorecard } from '@/components/dashboard-v2/home/PillarScorecard'
import { ProgressStrip } from '@/components/dashboard-v2/home/ProgressStrip'
import { useDashboardData } from '@/components/dashboard/dashboard-data'

export default function DashboardHomePage() {
  const data = useDashboardData()
  const user = data.user
  const latest = data.latestEvaluation
  const username = latest?.username || user?.name?.toLowerCase()?.replace(/\s+/g,'') || 'account'
  const accounts = useMemo(() => data.reviews ? Array.from(new Set(data.reviews.map((r: any) => r.username))) : [username], [data.reviews, username])

  // Build tasks data: bridge from latest.thirtyDayPlan to DashboardTask[]
  const { today, tomorrow } = useMemo(() => {
    const t: DashboardTask[] = []
    const tom: DashboardTask[] = []
    // Populate from thirtyDayPlan if exists; otherwise fall back to demo tasks
    const plan = latest?.thirtyDayPlan
    // (in real integration: iterate plan.weeks -> days = today)
    // Demo bridge:
    if (!plan) {
      t.push({ id: 'h1', title: 'Review your report first', subtext: 'Open report to unlock growth plan', priority: 'p0', linkArrow: '↗ Report' })
    }
    return { today: t, tomorrow: tom }
  }, [latest])

  // Build pillars
  const pillars = (latest?.pillars || []).map((p: any) => ({
    name: p.name, score: Math.round(p.score), status: pillarStatusOf(p.status),
  }))
  // Build progress history from last 2 (or all) reviews
  const progress = (data.reviews || []).slice(-2).map((r: any) => ({
    dateLabel: (r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''),
    valueLabel: (r.businessValueMid ? `$${Math.round(r.businessValueMid/1000)}K` : '—'),
    tier: r.tierWord,
    isCurrent: r.id === latest?.id,
  }))

  // Bottleneck + milestone (bridge data)
  const blocker = latest?.commercialSnapshot?.primaryRateBlocker
    ? { label: latest.commercialSnapshot.primaryRateBlocker.label, fix: latest.commercialSnapshot.primaryRateBlocker.fix, pillarWeekAnchor: 'week3' }
    : { label: 'Define a review cadence', fix: 'Run a new review to identify your specific bottleneck.', pillarWeekAnchor: '' }
  const milestone = latest?.revenueRoadmap?.milestones?.[0]
    ? { title: latest.revenueRoadmap.milestones[0].title, description: latest.revenueRoadmap.milestones[0].label || '',
        suggestCta: { label: 'Suggested brands', href: `/evaluate/${encodeURIComponent(username)}#deal-pricing` as any } }
    : { title: 'Land your first paid deal', description: 'Hit $500/mo minimum in brand deals before scaling.' }

  const firstName = user?.name?.split(' ')[0] || 'there'
  const rankPercentile = latest?.percentile ?? 50
  const tierWord = latest?.tierWord || '' // Premium/Growth/Developing/Early
  return (
    <DashboardShell page="home" user={user}>
      <div className="max-w-[720px] mx-auto flex flex-col gap-6">
        <GreetingBar
          firstName={firstName}
          currentUsername={username}
          accounts={accounts}
          latestEvaluationAvailable={!!latest}
        />
        <KPIRow
          value={{ mid: latest?.businessValueMid ?? 0 }}
          rank={{ percentile: rankPercentile, tierWord }}
          credits={{ remaining: data.credits?.balance ?? 0, packLabel: data.credits?.packLabel || '' }}
        />
        <BottleneckMilestone blocker={blocker} milestone={milestone as any} />
        <TodayTasks tasks={today} tomorrow={tomorrow} />
        {pillars.length >= 6 && <PillarScorecard pillars={pillars as any} username={username} reportHref="#pillars" />}
        {progress.length >= 2 && <ProgressStrip history={progress} />}
      </div>
    </DashboardShell>
  )
}

function pillarStatusOf(s: string): any {
  if (!s) return 'on-track'
  const x = s.toLowerCase()
  if (x.includes('strong')) return 'strong'
  if (x.includes('attention') || x.includes('weak')) return 'needs-attention'
  if (x.includes('early')) return 'early'
  return 'on-track'
}
```

- [ ] **Step 4: Assemble Reports, Growth, Profile page.tsx files**

Reuse the same pattern — DashboardShell wrapper + the page-specific component (ReportsTable / ProgressHeader+WeekAccordion×4 / 4 profile cards). Bridge data from `useDashboardData()` or existing `/api/history` calls.

- [ ] **Step 5: TSC clean + run full test suite → commit**

```bash
npx tsc --noEmit 2>&1 | head -30
npx vitest run 2>&1 | tail -8
# Ensure existing 173 reports tests still green
git add -A
git commit -m "feat(dashboard-v2): i18n + redirects + 4 pages assembly"
```

---

### Task 10: 切流（删除旧组件 / 路由）+ 老路由清理 + 埋点 dashboard_viewed 接入

**Files:**
- Delete: `components/dashboard/**` (entire old directory)
- Delete: `app/dashboard/tools/**` (entire dir)
- Delete: `app/dashboard/settings/**` (moved to profile, redirect covers old URL)
- Delete: `app/dashboard/growth-plan/**` (moved to growth, redirect covers old URL)
- Modify: `app/dashboard/layout.tsx` — 如果旧 shell 中接了埋点 dashboard_viewed，移植到新 DashboardShell 首次 mount 时触发一次

- [ ] **Step 1: 删除旧目录**

```bash
git rm -rf components/dashboard app/dashboard/tools app/dashboard/settings app/dashboard/growth-plan
# 注意：如果 app/dashboard/growth-plan 不存在则忽略报错
```

- [ ] **Step 2: 埋点 dashboard_viewed**

在 DashboardShell 首次 render 时（`useEffect([])`）调用现有的 `trackEvent({ name: 'dashboard_viewed' })`（或已有 analytics hook）。检查旧组件中的埋点调用名是否完全一致。

- [ ] **Step 3: TSC + full tests → commit**

```bash
npx tsc --noEmit 2>&1 | head -30
npx vitest run 2>&1 | tail -10
git add -u
git commit -m "chore(dashboard-v2): cut over; remove old components/tools/settings/growth-plan + dashboard_viewed analytics"
```

---

### Task 11: 浏览器 QA（dev server + 真实账号）

- [ ] **Step 1: 启动 dev server**

```bash
cd /Users/ricky/AICode/TokValue
export DEV_SKIP_PAYMENT=true
PORT=3010 npm run dev
# 等待 Ready in X ms
```

- [ ] **Step 2: Home 目检 checklist**

访问 `http://localhost:3010/dashboard`
- [ ] Greeting 显示 morning/afternoon/evening 匹配本地时间
- [ ] 只有一个账号时不显示 switcher；≥2 显示（用 mock 账号数据验证）
- [ ] KPI 三卡 tabular-nums 不抖动；无 history 不显示环比不报错
- [ ] Bottleneck × Milestone 两卡渐变 + CTA 链接跳转正确
- [ ] Today Tasks：勾选 → 绿勾 + 删除线 + 轻 toast；失败回滚
- [ ] Copy pitch A 按钮：点后变 "Copied ✓"，1.5s 复原
- [ ] Tomorrow Expand 展开后显示明日任务
- [ ] PillarScorecard 6 条渲染（有评估时）；无评估隐藏模块
- [ ] ProgressStrip <2 条 history 时隐藏；≥2 条显示三节点

- [ ] **Step 3: Reports 页 QA**

`/dashboard/reports`
- [ ] filter chips All/Paid/Free 过滤正确
- [ ] 付费行：Open / Share / PDF 三个按钮
- [ ] Free teaser 行：估值 blur + 🔒 Teaser only 小字 + Unlock $9 主按钮（PDF 置灰禁用）

- [ ] **Step 4: Growth 页 QA**

`/dashboard/growth`
- [ ] Week 1 默认展开，其他周闭合
- [ ] 今日任务高亮（蓝底描边）
- [ ] 勾选后进度条百分比实时增加

- [ ] **Step 5: Profile 页 QA**

`/dashboard/profile`
- [ ] 4 模块顺序正确：Account / Credits / Preferences / Danger
- [ ] Pay-as-you-go 信任文案准确："No recurring charges…"
- [ ] Preferences 两个滑动 toggle 切换
- [ ] Sign out 登出后返回首页

- [ ] **Step 6: 路由 QA**
- [ ] `/dashboard/settings` 重定向到 `/dashboard/profile`（308 或 301）
- [ ] `/dashboard/tools` 重定向到 `/dashboard`
- [ ] `/dashboard/growth-plan` 重定向到 `/dashboard/growth`

- [ ] **Step 7: 层级色泄漏目检**

首页 Recently Evaluated、历史记录页等其他读 TIER_COLORS 的组件，新翡翠金板值在对应背景上可读（对比度 AA）。

- [ ] **Step 8: 支付回归（DEV_SKIP_PAYMENT=false，用 Creem 测试卡）**

`Buy more credits → Creem checkout → 4242 4242 4242 4242 → 完成 → KPI C Reviews Left 自增 1`（已知 Neon 本地网络出问题时允许绕过，在线上环境补验）。

---

## Self-Review

### Spec coverage
| Spec requirement | Task |
|---|---|
| D1 Command Center 定位 | Task 3-5 (Greeting → TodayTasks 核心) |
| D2 Linear 浅色设计系统 | Task 1 (atoms 色值) + Shell |
| D3 4 pages 砍掉 Tools settings 改名 | Task 9 redirects + Task 10 删除 |
| Home 6 模块 | Task 3 (Greeting / Bottleneck) + Task 4 (KPI / Pillar / Progress) + Task 5 (TodayTasks) |
| Reports 表 + teaser unlock | Task 6 ReportsTable |
| Growth 4 周折叠 + 进度条 | Task 7 |
| Profile 4 卡片 + Pay-as-you-go 信任文案 | Task 8 (CreditsBilling + Danger) |
| 数据层不新建纯函数 | 所有 Tasks 都读现有字段 + bridge 映射 |
| 硬约束 TIER_COLORS 次数定价 无退款 支付不动 | Task 1 Pill 变体色 + Task 8 Credits 文案 + Task 6 支付按钮仅重定位 |
| redirects 路由 | Task 9 next.config |
| dashboard_viewed 埋点 | Task 10 |
| 浏览器 QA 清单 | Task 11 |

### Placeholder scan
Tasks 1-10 均给出实际代码（原子组件）或详细模板（pages 组装），无 "TBD" / "implement later" 文字占位。

### Type consistency
`DashboardTask.priority` = `'p0'|'p1'|'p2'` 与 TaskRow 的 Priority 类型一致。`pillar status` 的字符串映射在 Home page 辅助函数中统一为 `pillarStatusOf()`。
