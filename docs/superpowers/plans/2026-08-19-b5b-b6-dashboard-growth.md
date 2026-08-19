# B5b Dashboard IA + B6 Growth Plan 任务引擎 实施计划（并行批次）

**Goal:** B5b——Dashboard 新 IA（Overview/Growth Plan/Reports/Tools/Settings + 全局顶栏 + 分享管理）；B6——Growth Plan 规则模板任务引擎（零 AI 成本）。两批次并行执行。

**Architecture:** 三条并行工作流（文件集互不相交）+ 一条串行集成流：
- **A（B6 引擎）**：`lib/growth-tasks.ts` 纯函数 + `lib/growth-tasks.test.ts` + `types.ts` GrowthTask 类型。零 UI、零 app 文件。
- **B（B5b 骨架）**：`app/dashboard/layout.tsx`（导航+顶栏+鉴权门）+ `app/dashboard/page.tsx`（Overview 4 模块）+ `components/dashboard/*`。
- **C（B5b 资产）**：`app/dashboard/reports|tools|settings/page.tsx` + 分享延期/关闭（`lib/share-store.ts` + `/api/share` 扩展）+ Reports 页 UI。
- **D（串行集成，A+B+C 完成后）**：B6 API（`/api/growth-plan`、`/api/growth-tasks/[id]/complete`）+ `app/dashboard/growth-plan/page.tsx` + Teaser 任务 #1 钩子。

**并行冲突规避（硬规则）：**
- 新 Dashboard UI 一律用字面英文文案（产品单语言 en），**禁止编辑 `lib/i18n/dictionaries/en.ts`**
- `types.ts` 仅 A 改；`lib/share-store.ts`/`app/api/share` 仅 C 改；`app/dashboard/layout.tsx` 仅 B 改
- Phase 1 各工作流**不 commit**、不跑全量 tsc（交叉噪音）；统一由主控在集成阶段验证提交

**硬约束：**
- 色值一律读 `lib/tier.ts` 的 `TIER_COLORS`；`valueTierOf`（lib/pillar.ts）出 4 档价值层级词
- 任务禁泛化建议（黑名单断言）；必须关联具体视频/评分证据
- 视频数 <5 → 任务 ≤1 且置信度 Low；不承诺播放量或收入
- 无 session token 的 dashboard 路由 → 引导回首页（不暴露付费数据）
- 分享管理操作必须过所有权校验（evaluation_ownership，is_free=false）

**Spec 依据：** TokValue-Spec-v2.md §6（Dashboard IA）、§7.3 L3（PDF/分享/Profile）、§9（Growth Plan）

---

## Workstream A：lib/growth-tasks.ts 规则模板引擎（B6 核心）

**Files:** Create `lib/growth-tasks.ts`、`lib/growth-tasks.test.ts`；Modify `types.ts`

类型（挂 types.ts）：

```ts
export type TaskConfidence = 'low' | 'medium_low' | 'medium' | 'medium_high'
export interface GrowthTask {
  key: string                    // 稳定 slug（同输入同输出，完成状态按 key 持久化）
  title: string
  whyThisMatters: string
  evidence: string               // 必须含具体数字或视频引用
  expectedImpact: string         // 影响哪些支柱
  measureTarget: PillarKey[]     // "Next review will measure: X"
  confidence: TaskConfidence
  baseline?: boolean             // 首评标注 Baseline calibration
}
export interface GrowthPlanV2 { tasks: GrowthTask[]; limitedData: boolean }
```

`buildGrowthTasks(input: { evaluation: Evaluation }): GrowthPlanV2`——从 `evaluation` 取 pillars/metrics/posts/contentCadence/riskFlags/baselineReview。

规则模板（按最弱支柱优先，每条绑定真实数据）：
1. niche_clarity<45 → 主题聚焦任务（evidence: top tags + top3Share 数字）
2. consistency<45 或 cadence 断更 → 发布节奏任务（evidence: bestWeekdays/bestTimeSlots 具体 slot）
3. audience_quality<60 → 互动格式任务（evidence: engagementRate 数字 + 最高互动视频）
4. growth_momentum<45 → 系列化复制爆款任务（evidence: top recent post playCount）
5. brand_readiness<60 → 商业证据任务（evidence: suitableCategories/estimatedCPM）
6. risk>0 → 风险修复任务（evidence: 最高级 riskFlag label）
7. baselineReview → 全部任务标 `baseline: true`，whyThisMatters 前缀 Baseline calibration 语义

数量/置信度（Spec §9 表）：

| 有效视频数 | 任务数上限 | 基准置信度 |
|---:|---:|---|
| 0–4 | 1 | low |
| 5–9 | 2 | medium_low |
| 10–29 | 3 | medium |
| 30+ | 5 | medium_high |

降档校验：数据覆盖 <14 天 → 上限 2 且降一档；单条异常爆款（peak>8x avg）→ 降一档并在 evidence 注明；视频数不足 → `limitedData: true`。

测试必须覆盖：数量表边界、降档规则、每条 evidence 含数字/视频引用（正则断言）、泛化黑名单（titles 不得匹配 /keep posting|post more|be consistent|engage with your audience|stay active/i）、baseline 标注、同输入幂等（key 稳定）、满分账号 → 空任务或保持优势任务不越上限。

## Workstream B：Dashboard 骨架 + Overview（B5b）

**Files:** Create `app/dashboard/layout.tsx`、`app/dashboard/page.tsx`、`components/dashboard/Topbar.tsx`、`components/dashboard/OverviewGrid.tsx`（或拆多文件）；导航含 Overview/Growth Plan/Reports/Tools/Settings（Growth Plan 路由 D 阶段填充）

- 鉴权门：无 `getSessionToken()`（lib/auth 客户端侧）→ 重定向 `/`；layout 是 client component 包一层
- 顶栏（Spec §6）：`@{username} · {n} reviews remaining · Last reviewed: {date}` + `[Update my account]`；24h 内 → `Next review available in {x}h` + `Weekly reviews keep your value current.`；数据源 `/api/history`（Bearer）最近一条 + `/api/credits/balance`
- Overview 4 模块（5 秒抓核心，无滚动堆叠）：① 商业价值卡（区间+变化+置信度，读 valuationV2/band；首评显示 Baseline 文案）② 本周核心问题+最多 3 任务（最弱支柱 + primaryRateBlocker；链接 Growth Plan）③ 额度卡（剩余/重置+Update）④ 6 支柱简览（名称+状态词，读 pillars；无 → 旧维度兜底）；空态（无历史评估）→ 引导发起首次评估
- `/api/history` 响应结构先读代码确认（app/api/history/route.ts），按实际字段适配

## Workstream C：Reports/Tools/Settings + 分享管理（B5b）

**Files:** Create `app/dashboard/reports/page.tsx`、`app/dashboard/tools/page.tsx`、`app/dashboard/settings/page.tsx`；Modify `lib/share-store.ts`、`app/api/share/route.ts`

- `lib/share-store.ts` 新增：`extendShare(id, email)`（expires_at=NOW()+30d，所有权校验）、`revokeShare(id, email)`（置 expires_at=NOW()）、`listShares(email, username)`（该用户该账号的活跃分享+到期日）
- `/api/share` 新增：`PATCH ?id= {action:'extend'}`、`DELETE ?id=`、`GET ?username=`（全部 Bearer 鉴权 + ownership）——保持 `export const dynamic = 'force-dynamic'`
- Reports 页：评估历史列表（用户视角：账号/日期/层级词/估值 mid/access）+ 每条操作：View（→ `/evaluate/{username}`）、Share（创建/复制链接/到期日/Extend 30 days/Revoke）、PDF（复用 `lib/export-pdf.tsx` 下载流）
- Tools 页极简三卡：Valuation / Scorecard / Basic Creator Profile——全部 funnel 到评估输入（不造不存在的独立功能）
- Settings 页极简：当前账号邮箱、Sign out（清 session token 回首页）、Terms/Privacy 链接

## Workstream D：B6 集成（A+B+C 后串行）

**Files:** Create `app/api/growth-plan/route.ts`、`app/api/growth-tasks/[id]/complete/route.ts`、`app/dashboard/growth-plan/page.tsx`、`components/dashboard/GrowthTaskCard.tsx`；Modify `lib/teaser.ts`（Teaser 保留任务 #1 标题）

- 存储新表 `growth_task_states(email, username, task_key, completed_at)`，PK 三元组；complete 接口幂等（已完成 → 200 直接返回）
- `GET /api/growth-plan?username=`：Bearer + 付费所有权（evaluation_ownership is_free=false，模式同 checkShareOwnership）→ `{ tasks, completedKeys, limitedData }`；未解锁 → 402
- `POST /api/growth-tasks/[id]/complete`：id=task_key；Bearer + 所有权；写状态表
- Growth Plan 页：任务卡（结构 §9：title/why/evidence/impact/measure target 徽章/confidence/Mark as complete）+ 完成态回显 + limitedData 提示文案（Spec §9 原文）
- Teaser L1 任务 #1 标题：`stripForTeaser` 增 `growthTaskPreview`（仅首条 title），付费墙锁定价值栈文案同步

## Phase E：集成验证 + 批次文档（主控）

- [ ] `npx tsc --noEmit` 零错误；`npx vitest run` 全绿（含新增 growth-tasks 套件）
- [ ] `npm run build` 生产构建通过
- [ ] 浏览器：未登录访问 /dashboard → 跳首页；@demo 报告无回归；mint dev session token 后 Overview/Reports/Tools/Settings/Growth Plan 渲染（空态可接受）
- [ ] 分享：创建 → 延期 → 撤销 API 行为正确（curl 或页面）
- [ ] `docs/TokValue-Batches.md` 两批次验收勾选 + 实施记录；分批 commit
