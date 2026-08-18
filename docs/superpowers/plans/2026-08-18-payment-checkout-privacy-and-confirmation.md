# Payment Checkout Privacy and Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove email PII from payment return URLs while preserving email-based credit ownership and providing reliable payment-confirmation feedback.

**Architecture:** A small client-only pending-checkout record stores the normalized ownership email in sessionStorage before the browser leaves for Creem. A shared return hook consumes `?paid=success`, calls the existing idempotent claim API with that email, and exposes a bounded confirmation state to both report and home pages.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest, existing Creem and `credits-server` integration.

---

### Task 1: Add pending checkout storage helper

**Files:**
- Modify: `lib/credits-client.ts`
- Create: `lib/credits-client.test.ts`

- [ ] **Step 1: Write failing tests** for email normalization, 24-hour expiry deletion, explicit clearing, and no-op behavior outside a browser.
- [ ] **Step 2: Run** `npx vitest run lib/credits-client.test.ts`; expect failure because pending checkout helpers do not exist.
- [ ] **Step 3: Implement** `setPendingCheckout(email)`, `getPendingCheckout()`, and `clearPendingCheckout()` around a `tokvalue_pending_checkout_v1` sessionStorage record containing only `email` and `createdAt`.
- [ ] **Step 4: Run** the same Vitest command; expect pass.
- [ ] **Step 5: Commit** `test: cover pending checkout storage`.

### Task 2: Remove email from Creem return URLs

**Files:**
- Modify: `app/api/checkout/route.ts:102-113`
- Modify: `app/api/auth/verify-code/route.ts:117-128`
- Create: `app/api/checkout/route.test.ts`
- Create: `app/api/auth/verify-code/route.test.ts`

- [ ] **Step 1: Write failing route tests** that mock Creem and assert `success_url` equals `${APP_URL}/?paid=success` and has no `email` query parameter.
- [ ] **Step 2: Run** the two focused tests; expect failure under the old URL format.
- [ ] **Step 3: Change** both Creem request payloads to use only `?paid=success`; leave customer and server-side metadata email intact.
- [ ] **Step 4: Run** focused tests; expect pass.
- [ ] **Step 5: Commit** `fix: remove email from payment return URLs`.

### Task 3: Store ownership email before every checkout redirect

**Files:**
- Modify: `components/HomePageClient.tsx:112-162`
- Modify: `components/PaidWall.tsx:70-115`
- Modify: `components/VerifyEmailModal.tsx:240-290`
- Create: component tests adjacent to the modified components or in `components/payment-checkout.test.tsx`

- [ ] **Step 1: Write failing tests** covering authenticated checkout, guest checkout, and verified-code checkout; each must call `setPendingCheckout(normalizedEmail)` immediately before setting `window.location.href`.
- [ ] **Step 2: Run** focused tests; expect failure.
- [ ] **Step 3: Implement** the storage call in every redirect branch and add the permanent-email-ownership notice beside checkout email input.
- [ ] **Step 4: Run** focused tests; expect pass.
- [ ] **Step 5: Commit** `feat: retain checkout email for private payment return`.

### Task 4: Build one payment-return state hook

**Files:**
- Create: `components/usePaymentReturn.ts`
- Create: `components/usePaymentReturn.test.tsx`
- Modify: `lib/credits-client.ts`

- [ ] **Step 1: Write failing hook tests** for no query flag, successful claim, `PAYMENT_NOT_COMPLETED` retry, network failure, absent pending checkout, retry cap, URL cleanup, and pending cleanup only after success.
- [ ] **Step 2: Run** `npx vitest run components/usePaymentReturn.test.tsx`; expect failure.
- [ ] **Step 3: Implement** a hook with `idle | confirming | credited | pending | unavailable | failed` states, 3-second retry interval, 10-attempt cap, `history.replaceState` cleanup, and a callback carrying the updated balance.
- [ ] **Step 4: Run** focused tests; expect pass.
- [ ] **Step 5: Commit** `feat: add bounded payment confirmation state`.

### Task 5: Replace duplicated return handling UI

**Files:**
- Modify: `components/HomePageClient.tsx:55-87`
- Modify: `components/EvaluatePage.tsx:431-466`
- Create: `components/PaymentConfirmationNotice.tsx`
- Create: `components/PaymentConfirmationNotice.test.tsx`

- [ ] **Step 1: Write failing UI tests** for confirming, credited, pending, unavailable, and failed text; ensure the credited email is masked.
- [ ] **Step 2: Run** focused tests; expect failure.
- [ ] **Step 3: Replace** page-local `paid=email` parsing with `usePaymentReturn`; display the shared notice and update balance only from the hook result.
- [ ] **Step 4: Run** focused tests; expect pass.
- [ ] **Step 5: Commit** `refactor: unify payment return feedback`.

### Task 6: Verify idempotency and production behavior

**Files:**
- Test: `app/api/credits/claim/route.test.ts`
- Test: `app/api/stripe/webhook/route.test.ts`

- [ ] **Step 1: Add failing integration tests** showing parallel webhook and claim calls for one checkout yield one credit grant, while an unpaid checkout yields none.
- [ ] **Step 2: Run** focused tests; expect failure or missing coverage.
- [ ] **Step 3: Add only test seams/mocks necessary** to invoke the existing idempotency behavior; do not change ownership policy.
- [ ] **Step 4: Run** `npm test` and `npm run build`; expect all passing.
- [ ] **Step 5: Manually verify** paid return URL has no PII, normal return credits the entered email, and cleared sessionStorage displays the non-recovery guidance.
- [ ] **Step 6: Commit** `test: verify payment return idempotency`.
