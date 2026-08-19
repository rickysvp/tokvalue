# B7 合规、召回、埋点、对账 实施计划（三工作流并行）

**Goal:** 合规出镜微调 + Review 完成邮件/Day-10 召回 + Spec §15 埋点对齐 + credits/usage_events 每日对账告警 + `REVIEW_STATE_MACHINE` flag 移除（状态机唯一路径）。

**现状结论（侦查 2026-08-19）:**
- ✅ 已达标：ToS 禁倒卖/禁自动化采集（app/terms/page.tsx L50-59）；估值页免责声明（CommercialSnapshotTab VALUATION_DISCLAIMER + ValuationMethodology）；SiteFooter 底栏 "Data sourced from public third-party APIs" + TikTok 商标声明；usage_events 表（B1）；Resend 基础设施（send-code/contact 在用）
- ⚠️ 微调：`lib/tiktok.ts` L449 `interface ProviderAdapter` 未导出、未用 Spec 命名 `TikTokProviderAdapter`；dashboard 路由无页脚数据来源声明
- ❌ 缺失：Review 完成邮件、Day-10 召回、埋点事件大量缺位、每日对账+告警、vercel.json cron、flag 移除

**工作流拆分（文件集互不相交）:**

## Phase 0（主控预置，派发前完成）
1. `lib/email.ts`：Resend 封装（`sendEmail({to,subject,html})`，RESEND_API_KEY 未配置时 log-skip）+ `sendReviewCompletedEmail(email, username)` + `sendRecallEmail(email, username)` + `sendAdminAlert(subject, detail)`。纯英文模板（产品单语言），复用 send-code 的 fetch 模式
2. `lib/tiktok.ts`：导出 adapter 接口（`export type TikTokProviderAdapter = ProviderAdapter` 或重命名导出）
3. `app/dashboard/layout.tsx`：底部加数据来源声明行（同 SiteFooter 文案）
4. 新建 `lib/analytics.ts` 的 EventType 扩展留给 WS-C（主控不动）

## WS-A：evaluate route 状态机唯一化 + 服务端埋点（最高风险，单独文件域）
**Files:** Modify `app/api/evaluate/route.ts`（唯一主文件）；Read `lib/reviews.ts`
- 移除 `reviewStateMachineEnabled()`（L30-33）与所有 flag 分支（L143 注释、L201 幂等+锁条件、L551 旧返还路径）——状态机路径成为唯一路径；旧行为代码删除
- 服务端埋点（recordEventFromRequest / recordEvent，fire-and-forget 不阻塞）：
  - `cache_hit`：24h 快照命中分支（metadata: username, free/paid）
  - `second_review_started`：attachBaseline 发现 previous 时（metadata: username）
- Review 完成邮件钩子：付费评估成功保存后 `sendReviewCompletedEmail(userEmail, normalized)`（fire-and-forget，catch 内不影响主流程；免费评估不发——免费无邮箱或未付费，按 isFreeMode 判断）
- 回归：dev 环境（dev token）真实付费评估全流程 + 免费评估流程；`npx tsc --noEmit`
- ⚠️ 仔细读全文再动：理解 credits 预扣/返还/幂等语义，删除的是"旧路径"而非状态机路径

## WS-B：召回 + 对账 + cron（每日任务域）
**Files:** Create `lib/recall.ts`、`lib/reconcile.ts`、`app/api/cron/recall/route.ts`、`app/api/cron/reconcile/route.ts`、`lib/recall.test.ts`
- `lib/recall.ts`：`runRecall()`——扫描 usage_events 中 `review_completed` 恰好落在 [NOW-11d, NOW-10d) 窗口的 (email, username)；排除该 email 其后又有 review_completed（已回访）；排除 `recall_log` 已发（30 天内同 email 只发一次）；逐个 `sendRecallEmail`（Email: "Your value may have changed" + CTA 链 `/evaluate/{username}`）。`recall_log(email PK, sent_at)` 幂等表
- `lib/reconcile.ts`：`runReconcile(runDate)`——①逐 email：credit_balances.credits vs（total_purchased + granted − consumed + refunded − admin_deducted）（credit_usage_logs 聚合，公式对齐 analytics.ts checkCreditConsistency L899）；②昨日 usage_events.quota_consumed 计数 vs credit_usage_logs 昨日 consume 计数（口径差告警）。结果写 `reconcile_results(run_date DATE PK, ok BOOLEAN, detail JSONB)`；不一致 → `sendAdminAlert`（ADMIN_EMAIL env，未配置则 console.error）且 ok=false
- 两个 cron 路由：`export const dynamic='force-dynamic'`；鉴权 `Authorization: Bearer ${CRON_SECRET}`（未配置 CRON_SECRET 时放行 + console.warn，方便 dev 手动触发）；返回 `{ok, stats}` JSON
- `lib/recall.test.ts`：窗口边界/幂等/回访排除纯逻辑测试（把筛选逻辑抽成纯函数 `selectRecallCandidates(events, now)` 便于测试）
- 不建 vercel.json（主控集成阶段统一写）；不改 lib/email.ts（Phase 0 已就绪，直接 import）

## WS-C：埋点全量（Spec §15 对齐，客户端域）
**Files:** Modify `lib/analytics.ts`（EventType 联合类型）、`app/api/track/route.ts`（白名单）、`components/EvaluatePage.tsx`、`app/dashboard/layout.tsx`?否——dashboard 埋点放各 page、`app/dashboard/growth-plan/page.tsx`、`components/dashboard/GrowthTaskCard.tsx`、`app/dashboard/reports/page.tsx`、首页 pricing 区（`components/` 下 PricingSection 类组件）
- 事件对齐表（本批实施）：

| Spec 事件 | 实现点 | 层 |
|---|---|---|
| email_verified | verify-code 成功（客户端拿 token 后） | 客户端 |
| tiktok_username_submitted | 评估表单提交时 | 客户端 |
| dashboard_viewed | /dashboard page 挂载 | 客户端 |
| growth_plan_viewed | /dashboard/growth-plan 挂载 | 客户端 |
| growth_task_viewed | GrowthTaskCard 展开 | 客户端 |
| growth_task_completed | complete API 200 后 | 客户端 |
| report_viewed | EvaluatePage 结果渲染时（仅一次/会话） | 客户端 |
| report_downloaded | PDF 下载点击（EvaluatePage + Reports 页） | 客户端 |
| report_shared | share 创建成功回调（Reports 页/ShareModal） | 客户端 |
| pricing_viewed | 首页 pricing 区挂载 | 客户端 |

- B8 域暂缓（计划注明）：subscription_* / discount_code_applied / portal_visited / payment_failed / one_time_checkout_started（沿用现有服务端 checkout_start）/ creator_profile_*（功能未建）
- 语义等价沿用（计划注明）：account_found→evaluate_done(username)；free_review_completed→free_evaluate；free_review_failed→api_error；full_unlocked→unlock_completed；signup_completed→email_verified（同点不双发）；review_*/quota_*→usage_events 已有（B1）
- track 白名单同步扩展全部新事件名；客户端统一走现有 trackEvent 模式（fetch /api/track + sendBeacon 兜底）；`paywall_viewed` 确认 metadata 含 mode 属性（缺则补）
- 不改 evaluate route / cron / email（A、B 域）；不改 en.ts（字面英文）

## Phase E：主控集成
- `vercel.json`：`{"crons":[{"path":"/api/cron/reconcile","schedule":"0 2 * * *"},{"path":"/api/cron/recall","schedule":"30 2 * * *"}]}`
- 验证：tsc 0 错 / vitest 全绿 / `npm run build` / 浏览器回归（@demo 无回归 + dashboard 各页埋点 Network 里 /api/track 请求可见 + 手动 curl cron 路由各跑一次）
- `docs/TokValue-Batches.md` B7 验收勾选 + 实施记录；分批 commit（A/B/C/集成 各一）

**验收标准对照（Batches 文档）:**
- 每个页面页脚含数据来源声明；估值页含免责声明 → Phase 0 + 现有已达标项核查
- 对账任务连续 7 天零差异 → reconcile_results 表落库机制就绪（7 天观察属上线后事项，文档注明）
- 两封邮件触发正确 → Review 完成邮件（评估成功触发）+ Day-10 召回（cron 窗口/幂等/回访排除）
- flag 移除后全流程回归通过 → WS-A 回归 + 集成阶段浏览器/构建回归
