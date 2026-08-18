# User Session Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move ordinary user authentication from localStorage Bearer JWTs to httpOnly cookies protected by a shared CSRF guard.

**Architecture:** `lib/auth.ts` owns all user-cookie issue/read/clear operations; `lib/csrf.ts` validates authenticated write requests. API routes use a single authenticated-user helper, while client code relies on same-origin cookies and 401 responses rather than reading tokens.

**Tech Stack:** Next.js App Router, jose, React, TypeScript, Vitest.

---

### Task 1: Add cookie session helpers

**Files:**
- Modify: `lib/auth.ts:291-317`
- Create: `lib/auth.test.ts`

- [ ] **Step 1: Write failing tests** for valid cookie session, invalid/expired cookie, production cookie flags, clear-cookie flags, and rejection of a valid Bearer token without a cookie.
- [ ] **Step 2: Run** `npx vitest run lib/auth.test.ts`; expect failure.
- [ ] **Step 3: Implement** `USER_SESSION_COOKIE`, `userSessionCookieOptions`, `getSessionTokenFromRequest`, `getAuthenticatedUser`, `setUserSession`, and `clearUserSession`; retain JWT signing/verification internals.
- [ ] **Step 4: Run** focused tests; expect pass.
- [ ] **Step 5: Commit** `feat: add httpOnly user session cookies`.

### Task 2: Add centralized CSRF validation

**Files:**
- Create: `lib/csrf.ts`
- Create: `lib/csrf.test.ts`

- [ ] **Step 1: Write failing tests** for same-origin Origin acceptance, cross-origin rejection, missing Origin with same-site Fetch Metadata acceptance, and missing/foreign metadata rejection.
- [ ] **Step 2: Run** `npx vitest run lib/csrf.test.ts`; expect failure.
- [ ] **Step 3: Implement** `assertSameOrigin(req)` and its standard 403 `CSRF_REJECTED` response.
- [ ] **Step 4: Run** focused tests; expect pass.
- [ ] **Step 5: Commit** `feat: add authenticated request CSRF guard`.

### Task 3: Convert session issuance and logout

**Files:**
- Modify: `app/api/auth/verify-code/route.ts`
- Modify: `app/api/credits/claim/route.ts`
- Create: `app/api/auth/logout/route.ts`
- Create: tests for the three routes

- [ ] **Step 1: Write failing tests** asserting verification and guest claim set the Cookie and never serialize `token`; assert logout clears it and rejects cross-origin requests.
- [ ] **Step 2: Run** focused tests; expect failure.
- [ ] **Step 3: Set Cookie** on successful responses via `setUserSession`; implement logout with CSRF and `clearUserSession`.
- [ ] **Step 4: Run** focused tests; expect pass.
- [ ] **Step 5: Commit** `feat: issue and clear user sessions by cookie`.

### Task 4: Migrate protected routes and write guards

**Files:**
- Modify: `app/api/credits/{balance,consume,claim}/route.ts`
- Modify: `app/api/{history,evaluate,checkout,share,referral}/route.ts`
- Modify: `app/api/evaluate/upgrade/route.ts`
- Modify: `app/api/referral/withdraw/route.ts`
- Modify: `middleware.ts`
- Create: route authorization/CSRF tests

- [ ] **Step 1: Write failing tests** for Cookie-authenticated access, no-cookie 401, Bearer-only rejection, and cross-origin state-changing request rejection without changing credits/shares/withdrawals.
- [ ] **Step 2: Run** focused tests; expect failure.
- [ ] **Step 3: Replace** each `getBearerToken`/`verifySessionToken` path with `getAuthenticatedUser`; call `assertSameOrigin` before authenticated mutations; leave anonymous rate-limited and webhook routes outside this guard.
- [ ] **Step 4: Remove** the middleware Bearer-header pseudo-protection.
- [ ] **Step 5: Run** focused tests; expect pass.
- [ ] **Step 6: Commit** `refactor: authenticate user APIs with cookies`.

### Task 5: Remove browser token handling

**Files:**
- Modify: `lib/credits-client.ts`
- Modify: `components/{HomePageClient,EvaluatePage,VerifyEmailModal,PaidWall,ShareModal,ShareCardModal,SiteHeader}.tsx`
- Modify: `app/{history,referral}/page.tsx`
- Create: client API helper/component tests

- [ ] **Step 1: Write failing tests** showing browser requests omit Authorization, use same-origin credentials, treat 401 as signed out, and logout requests `/api/auth/logout`.
- [ ] **Step 2: Run** focused tests; expect failure.
- [ ] **Step 3: Remove** token get/set/promotion helpers and all Bearer header creation; preserve `activeEmail` only as non-auth UI state; on startup delete old token keys without reading values.
- [ ] **Step 4: Run** focused tests; expect pass.
- [ ] **Step 5: Commit** `refactor: remove browser bearer token flow`.

### Task 6: End-to-end security verification

**Files:**
- Create: browser or route integration tests under the project’s chosen test directory

- [ ] **Step 1: Add tests** for verify → refresh → balance, logout → 401, cross-site mutation → 403, and guest claim → Cookie session.
- [ ] **Step 2: Run** focused tests, then `npm test`; expect pass.
- [ ] **Step 3: Run** `npm run build`; expect pass and no auth-related type/lint regressions.
- [ ] **Step 4: Manually inspect** browser storage: token absent from Local/Session Storage and visible only as HttpOnly Cookie.
- [ ] **Step 5: Commit** `test: verify cookie session security`.
