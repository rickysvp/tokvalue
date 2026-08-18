# Report Performance and Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce evaluation report initial JavaScript by at least 35% while making free-to-paid report progression clearer and data-safe.

**Architecture:** `EvaluatePage` becomes an orchestration shell. Overview and each paid tab live in focused report components loaded on demand; free users see a single static, outcome-oriented preview per locked tab and never receive paid data.

**Tech Stack:** Next.js dynamic imports, React, TypeScript, Recharts, html2canvas, jsPDF, Vitest, Playwright or equivalent browser smoke tests.

---

### Task 1: Establish baseline and report component contracts

**Files:**
- Create: `components/report/types.ts`
- Create: report component contract tests
- Reference: `components/EvaluatePage.tsx`

- [ ] **Step 1: Record baseline** production build route size for `/evaluate/[username]` and save the exact output in the PR description or a non-product verification note.
- [ ] **Step 2: Write failing type/component tests** proving Overview accepts only free-safe fields and locked previews cannot receive an `Evaluation` object or paid module data.
- [ ] **Step 3: Define** explicit `FreeReportData` and `PaidReportData` props derived from existing `Evaluation`, without changing API response schemas.
- [ ] **Step 4: Run** focused tests; expect pass after type contract implementation.
- [ ] **Step 5: Commit** `refactor: define report rendering contracts`.

### Task 2: Extract the Overview report

**Files:**
- Create: `components/report/OverviewReport.tsx`
- Create: `components/report/OverviewReport.test.tsx`
- Modify: `components/EvaluatePage.tsx:600-900` approximately

- [ ] **Step 1: Write failing tests** for free-safe diagnostic content, one immediately actionable recommendation, risk/score visibility, and no paid-module rendering.
- [ ] **Step 2: Run** focused tests; expect failure.
- [ ] **Step 3: Move** current overview rendering into `OverviewReport`; make strengths/weaknesses/audience compact or collapsible while preserving semantics and accessibility.
- [ ] **Step 4: Dynamically import** `RadarChart` inside Overview with a fixed-dimension loading placeholder.
- [ ] **Step 5: Run** focused tests; expect pass.
- [ ] **Step 6: Commit** `refactor: isolate free-safe overview report`.

### Task 3: Replace repeated locked sections with one preview

**Files:**
- Create: `components/report/LockedTabPreview.tsx`
- Create: `components/report/LockedTabPreview.test.tsx`
- Modify: `components/EvaluatePage.tsx` locked Growth/Revenue/Commerce branches
- Modify: `components/{FreeBanner,UnlockFooter}.tsx`

- [ ] **Step 1: Write failing tests** for exactly one preview and CTA per locked tab, expected outcome labels, no real paid data, and no duplicate mobile fixed CTA.
- [ ] **Step 2: Run** focused tests; expect failure.
- [ ] **Step 3: Implement** static tab configuration for Growth, Revenue, and Commerce; remove multi-`LockedSection` branches from `EvaluatePage`.
- [ ] **Step 4: Update** banner/footer copy to name the unlocked outcomes and one-time $9 purchase.
- [ ] **Step 5: Run** focused tests; expect pass.
- [ ] **Step 6: Commit** `feat: clarify locked report outcomes`.

### Task 4: Extract and dynamically load paid tabs

**Files:**
- Create: `components/report/{GrowthReport,RevenueReport,CommerceReport,ReportTabSkeleton}.tsx`
- Create: tests for the three report components and skeleton
- Modify: `components/EvaluatePage.tsx`

- [ ] **Step 1: Write failing tests** verifying free users never mount paid components; paid users receive the correct tab component and a loading skeleton during first import.
- [ ] **Step 2: Run** focused tests; expect failure.
- [ ] **Step 3: Move** existing paid sections into their matching components and dynamically import them with `next/dynamic` and stable fallback dimensions.
- [ ] **Step 4: Ensure** unlock from an active locked tab swaps to the paid module after enrichment without layout jump.
- [ ] **Step 5: Run** focused tests; expect pass.
- [ ] **Step 6: Commit** `perf: lazy load paid report tabs`.

### Task 5: Defer export and sharing dependencies

**Files:**
- Modify: `components/EvaluatePage.tsx` imports and export handlers
- Modify: `lib/export-pdf.tsx` only if required for lazy boundary
- Create: export lazy-loading tests

- [ ] **Step 1: Write failing tests** that assert export and share-card modules are absent from initial module load and are requested only after user intent.
- [ ] **Step 2: Run** focused tests; expect failure.
- [ ] **Step 3: Replace** top-level html2canvas/PDF/share modal imports with `import()` or `next/dynamic`; retain loading and error toasts.
- [ ] **Step 4: Gate** export until a paid report and its required modules are loaded.
- [ ] **Step 5: Run** focused tests; expect pass.
- [ ] **Step 6: Commit** `perf: defer export and sharing code`.

### Task 6: Add metrics and browser performance checks

**Files:**
- Modify: `components/EvaluatePage.tsx`
- Create: browser smoke/performance test file

- [ ] **Step 1: Write failing assertions** for `report_overview_ready`, `locked_tab_view`, `locked_tab_unlock_click`, `report_tab_loaded`, and `report_export_start` payloads.
- [ ] **Step 2: Implement** events through existing `trackEvent`, with only tab, tier, free flag, and duration metadata.
- [ ] **Step 3: Add browser test** that free initial load does not request paid tab chunks; clicking a paid tab does.
- [ ] **Step 4: Run** `npm test`, browser tests, and `npm run build`; capture final route size and verify >=35% First Load JS reduction.
- [ ] **Step 5: Manually verify** slow-network overview, mobile sticky CTA behavior, free data boundary, paid-tab rendering, PNG/PDF export and share flows.
- [ ] **Step 6: Commit** `test: verify report performance and conversion flow`.
