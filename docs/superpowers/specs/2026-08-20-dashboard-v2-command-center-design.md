# Dashboard v2 重设计 Spec
## Command Center 风格 · 浅色 Linear 风
**Date**: 2026-08-20
**Scope**: `/dashboard` 全链路重做 — Home / Reports / Growth / Profile 四个页面（砍掉原 /dashboard/tools，/dashboard/settings 改名 /dashboard/profile）。所有评估数据层（evaluate 路由、pillar/valuation/verdict/commercial 纯函数、credits 支付、history/export/share 导出）不做改动。
**Acceptance Goal**: 用户登录后第一眼能回答「我现在应该做什么？」，在 <3 秒内看到今日 P0/P1 任务并能直接点击执行。

---

## 1. 已确认决策（不可变更）

| # | 决策项 | 选择 |
|---|---|---|
| D1 | 定位 | Command Center（"我现在该做什么"） |
| D2 | 视觉风格 | Linear / Notion 浅色风 — 白卡 + #E5E7EB 边 + 藏蓝/翡翠层级色 |
| D3 | 页面 IA | 4 pages：Home / Reports / Growth / Profile |
| D4 | 设计语言一致性 | 与 Report v2（翡翠金标色板 + 浅色）完全统一，禁止引入深色仪表盘 |
| D5 | 核心视觉王者 | Today's Tasks 模块（优先级 P0/P1 任务 + 内嵌快捷操作） |
| D6 | 路由变更 | `/dashboard/settings` → `/dashboard/profile`；删除 `/dashboard/tools` 路由及其组件 |

---

## 2. 设计系统（与 Report v2 共用，无变更）

### 2.1 色彩
- 表面：页面 `#F7F8FA`、卡片 `#FFFFFF`、边框 `#E5E7EB`、底灰 `#F3F4F6`
- 正文：`#111827` / 次要 `#6B7280` / 更浅 `#9CA3AF`
- 功能色：主按钮 `#1D4ED8`（藏蓝）/ 成功 `#047857` / 警示 `#B45309` / 危险 `#DC2626`
- 层级色（读 lib/tier.ts TIER_COLORS，翡翠金板）：
  - Premium (S/A): `#047857`
  - Growth (B/C): `#1D4ED8`
  - Developing (D/E): `#B45309`
  - Early (F): `#64748B`

### 2.2 字体与排版
- Inter，数字全 `tabular-nums`
- 字阶：页面标题 22px semibold / 模块标题 12px uppercase letter-spacing 0.5px semibold / 正文 13px / 辅助 11px / KPI 数字 22px semibold（最大不许超过 Today 任务主标题 14px 的层级对比）

### 2.3 组件词汇
- 卡片：圆角 10px，1px `#E5E7EB` 边，内边距 14-16px，无阴影或 `0 1px 2px rgba(0,0,0,0.03)`
- 任务卡：圆角 10px，左侧 18px checkbox（未完成 `#D1D5DB` 边，完成 `#047857` + 绿勾 + 文字删除线 + opacity 0.5）
- 标签 Pill：圆角 999px，10-11px semibold
  - P0: `#DC262610` bg + `#DC2626` text
  - P1: `#1D4ED810` bg + `#1D4ED8` text
  - Premium: `#04785710` + `#047857` / Growth: `#1D4ED810` + `#1D4ED8` / Developing: `#B4530910` + `#B45309`
- 按钮：圆角 7px，12px font-weight 500
  - Primary: `#1D4ED8` bg + 白字
  - Secondary: `#FFFFFF` + `#E5E7EB` 边 + `#111827` 字
  - Danger: `#DC2626` 边 + `#DC2626` 字 + 白底

### 2.4 侧栏（桌面 lg）
- 左栏 200px，右 1px `#E5E7EB` 边，移动端顶部横滚 pill 导航
- 入口 4 个：Home / Growth / Reports / Profile
- 当前项：`#1D4ED810` bg + `#1D4ED8` 字 + 粗
- 底部用户头像卡（头像圆 + 用户名 + 邮箱），移动端放入 profile 下拉

---

## 3. Home（/dashboard）6 模块（从上到下）

### 3.1 模块① — Greeting + Switcher + CTAs
- 左侧：问候语「Good morning/afternoon/evening, {firstName} 👋」，依据时间（6-12/12-18/18-24）
- 子行：「You have N things to do today · Working on @{username}」
  - 只有一个账号时不显示 switcher；>1 账号显示下划线 dropdown
- 右上角两个按钮（右对齐）：
  - 「Review again」：Secondary → `/evaluate/{currentUsername}?t=refresh` 或调用 upgrade（如果当前是 teaser，弹出付费墙）
  - 「Evaluate new」：Primary → `/` 评估输入页

### 3.2 模块② — KPI 三卡（1fr 三等分）
| 卡片 | 左标题 uppercase | 主数字 | 第三行小字 | 数据来源 |
|---|---|---|---|---|
| A | ACCOUNT VALUE | $63.8K 中值数字（tab-nums） | ▲ +8.2% vs {上次评估日期}（与上一条 history 记录对比，无则不显示环比行） | latestEvaluation.businessValueMid / diff vs previous |
| B | MARKET RANK | Top 26%（`100-percentile`，色=层级色） | Premium Value（读 tierOf() → 4 层级词） | latestEvaluation.percentile / latestTier |
| C | REVIEWS LEFT | 6（tab-nums） | Pack · $29 · 1 used（读 credit_balance 和最近 credit_usage_logs 的 pack 名） | session → balance endpoint + logs |

### 3.3 模块③ — Bottleneck × Milestone（1:1 两栏）
- **左卡 Biggest Bottleneck**（金渐变底 `#FFF8E8→#FFF`，`#B4530925` 边）
  - 标题 uppercase + ⚠
  - 副标题：`commercialSnapshot.primaryRateBlocker.label`（已有字段）
  - 正文：`primaryRateBlocker.fix` 一句话（已有字段）
  - CTA link：「See fix in Growth →」→ `/dashboard/growth#week3`（跳转对应周）
- **右卡 Next Milestone**（翡翠渐变底 `#E8F6F0→#FFF`，`#04785725` 边）
  - 标题 uppercase + 🏁
  - 副标题：`revenueRoadmap.milestones[0].title`（第一个未完成里程碑）
  - 正文："Currently {currentIncome} — {toHitDescription}"
  - CTA link：「Suggested brands →」→ 跳报告 Deal Pricing section

### 3.4 模块④ — Today Tasks（视觉核心）
- 顶部行：TODAY · {WeekDay Month Day} uppercase 左 + 「View full plan →」右（→ `/dashboard/growth`）
- 任务列表（按 Week × 日期 = Today 过滤）：
  - **每个任务行结构**：`[18px checkbox] [task content] [priority pill] [link arrow]`
  - task content 内：任务标题（14px med）+ 下方 12px 小字（Pillar N · 类别 · 完成后影响哪个支柱 +分数）
  - 当任务含 brand pitch：task content 下方嵌快捷按钮组：Copy pitch A / Copy pitch B / See N matches（复制用 navigator.clipboard，See matches 跳报告 Brand section）
  - 当任务含 post reply：右侧 `↗ Last post`，点击打开 TikTok profile 在新标签
- **Tomorrow 预览折叠行**：虚线分隔 + 「Tomorrow · 4 tasks」+「Expand」按点展开
- **勾选交互**：checkbox 点击 → 绿勾 ✓ + 文字删除线 + opacity 0.5 + 打 `/api/growth-tasks/{taskKey}/complete`（现已有 growtasks 完成 API 或复用），失败则立即回滚 UI + toast「Failed to mark complete — try again」

### 3.5 模块⑤ — Pillar Scorecard（3×2）
- 每行：左支柱名 + 右分数；条高 5px，条色 = 支柱状态色
- 仅当存在 latestEvaluation.pillars 时显示；无则隐藏整个模块
- 右上角「Full report →」→ `/evaluate/{username}#pillars`

### 3.6 模块⑥ — Progress Strip（条件显示，≥2 条 history）
- 标题：Progress over time
- 3 节点：`{last}` 灰边 + `{current}` 高亮蓝边 + `{next}` 虚线占位
- `{current}` 节点显示层级徽章（与报告一致）
- 仅当 history.length ≥ 2 渲染；<2 整个模块不渲染

---

## 4. Reports（/dashboard/reports）

### 4.1 布局
- 顶部左：Reports H2 + 「N evaluations · K accounts」副
- 顶部右：Search 输入（按 username 过滤）+「Evaluate new」Primary 按钮
- Filter chips 行：All（高亮反色）/ Paid(n) / Free(n) + 每个账号一个 chip（仅当 ≥2 账号）
- 数据：读现有 `/api/history`（evaluateHistory = account_reviews JOIN share_links + pdf_export_records）

### 4.2 表 6 列（grid）
| # | 列 | 内容 |
|---|---|---|
| 1 | 头像 | 圆 32px，首字母或 profile 头像 |
| 2 | Account | @username 粗 + niche · followerCount 11px |
| 3 | Value | 估值区间 + 环比（付费项）；免费 teaser 项 = 估值 blur + 「🔒 Teaser only」小字 |
| 4 | Tier | 对应层级 pill |
| 5 | Reviewed | 相对时间（Today·HH:MM / Yesterday / Aug 5）+ 「Paid · 1 credit used」或「Free · 0 credits」 |
| 6 | Actions 右对齐 | Open → 评估页 / Share → 弹出 share link 复用组件 / PDF → 调 export（仅付费报告可用，免费禁用灰）；对 teaser 行把 Share 替换成 Unlock $9（Primary） |

### 4.3 删除的旧组件
- 原 Reports 页面顶部的「Quick Stats（总评估数/平均价值/解锁/剩余额度）」和侧边「Evaluation Packs 购买卡」— KPI 已移到 Home KPI 三卡 + Profile Credits 模块，避免重复信息堆叠。

---

## 5. Growth（/dashboard/growth）

### 5.1 页头
- H2「Your Growth Plan」+ 副「Week {n} of 4 · Focus: {weekGoal}」（读 ThirtyDayPlan.weeks 的 focus / title）

### 5.2 总进度条
- `[Completed tasks / Total tasks] done · N%`
- 进度条 8px 高，渐变填充 `90deg #1D4ED8→#047857`

### 5.3 周折叠时间线
- **Week 1 默认展开**，其余周折叠（点击 header 展开/折叠，动画用 `max-height` transition）
- 每 week 卡：
  - Header：WEEK N pill（当前周 = `#1D4ED810` 蓝底 + `#1D4ED8` 字；未到周 = 灰边）+ Week focus title + 「n/N done」右侧 + 展开符号
  - Body：任务列表，每行 = [16px checkbox] + 任务 + 周内日期 / 优先级
  - 今日任务高亮：`#1D4ED805` 背景 + `#1D4ED820` 边框
  - 已完成：绿勾✓ + 删除线 + opacity 0.5
- 勾选：同 Home，调用同一完成 API。两端 UI 状态同步（Provider store 或 localStorage + 组件内 hook）

---

## 6. Profile（/dashboard/profile，原 settings 改名）

### 6.1 路由迁移
- 把 `/dashboard/settings/*` 下的全部内容迁移到 `/dashboard/profile`
- 侧栏入口从 Settings 改名为 Profile
- 旧路由 `/dashboard/settings` 留永久重定向到 `/dashboard/profile`（Next.js redirect in next.config.js 或 middleware）

### 6.2 4 模块垂直列表

**6.2.1 Account**
- 左：52px 圆角渐变头像（首字母）/ 真实头像 + 用户名粗 / 邮箱 / 注册日期
- 右：Edit 按钮（打 profile update API，现已有则复用；没有则占位空 handler）

**6.2.2 Credits & Billing**
- 左上：Credits 大卡（渐变蓝绿边 1px）：剩余额度 / pack 名 / 已使用比例
- 右上：Need more? 小卡：`Buy more credits` 深色按钮 → 现有的购买页（单包页面）
- 下一区域「Current plan」：虚线边 + Pay-as-you-go · no active subscription + 解释「No recurring charges…」
  - 这一行是**信任文案**：打消用户对"会不会偷偷扣订阅"的疑虑；未来上订阅可替换为 subscription 状态
- 右上链接「Purchase history →」→ 打开 credit_usage_logs + packs 列表（有就复用旧的，没有做只读列表页）

**6.2.3 Preferences**
- 两个 toggle（38×22 滑动）：
  1. Weekly growth summary email（默认 on）
  2. Hide free preview sections on reports（默认 off）
- 数据存现有 user_prefs 表；没表就放 localStorage，明确告诉用户「This setting is per-device」。

**6.2.4 Danger zone**
- `#DC262625` 边 + Sign out of all devices 说明 + Sign out 按钮（边红字红）
- 点击 sign out：清除 session token → 打 signout endpoint → 跳 `/`

---

## 7. 数据来源映射（全部不新建服务端纯函数，仅读现有字段）

| 模块 | 数据源字段 | 文件位置 |
|---|---|---|
| KPI A · 估值 + 环比 | `businessValueMid` + `history[i-1]` 对比 | `/api/history` 返回的 evaluateHistory + current latest |
| KPI B · 排名百分位 | `percentile` + `tier` / `tierReason` | Evaluation.scoreProfile.percentile |
| KPI C · 额度 + 包 | `credit_balances.balance` + 最近 credit_grants 的 `checkout_metadata.pack_name` | `/api/credits/balance`、`/api/credits/grant-logs`（现有 or 新增极简） |
| Bottleneck 卡 | `commercialSnapshot.primaryRateBlocker` | [commercial.ts](file:///Users/ricky/AICode/TokValue/lib/scoring/commercial.ts) `commercialSnapshot` 字段 |
| Milestone 卡 | `revenueRoadmap.milestones[0]`、`revenueRoadmap.annualIncomeTotal` | [valuation.ts](file:///Users/ricky/AICode/TokValue/lib/scoring/valuation.ts) RevenueRoadmap 输出 |
| Today tasks | `thirtyDayPlan.weeks[].days[].tasks[]`，按当前日期过滤并升序 P0→P1→P2 | Evaluation.thirtyDayPlan 字段 |
| Growth week focus | `thirtyDayPlan.weeks[].focus` / `goal` | ThirtyDayPlan week 对象 |
| Reports 表 | `/api/history` evaluateHistory 数组 + share_links + pdf_export_records（已有返回） | 现有 `/api/history/route.ts` |
| Pillar Scorecard | `pillars[]`（pillar.ts 的 buildPillars 产物） | Evaluation.pillars 字段 |
| Progress Strip | evaluateHistory 数组按时间排序取最近两条 + 下一节点占位 | `/api/history` + 计算 |

---

## 8. 新建 / 删除文件清单

### 8.1 新建
```
components/dashboard-v2/
├── Sidebar.tsx                   侧栏 + 移动端顶部横滚导航
├── home/
│   ├── GreetingBar.tsx            问候语 + switcher + review CTA
│   ├── KPIRow.tsx                 KPI 三卡（A/B/C）
│   ├── BottleneckMilestone.tsx    瓶颈+里程碑双卡
│   ├── TodayTasks.tsx             今日任务（王者模块）含 checkbox + 快捷操作
│   ├── PillarScorecard.tsx        3×2 支柱条
│   └── ProgressStrip.tsx          历史进度 3 节点条件渲染
├── reports/
│   ├── ReportsTable.tsx           6 列表格 + chips 过滤 + search
│   └── FilterChips.tsx            筛选 chips
├── growth/
│   ├── ProgressHeader.tsx         百分比进度条
│   └── WeekAccordion.tsx          单周折叠卡（4 份实例）
├── profile/
│   ├── AccountCard.tsx
│   ├── CreditsBillingCard.tsx
│   ├── PreferencesToggle.tsx
│   └── DangerZone.tsx
└── ui/                            小原子（复用 report-v2/ui 同 Tailwind 类）
    ├── TaskRow.tsx
    ├── Checkbox.tsx
    ├── Pill.tsx
    └── Card.tsx

app/dashboard/
├── profile/                       原 settings 内容重迁入（或在原 dir 改名）
│   └── page.tsx
└── layout.tsx                     套 Sidebar v2

lib/i18n/dictionaries/en.ts       追加 dashboard-v2 文案（dashboard.home.* / reports.* / growth.* / profile.*）
```

### 8.2 删除
```
components/dashboard/        全部旧组件（Sidebar / Topbar / Overview 模块 / Settings 旧内容…）
app/dashboard/tools/         整个目录及 page.tsx
app/dashboard/settings/      旧目录（迁移到 profile 后删）
```

### 8.3 修改
- `app/dashboard/layout.tsx`：换成 DashboardShell（Sidebar v2 + 主区容器 + DashboardDataProvider 注入）
- `app/dashboard/page.tsx`：Home 6 模块组装
- `app/dashboard/reports/page.tsx`：ReportsTable v2，删旧的 QuickStats + 侧边购买卡
- `app/dashboard/growth-plan/page.tsx`：迁移到 `/dashboard/growth/page.tsx`（redirect 保留）
- `next.config.js`：增加 `/dashboard/settings` → `/dashboard/profile` 重定向

---

## 9. 测试与验收

### 9.1 单元测试（新增）
- `TaskRow checkbox`：空态 / 勾选 / 失败回滚 三种（mock API）
- `FilterChips`：点击 chip 触发正确过滤回调
- `WeekAccordion`：首周默认展开，其他周闭合；点击切换
- `ProgressStrip`：history.length <2 返回 null，>=2 渲染
- `KPIRow`：无 history 时不显示环比行

### 9.2 存量测试
- pillar/valuation/verdict/commercial 等纯函数 173 单测 **必须保持 green**
- TSC clean

### 9.3 浏览器 QA Checklist
- [ ] Home：Greeting 时间正确（morning/afternoon/evening），账号切换 >1 账号才显示
- [ ] KPI 三卡：估值数字 tabular-nums 不抖动；无 history 不显示环比
- [ ] Bottleneck：点击 See fix 跳 `/dashboard/growth#week3`；Milestone 跳报告 Deal Pricing
- [ ] Today Tasks：
  - 勾选 → 绿勾 + 删除线 + 轻 toast
  - 勾选失败 → 回滚 + 红 toast
  - Copy pitch A → navigator.clipboard 成功提示
  - Tomorrow Expand 展开后显示次日任务
- [ ] Pillar Scorecard：无评估隐藏整个模块；有则正确显示 6 条
- [ ] Progress Strip：<2 history 隐藏；2 条显示三节点高亮
- [ ] Reports：chips 过滤；free teaser 行估值 blur + Unlock $9 按钮；PDF 在 free 行禁用灰
- [ ] Growth：Week 1 展开，其他折叠；点击切换；今日任务高亮与 Home 同步
- [ ] Profile：Account 卡片 + Credits 额度值正确 + Pay-as-you-go 文案；Preferences toggle 切换后刷新持久化（localStorage 或 API）；Sign out 跳首页
- [ ] 路由：`/dashboard/settings` 重定向到 `/dashboard/profile`
- [ ] 支付链路回归：DEV_SKIP_PAYMENT=false，Buy more credits → Creem checkout → 成功后 KPI C Reviews Left 递增
- [ ] 层级色泄漏目检：Dashboard 所有徽章/进度条读 TIER_COLORS 无硬编码

---

## 10. 硬约束遵循确认

| 约束 | 遵循情况 |
|---|---|
| 所有 UI 颜色读 `TIER_COLORS`（lib/tier.ts），无硬编码 | ✅ 层级徽章/条全读常量；功能色走 Tailwind 语义类（emerald-700/blue-700/amber-700/red-600）与常量值 1:1 对应 |
| 定价文案用评估次数（次数），不用点数 | ✅ KPI C / CreditsBillingCard：「6 remaining」「1-pack」「Pack」 |
| 无退款文案，用「30 天创作者激励计划」替代 | ✅ Profile CreditsBilling 购买文案不写退款 |
| 无竞品对比表 | ✅ 不涉及定价表 |
| Creem 支付链路不动 | ✅ 仅替换按钮触发位置（Buy more credits → 原购买页），不改造支付逻辑 |
| `/api/credits/*` 鉴权保护 | ✅ 不改动 API 路由 |

## 11. 不在本次范围

- 支付流程重做（B8 延后批次，另行立项）
- 新建服务端纯函数或重新评分
- 移动端原生 App
- 多账号对比图（Portfolio Manager 定位，本 spec 不选）
