# Referral P0 本地验收 — 发现并修复 2 个真实缺陷

日期：2026-08-18
状态：本地验收通过，未推送（用户要求验收后再推）

## 验收结论

P2 推荐佣金 P0 闭环本地验收通过：
- tsc 零错误
- 59/59 测试通过
- 生产 build 成功（`/referral` 4.99 kB，Middleware 34.3 kB）
- `/referral` 页面 UI 正常渲染，数据正确（settled $51.20 + pending $15.20 = totalEarned $66.40，voided $3.60 正确排除在已赚之外）
- 浏览器零 JS 错误

## 验收过程中发现并修复的 2 个真实缺陷

### 缺陷 1：CSP 头在 dev 环境破坏 React Refresh（HMR）

**现象**：`/referral` 页面在 dev 下永远卡在「Loading your referral data...」，但 curl `/api/referral` 返回 200。

**根因**：之前的安全修复（commit e41879d）加了 CSP 头 `script-src 'self' 'unsafe-inline'`（刻意去掉 `unsafe-eval`）。Next.js 开发模式的 React Refresh（HMR）依赖 `eval` 求值字符串，CSP 禁止 `unsafe-eval` 后 hydration 崩溃，页面停在 loading 态。生产 build 无 HMR 故不受影响，但 dev 无法验收。

**修复**（`next.config.mjs`）：`isDev = NODE_ENV === 'development'`，dev 环境跳过 CSP 头，生产才加严格 CSP。其余安全头（X-Frame-Options / nosniff / Referrer-Policy / Permissions-Policy）dev 仍保留。

### 缺陷 2：lib/referral.ts 建表与业务查询缺 Neon 连接抖动重试

**现象**：Neon 无服务器连接偶发 ECONNRESET 时，`/api/referral` 返回 500「Failed to load referral data」，且进程内永久 500。

**根因**：`lib/db.ts` 的 `initStore` 有「冷启动重试 3 次 + 失败清除缓存」逻辑，但新写的 `lib/referral.ts` 两处缺失：
1. `initTable` 建表一次失败就 throw，且 `initPromise` 缓存不重置（dev server 首次建表遇网络抖动后，rejected promise 被永久缓存，之后所有请求直接 throw）
2. 业务查询（`getOrCreateReferralCode` / `resolveReferralCode` / `createCommission` / `voidCommission*` / `settleDueCommissions` / `getCommissionOverview` 的聚合查询）无重试

**修复**（`lib/referral.ts`）：
1. `initTable` 加重试 3 次（每次失败重置 `sql = null`，退避 500ms 递增），失败后 `initPromise.catch(() => initPromise = null)` 清除缓存
2. 新增 `withRetry<T>()` 通用包装（重试 3 次，退避 400ms 递增），与 `db.ts` 对齐；全部业务查询包裹

## 当前工作区未提交改动（全部为本地验收，未推送）

- 新增：`lib/referral.ts`、`app/api/referral/route.ts`、`app/referral/layout.tsx`、`app/referral/page.tsx`
- 修改：`app/api/stripe/webhook/route.ts`（佣金写入 + refund/dispute 撤销）、`lib/utm.ts`（采集 `?ref=`）、`components/UserMenu.tsx`（Referral 入口）、`lib/i18n/dictionaries/en.ts`（referral 词典域）、`next.config.mjs`（CSP dev 跳过）
- 定稿文档：`docs/referral-commission-design-2026-08-18.md`、`docs/task-referral-design-finalized-2026-08-18.md`、`docs/task-referral-p0-implementation-2026-08-18.md`、`docs/nav-refactor-2026-08-18.md`（前一轮）

## 遗留待办（二期，不在本次验收范围）

- USDC 提现（referral_payouts 表 + BSC 地址校验 `/^0x[a-fA-F0-9]{40}$/` + 首次 $50 / 后续 $100 门槛）
- 复核 webhook refund 分支 `refundCurrency !== 'USD'` 是否误拒欧元退款（Creem 官方示例 refund_currency 为 EUR）
