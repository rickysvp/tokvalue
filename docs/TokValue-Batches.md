# TokValue Spec v2 分批实施计划（v2 修订：支付延后）

> 依据：`docs/TokValue-Spec-v2.md`（2026-08-19 拍板版）
> **修订（2026-08-19）**：原 B4（Creem 支付闭环）整体延后为 B8，现有支付逻辑（credits 购买 + 现有升级流程）完全不动。其余批次在此基础上调整依赖。
> 原则：每批独立可交付、可验证、可上线；每批结束系统处于可运行状态；每批开工前生成该批的任务级详细计划（TDD 步骤级）。

---

## 总览：4 个里程碑 / 7 个执行批次 + 1 个延后批次

```text
M1 交易与成本地基（内部可上线）
   B1 Review 交易核心        M  ← 一切的前提（作用在现有 credits 上）
   B2 成本与防作弊闸门       S-M
M2 Teaser 商业闭环（小流量开放）
   B3 Teaser 分层+解锁门     M   ← 解锁走现有支付通道，无新支付依赖
M3 新定位完整体验（公开发布）
   B5a 报告重构:评分估值     M-L ┐ 三者可并行
   B5b Dashboard+Reports    M   │
   B6  Growth Plan 任务引擎 M   ┘
M4 收尾（全量切换）
   B7 合规/召回/埋点/对账    S-M（已精简，迁移类移入 B8）
─────────────────────────────────────────────
延后  B8 支付重做（Creem）   L   ← 时机另定，依赖 B1+B3
```

| 批次 | 改动大小 | 用户可见变化 | 依赖 |
|---|---|---|---|
| B1 | M | 无（后端加固，flag 并存） | 无 |
| B2 | S-M | 无（成本防护） | B1 |
| B3 | M | 首个可见变化：免费变 Teaser，解锁走现有支付 | B1 |
| B5a | M-L | 报告新结构 | B3 |
| B5b | M | Dashboard 新 IA | B3 |
| B6 | M | Growth Plan 页 | B3 |
| B7 | S-M | 合规出镜 + 召回邮件 | B5* |
| B8（延后） | L | 新支付体系 + 账本迁移 | B1、B3 |

---

## B1 Review 交易核心（Milestone 1）

**目标**：把「发起 Review → 扣费/释放」变成不可重复、不可竞态、可对账的交易核心。**保留现有 credits 作为额度余额**（现有支付产出的余额不动），在此之上加三段式额度语义与状态机。UI 零变化。

**改动内容**

1. 新表（`lib/db.ts` 迁移，随现有建表模式）：
   - `account_reviews`：idempotency_key、status、state_entered_at、access_level、failure_reason
   - `free_review_grants`：user_id 唯一 + normalized_username + ip_hash
   - `usage_events`：全量计量流水（reserved/consumed/released）
2. Review 状态机（`lib/review-state.ts` 新建，纯函数）：
   - requested → quota_reserved → fetching_data → data_saved → analyzing → report_generating → completed / failed
   - 各状态 TTL；惰性超时对账（超 TTL 判 failed + 返还额度）
3. 幂等与并发：
   - `UNIQUE(creator_account_id, idempotency_key)`
   - partial unique index：同一账号仅一个 in-flight review → 冲突 409
4. 额度三段式（作用于现有 credits，`lib/credits-server.ts` 扩展）：
   - `reserveCredits`（预扣）→ 成功 `confirmConsumed` / 失败 `releaseReserved`
   - 沿用单条件 UPDATE + 影响行数校验防竞态模式
5. `app/api/evaluate/route.ts` 对接（feature flag `REVIEW_STATE_MACHINE`，默认关闭时行为与旧版一致）。

**验收标准**

- [x] 同 idempotency_key 重复提交 → 返回同一 review，不重复扣费（`createOrGetReview` 幂等命中读回 + failed 行原子复活）
- [x] 模拟 RapidAPI 失败 → credits 自动返还，usage_events 有 released 记录（catch 精确返还：仅 `reviewQuotaReserved` 时 refund + `quota_released` 事件）
- [x] 并发两个发起请求 → 第二个 409 + in_flight_review_id（partial unique index `idx_account_reviews_inflight`）
- [x] 卡死状态超 TTL → 查询时自动转 failed 并返还（`isStaleReview` TTL + `GET /api/reviews/:id` 惰性 `reconcileInFlight`）
- [x] flag 关闭时现有评估流程回归通过（TSC + 单测 10/10 + dev server evaluate 200；review 路径完全旁路）

**实施状态（2026-08-19）**：Task 1–6 完成，commit `80a43c8`/`58c90be`/`32029b4`。
交付物：`lib/review-state.ts`（状态机纯函数 + 单测）、`lib/usage-events.ts`（计量流水）、`lib/reviews.ts`（幂等 + in-flight 锁 + 惰性对账）、`app/api/evaluate/route.ts` 接入（flag `REVIEW_STATE_MACHINE`，默认关闭）、`GET /api/reviews/:id`。
注：`free_review_grants` 表移入 B2（与免费三闸同批）；DB 深度路径（幂等/409/TTL 对账的端到端复验）因本机到 Neon 网络故障暂缓，待网络恢复后按计划文档 Task 6 的 curl 步骤补验。

---

## B2 成本与防作弊闸门（Milestone 1）

**目标**：三道免费闸门 + 24h 快照缓存 + 熔断，单次成本 ≤$0.10、免费获客成本 $0.02–0.05。

**改动内容**

1. 24h 全局快照缓存：`account_snapshots` 以 `platform_user_id`（sec_uid）为键，命中不调 RapidAPI；报告标注 `Data refreshed Xh ago`；缓存命中照常扣费
2. username 归一化（小写 + 去首尾空格 + 去特殊字符）→ `normalized_username` 列
3. 免费三闸：主闸 user_id 唯一（每邮箱 1 次）/ 辅闸同 normalized_username 全网免费生成 ≤1 次（缓存命中不计）/ 兜底 IP 2 次/24h（复用 `lib/rate-limit.ts` + `free_rate_limits`）
4. API 审计 + 熔断（`lib/api-governance.ts`）：调用记录（review_id/endpoint/耗时/字段缺失/成本）；日免费预算 $10 / 月 $150 触达暂停免费生成；供应商连续失败熔断切换

**验收标准**

- [x] 同一账号 24h 内第二次 Review：API 调用数 = 0（`getFreshSnapshot` 命中跳过 `fetchProfile`；集成测试验证 round-trip + TTL）
- [x] 新邮箱 + 已免费分析过的 username → 免费生成被拒，付费/缓存路径可用（`free_review_grants` 归一化辅闸，`@User.Name-x` 变体归并；集成测试验证原子消耗）
- [x] 同 IP 第 3 次免费生成 → 429（主闸 `FREE_ALLOWANCE_LIMIT` 2→1，复用现有 `free_rate_limits` IP 兜底）
- [x] 调低预算阈值 → 免费暂停、付费正常（`isFreeBudgetExceeded` 日 $10/月 $150，evaluate FREE 路径前置检查返回 503 `FREE_BUDGET_PAUSED`，付费路径不受影响）
- [x] 单次 Review 成本记录可查（admin 日志 `GET /api/tiktokmaster/logs?source=api`，含 `api_call_logs` 明细 + 日/月成本汇总）

**实施状态（2026-08-19）**：Task 1–8 完成。
交付物：`lib/username-normalize.ts`（归一化纯函数 + 单测）、`lib/api-governance.ts`（成本记账 + 预算闸 + 供应商熔断 `provider_health`）、`lib/snapshots.ts`（24h 快照 `account_snapshots`，sec_uid 主键）、`lib/free-grants.ts`（username 辅闸，fail-open）、`lib/tiktok.ts`（逐 provider 审计 + 熔断过滤 + fail-open）、`app/api/evaluate/route.ts`（PAID/FREE 双路径接线）、admin `?source=api` 日志端点、`vitest.config.ts`（`@/` 别名）。
验证：88 单测全绿 + TSC 干净 + 真实 Neon 集成测试 3/3（快照 round-trip/TTL、辅闸归一化归并+原子消耗、成本账本+预算闸；本机走 `undici EnvHttpProxyAgent` 代理连 Neon，测试为临时文件已删，复验方式见 `docs/superpowers/plans/2026-08-19-b2-cost-gates.md`）。
注：主闸邮箱唯一沿用现有 session 体系；`REVIEW_STATE_MACHINE` flag 仍默认关闭（B1 约定）。

---

## B3 Teaser 分层 + 解锁门（Milestone 2，首个用户可见）

**目标**：免费 Review 从「全量」变「Teaser」；解锁走**现有支付通道**，本批零支付改动。

**改动内容**

1. `reports` 增 `access_level: 'teaser' | 'full'`；评估管道按 Spec §3.3 产出两层数据结构
2. Teaser 可见：价值区间 + 置信度 + 层级 / 最大瓶颈一句话 / Top3 / 任务#1 标题
3. 锁定（半遮罩 + 图标 + 关键词 + 一句话，三层钩子）：估值分项 / 6 支柱数值与归因 / Bottom3 / 任务#2-3 / PDF / 分享
4. `PaidWall / PaidWallModal` 演化为统一解锁门（mode prop 保留），解锁后平滑滚动至解锁区
5. 解锁分支（`app/api/evaluate/upgrade/route.ts` 改造，走现有支付）：
   - 最近报告 access_level=teaser → 现有支付成功后消耗 credits → 该报告升为 full（零 API 成本）
   - 无 Teaser → 现有支付成功后发起一次完整 Review（消耗 credits）
6. 定价展示沿用现有套餐文案规范（评估次数表达、无退款承诺、不虚构功能）

**验收标准**

- [x] 免费报告严格符合 Teaser 边界（逐项核对 Spec §3.3）
- [x] 现有支付成功 → 同一报告升 full，无重新拉数据（upgrade 返回 `access_level: 'full'` + AI 富化补跑）
- [x] 无 Teaser 时支付 → 发起新完整 Review（`handleUnlock` 404 回退 `handleEvaluate`）
- [x] 移动端付费墙容器完整（max-h-90vh 约定，PaidWallModal 未改动沿用）
- [x] 埋点：teaser_viewed / paywall_viewed / unlock_completed（track 白名单已同步）

**实施记录（2026-08-19）**

交付物：`lib/teaser.ts`（`stripForTeaser` 裁剪纯函数 + 9 单测）、`app/api/evaluate/route.ts`（FREE→teaser / PAID→full / 免费缓存→teaser 三路接线）、`app/api/evaluate/upgrade/route.ts`（响应加 `access_level: 'full'`）、`components/report/TeaserReport.tsx`（免费钩子区 + 锁定价值栈）、`components/EvaluatePage.tsx`（snapshot tab 免费/付费分叉渲染 + 解锁流 404 回退 + 平滑滚动 + teaser_viewed 埋点）、`lib/analytics.ts` + `app/api/track/route.ts`（3 个新事件类型 + 白名单）。

集成验证（本机 dev，mrbeast 真实数据）：
- API 边界：`POST /api/evaluate` 免费返回 `access_level: 'teaser'`，`dimensions/metrics/peerBenchmark/summary/verdict/advice/priceAdvice` 全部剥离，`businessValue` 仅 `totalValue`，`posts` Top3，`commercialSnapshot` 仅 `readinessBand/dataConfidence/primaryRateBlocker` ✓
- UI：Teaser 报告完整渲染（$17.3M–$43.2M 价值区间 / Premium Value 层级 / 最大瓶颈 / Top3 视频 / 锁定价值栈 4 模块）；点击 Unlock Full Report 弹出付费墙（Single/Growth/Studio 套餐）✓
- 97 单测全绿 + TSC 干净
- 修复集成 bug：`EvaluatePage` 的 `commercial_snapshot_ready` 埋点 useEffect 直接读 `commercialSnapshot.suggestedRateRange.low`，Teaser 快照无此字段导致整页 error.tsx 崩溃——已加可选防护
- 环境注：本机网络对 Neon（直连/代理）均间歇 ECONNRESET，评估偶发 500 为网络问题非代码问题；生产 Vercel 出网不受影响

---

## B5a 报告重构：评分与估值展示（Milestone 3）

**目标**：内部 10 维引擎不动，对外换新叙事——6 支柱 + 价值层级 + 可解释估值。

**改动内容**

1. `lib/pillar.ts`：10 维 → 6 支柱映射（Growth Momentum / Content Consistency / Audience Quality / Niche Clarity / Brand Readiness / Risk Score），Niche Clarity 用 hashtag 聚类（无 LLM）
2. 层级标签 Premium / Growth / Developing / Early Value——只改 `lib/tier.ts` 展示名，`TIER_COLORS` 色值不动；历史报告旧标签不回写
3. 估值展示 v2：置信度决定区间宽度（±15/20/25/30%）+ 风险折扣显式 + 四分项拆解
4. Baseline 模式：首评隐藏变化标记 + baseline 文案 + 任务标注
5. `ReportTabs.tsx`、`DeepAnalysisSection.tsx`、`report/CommercialSnapshotTab.tsx` 对接支柱结构（旧报告 type 区分模板）

**验收标准**

- [x] 新报告 6 支柱数值 + 状态词 + 归因完整（`lib/pillar.ts` + `components/sections/PillarSection.tsx`，含 "Why this score" 展开）
- [x] 低置信度区间明显宽于高置信度（`rangeWidthForConfidence`：±15/20/25/30%；Teaser 与付费报告均按 band 重算，见 `lib/teaser.ts`）
- [x] 首评无 "since last review"，次评出现对比（`BaselineStrip`：首评 Baseline 文案；次评 Score/Value delta 徽章；`app/api/evaluate/route.ts` `attachBaseline` 查历史）
- [x] 旧历史报告渲染不回归（`pillars`/`valuationV2` 可缺省，旧报告回退雷达图 + 原区间；`normalizeEvaluation` 白名单透传 v2 字段，`report_v2` JSONB 列持久化）
- [x] 单测：pillar 映射 + 区间宽度函数（`lib/pillar.test.ts` 18 用例；全量 118/118 通过，TSC 干净）

**实施记录（2026-08-19）**

- `lib/pillar.ts`：6 支柱映射（growth=momentum / consistency=stability / audience=mean(engagement,authenticity) / niche=hashtag 聚类 top3Share+top1Share 加成 / brand=0.4 commerce+0.3 monetization+0.3 influence / risk=风险旗标加权 30/15/6）；置信度分档（videoCount+dataQuality+outlier 破坏性扣分）；估值区间 band 宽度重算；风险折扣 min(40%, RiskScore×0.75%)
- 类型：`types.ts` 扩展 `PillarBreakdown`/`ValuationV2`/`baselineReview`/`previousReview`（全部可缺省 → 旧报告旧模板）；`lib/db.ts` 新增 `report_v2` JSONB 列 + 打包/解包/透传
- 展示：`ScoreGauge` 显示 4 档层级短词（Premium/Growth/Developing/Early）；i18n `tiers` 同步替换；`CommercialSnapshotTab` 估值卡 v2（置信度徽章 + 显式风险折扣 + band 区间）+ 新旧模板切换（新报告 Six-Pillar Scorecard / 旧报告雷达图）
- Teaser：`stripForTeaser` 保留 v2 字段，估值区间按 band 重算（低置信更宽更诚实）
- Baseline：首评标 `baselineReview: true`；次评附 `previousReview`（score/tier/valueMid/computedAt），前端 delta 徽章
- demo 同构：`lib/demo-data.ts` 补 posts（fitness hashtag）+ 走真实 `buildPillars`/`buildValuationV2`，演示首评场景
- 集成验证（@demo 浏览器实测）：Baseline 条 ✓ / 估值 $63.8K–$86.3K（medium_high ±15%）✓ / Six-Pillar Scorecard + 归因展开 ✓ / Premium 层级词 ✓
- 修复集成 bug：Growth Momentum 归因 `fmtPct(playGrowth)` 漏乘 100，小数比率（0.35）显示 "+0%"——已修为 `fmtPct(playGrowth * 100)` 并补回归断言（0.12 → +12%）

---

## B5b Dashboard IA + Reports 资产（Milestone 3）

**目标**：Overview 首屏 4 模块 5 秒抓核心；报告成为可带走的商业资产。

**改动内容**

1. Dashboard 新 IA（Overview / Growth Plan / Reports / Tools / Settings；Billing 入口本批只读展示现有 credits，完整 Billing 页在 B8）
2. 全局顶栏：@creatorname + 剩余额度 + 上次评估 + Update 按钮；冷却中显示友好文案（含 "reviewing once a week" 解释）
3. Overview 首屏 4 模块：价值卡（含变化）/ 核心问题 + 3 任务 / 额度卡（读 credits）/ 评分简览；Top/Bottom 与完整诊断折叠进报告
4. Reports 页：列表 + 在线查看
5. PDF：客户端打印方案（打印样式，零服务器成本）
6. 分享：32B 随机 token + 默认 30 天 + 手动延长/关闭（`lib/share-store.ts` / `app/share/[id]` 对接）
7. Tools 页极简版：Valuation（=发起 Review）/ Scorecard / Basic Creator Profile

**验收标准**

- [x] Overview 无滚动可见 4 模块（`app/dashboard/page.tsx` 2×2 网格：ValueCard/FocusCard/CreditsCard/PillarsCard + 空态引导）
- [x] 冷却期文案含原因解释（`UpdateAccountButton`：24h 内显示 `Next review available in {x}h` + `Weekly reviews keep your value current.`）
- [x] PDF 输出完整（估值/评分/任务/免责声明）（Reports 页复用既有 `lib/export-pdf.tsx` 客户端导出，经付费缓存拉完整 Evaluation）
- [x] 分享链接 30 天后失效、可关闭、可延长（`extendShare`/`revokeShare`/`listShares` + PATCH/DELETE/GET?username= API，所有权校验沿用 evaluation_ownership）
- [x] Creator Profile 含极简字段集（Tools 页 Basic Creator Profile 卡 funnel 至评估流，无虚构独立功能）

**实施记录（2026-08-19）**

- 骨架：`app/dashboard/layout.tsx` client 鉴权门（无 token → 回首页）+ 侧边/移动双导航（5 项 IA）+ `components/dashboard/`（Topbar/dashboard-data Provider/UpdateAccountButton/4 模块卡/shared）
- `/api/history` 增 `latest` 增强字段（服务端 findEvaluation + hydrateCommercial 重建 pillars/valuationV2/previousReview/primaryRateBlocker，不违反「客户端不得重算报价」约束）+ `businessValueMid`/`isFree` 列
- 分享管理：`shares` 表增 `username` 列迁移（存量行按 evaluation->username 兼容）；已过期/已撤销链接不可复活；限流与所有权语义与创建一致
- Reports 页：列表 + View/Share（创建/复制/Extend 30 days/Revoke 就地操作）/PDF；免费条目 Share/PDF 禁用
- Tools/Settings 极简页；全部字面英文文案（单语言产品，不动 en.ts 词典）
- 集成验证：TSC 0 错、145/145 测试、`next build` 通过（5 条 dashboard 路由产出）；浏览器实测——未登录 /dashboard 跳首页 ✓、注入 dev token 后 Overview/导航/Reports/Tools/Settings/Growth Plan 渲染无崩溃 ✓、@demo 报告 5 项回归全过 ✓

---

## B6 Growth Plan 任务引擎（Milestone 3，可与 B5 并行）

**目标**：规则引擎生成可验证任务，数据驱动、零 AI 成本。

**改动内容**

1. `lib/growth-tasks.ts`：模板引擎——任务模板 × 真实数据参数（关联具体视频/评分）
2. 数量与置信度按 Spec §9 表格 + 覆盖天数/主题数/爆款异常校验
3. 任务结构含 `measure_target`（"Next review will measure: Niche Clarity"）
4. 泛化建议黑名单
5. API：`GET /api/growth-plan`、`POST /api/growth-tasks/:id/complete`（付费功能，接解锁门）
6. Growth Plan 页面（任务卡 + Mark as complete + 完成追踪）

**验收标准**

- [x] 每个任务关联至少 1 条真实视频或评分证据（evidence 正则断言 `/\d/` 每条必含具体数字/视频引用，25 用例覆盖）
- [x] 视频数 <5 的账号任务数 ≤1 且置信度 Low（数量表边界测试：4/5、9/10、29/30 断档点）
- [x] 任务完成状态持久化并在下次 Review 报告中回显（`growth_task_states` 表 PK(email,username,task_key) 幂等持久化，Growth Plan 页跨 Review 回显 completedKeys；报告内嵌回显留待 B7 埋点批补）
- [x] 数据不足提示正确展示（`limitedData` → Spec §9 原文提示条）

**实施记录（2026-08-19）**

- 引擎：`lib/growth-tasks.ts` 纯函数 `buildGrowthTasks({evaluation})`——6 条规则模板（niche<45 聚焦/consistency<45 节奏/audience<60 互动/momentum<45 系列化/brand<60 商业证据/risk>0 风险修复），最弱支柱优先（risk 反向语义），evidence 全部绑定真实数字（top3Share%/engagementRate%/topPostPlays/CPM/时间 slot）
- 数量/置信度按 Spec §9 表 + 三重降档（覆盖<14 天→上限2且降档/单条爆款>8×→降档并注明/叠加不破 low）；`limitedData` 双口径（抓取样本<5 或 videoCount<10）
- 泛化黑名单测试断言（/keep posting|post more|be consistent|engage with your audience|stay active/i）；key=kebab(title)+规则序号，同输入同输出（跨评估完成状态可持久化）；baselineReview → 全任务 `baseline:true` + "Baseline calibration" 前缀
- API：`GET /api/growth-plan?username=`（Bearer + checkShareOwnership 付费门：免费预览→402）、`POST /api/growth-tasks/[id]/complete?username=`（幂等 200）；`lib/growth-task-states.ts` Neon 表惰性初始化
- 页面：`app/dashboard/growth-plan/page.tsx` + `GrowthTaskCard`（Spec §9 任务结构：title/why/evidence 等宽强调/impact/"Next review will measure" 徽章/confidence/baseline/Mark as complete）；402 付费墙引导解锁；`?username=` 缺省回退最近评估账号（集成修复，导航直链可达）
- Teaser 钩子：`stripForTeaser` 增 `growthTaskPreview`（任务 #1 标题进免费层，完整任务集不泄漏）
- 测试：`lib/growth-tasks.test.ts` 25 用例 + teaser 补 2 用例；全量 145/145、TSC 0 错、build 通过

---

## B7 合规、召回、埋点、对账（Milestone 4，已精简）

**目标**：合规出镜、增长触点补齐、计量可对账。（credits→账本迁移与订阅 grandfather 已移入 B8。）

**改动内容**

1. 合规：全站页脚数据来源声明 + 估值页免责声明核查 + ToS 条款（禁倒卖/大规模采集）+ `lib/tiktok.ts` formalize 为 `TikTokProviderAdapter` 接口
2. 邮件：Review 完成邮件 + Day-10 召回（"Your value may have changed"）
3. 埋点全量上线（Spec §15 事件清单）
4. Admin 对账：credits 变动 vs usage_events 流水每日核对，不一致告警
5. `REVIEW_STATE_MACHINE` flag 全量开启，移除旧无状态路径

**验收标准**

- [ ] 每个页面页脚含数据来源声明；估值页含免责声明
- [ ] 对账任务连续 7 天零差异
- [ ] 两封邮件触发正确
- [ ] flag 移除后全流程回归通过

---

## B8 支付重做：Creem 闭环 + 账本迁移（延后，时机另定）

**目标**：Spec v2 §10/§13 的完整支付与账本体系。**本批未启动前，现有支付逻辑保持不动。**

**改动内容**

1. Creem：3 商品（$9 one-time / Creator $19 / Pro $39）+ Checkout + Webhook（验签 + event_id 幂等，权益发放唯一事实源）+ Customer Portal
2. 订阅周期与额度重置（billing_period；重置 = 新一批额度）
3. 升降级 + $9→Creator 抵扣（30 天窗口 / 终身 1 次 / Discount Code；开工前核对 Creem Discount Codes 与 proration 能力，备选：首月 $10 专属链接 / 期末生效）
4. `review_entitlements` 账本替换 credits（消耗模式沿用 B1 三段式）
5. 迁移：现有 credits 余额 → one_time Entitlement（1 credit = 1 完整 Review，90 天有效）；Single/Growth/Studio 存量订阅冻结 grandfather 至取消
6. Billing 页：当前套餐 / 额度使用 / 重置日 / 抵扣资格 / 单次购买 / 付款记录 / 取消原因收集 → Portal

**验收标准**

- [ ] 三商品支付 e2e 通过，webhook 重放不重复发放
- [ ] 续期 → 新周期额度正确重置，未用额度不结转
- [ ] $9 用户 30 天内订阅 → 首月 $10；二次尝试被拒
- [ ] 取消 → 本期额度保留至周期末
- [ ] 老用户 credits 余额正确迁移为 Review 次数

---

## 执行顺序

```text
串行主线：B1 → B2 → B3 → B5a / B5b / B6（三者可并行）→ B7
B8 独立延后：依赖 B1（状态机/三段式）+ B3（解锁门），启动时机由用户决定
```

## 每批交付物

1. 代码 + 单测（lib 层 TDD：状态机 / 三段式 / pillar 映射 / 任务引擎必须有测试）
2. 该批验收清单全绿
3. 一次可回滚发布（B1/B2 靠 flag，B3+ 靠路由/组件级灰度）
4. 批末更新本文档勾选状态
