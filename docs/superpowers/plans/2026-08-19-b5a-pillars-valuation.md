# B5a 报告重构：6 支柱 + 价值层级 + 可解释估值 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 内部 10 维引擎不动，对外换新叙事——6 支柱评分 + 4 档价值层级 + 置信度区间宽度 + 显式风险折扣 + Baseline 模式。

**Architecture:** 新增 `lib/pillar.ts` 纯映射层（10 维 → 6 支柱 + 置信度分档 + 风险折扣公式），scoreProfile 产出 `pillars` / `valuationV2` 并随 evaluation JSON 持久化；展示组件按「有 pillars → 新模板 / 无 → 旧模板」区分新旧报告；估值区间宽度与风险折扣只在展示层生效（内部估值引擎零改动）。

**Tech Stack:** TypeScript、Vitest、Next.js 15、React、Neon（evaluations JSON 持久化）。

**硬约束：**
- 色值一律读 `lib/tier.ts` 的 `TIER_COLORS`（S/A 粉、B/C 青、D/E 橙、F 白——恰好对应 4 档价值层级）
- 内部 10 维加权评分引擎与美元估值体系不动，只加映射层
- 历史报告旧标签不回写
- Niche Clarity 用 hashtag 聚类，无 LLM

**Spec 依据：** TokValue-Spec-v2.md §7.1–7.5、§8（Baseline）

---

## Spec 映射（6 支柱 ← 内部来源）

| 支柱 | 内部来源 | 计算 |
|---|---|---|
| Growth Momentum | momentum 维 | dims.momentum |
| Content Consistency | stability 维（节奏+断更风险） | dims.stability |
| Audience Quality | engagement + authenticity | 0.5/0.5 均值 |
| Niche Clarity | hashtag 聚类（新算） | top-3 hashtag 占比 → 0–100 |
| Brand Readiness | commerce + monetization + influence | 0.4/0.3/0.3 加权 |
| Risk Score | riskFlags 汇总 | high+30 / medium+15 / low+6，clamp 0–100 |

状态词：`≥70 Strong / ≥45 On track / <45 Needs attention`（Risk Score 反向：低分好）。

估值 v2：`discount = min(40%, RiskScore × 0.75%)`；区间宽度 `Medium-High ±15% / Medium ±20% / Medium-Low ±25% / Low ±30%`。

价值层级：`S/A → Premium Value、B/C → Growth Value、D/E → Developing Value、F → Early Value`。

---

### Task 1: lib/pillar.ts 纯函数层（TDD）

**Files:**
- Create: `lib/pillar.ts`
- Test: `lib/pillar.test.ts`

导出：`PillarKey / Pillar / PillarBreakdown / ConfidenceBand / ValuationV2` 类型；
`pillarStatusOf` `riskScoreOf` `riskDiscountPct` `nicheClarityOf` `buildPillars` `confidenceBandOf` `rangeWidthForConfidence` `valuationRangeOf` `valueTierOf`。

- [ ] 失败测试：支柱映射（6 支柱数值/状态词/归因非空）、Niche Clarity hashtag 聚类（集中→高分/分散→低分/无标签→中低分+降置信）、风险折扣（`min(40, ×0.75)` 封顶）、区间宽度（低置信 ±30% > 高置信 ±15%）、价值层级 4 档映射
- [ ] 实现并通过；`valueTierOf` 色值读 `TIER_COLORS`
- [ ] Commit

### Task 2: 类型扩展 + scoreProfile 接线

**Files:**
- Modify: `types.ts`（Evaluation 增 `pillars?: PillarBreakdown`、`valuationV2?: ValuationV2`）
- Modify: `lib/scoring.ts`（scoreProfile 产出并挂载两字段；旧缓存无字段 → 旧模板）

- [ ] scoreProfile 尾部挂载 `pillars` + `valuationV2`（band 由 videoCount/dataQuality/风险共同决定）
- [ ] TSC 通过（可选字段零破坏）
- [ ] Commit

### Task 3: 价值层级展示名 v2

**Files:**
- Modify: `lib/tier.ts`（`valueTierLabel()` 读 i18n）
- Modify: `lib/i18n/dictionaries/en.ts` + `zh.ts`（tiers 改 4 档：S/A=Premium Value、B/C=Growth Value、D/E=Developing Value、F=Early Value）
- Modify: 展示 S–F 字母的组件改用 `valueTierLabel`（ScoreGauge / Recently Evaluated / 历史页不回归）

- [ ] 报告页/历史页标签显示 4 档新名；色值不变
- [ ] Commit

### Task 4: Teaser 估值区间 v2

**Files:**
- Modify: `lib/teaser.ts`（stripForTeaser：totalValue low/high 按 band 宽度重算——mid ∓ width%）
- Test: `lib/teaser.test.ts` 增断言

- [ ] 免费报告区间 = band 宽度（低置信明显更宽）
- [ ] Commit

### Task 5: 支柱 UI + CommercialSnapshotTab 对接（新旧模板）

**Files:**
- Create: `components/sections/PillarSection.tsx`（6 支柱：名称+分值+状态词，点击展开归因；色值按状态词读 TIER_COLORS 组色）
- Modify: `components/report/CommercialSnapshotTab.tsx`（Evidence 区：有 pillars → PillarSection；无 → RadarChart 旧模板）
- Modify: `components/report/DetailedAnalysisTab.tsx`（顶部插 PillarSection（新报告），DeepAnalysis 技术底稿保持 10 维）
- Verify: `components/ReportTabs.tsx`（纯导航，无数据依赖——回归即可）

- [ ] 新报告 6 支柱数值+状态词+归因完整；旧报告 RadarChart 不回归
- [ ] Commit

### Task 6: 估值卡 v2 + 风险折扣显式（CommercialSnapshotTab Account Value）

**Files:**
- Modify: `components/report/CommercialSnapshotTab.tsx`（Account Value 卡：band 区间 + `Risk adjustment: −X% (Risk Score: N)` + 四分项摘要（付费）；免责声明文案核查 §7.5）

- [ ] 低置信区间明显宽于高置信；风险折扣行可见
- [ ] Commit

### Task 7: Baseline 模式 + 次评对比

**Files:**
- Modify: `app/api/evaluate/route.ts`（保存前查该 username 历史评估数：0 → `isBaseline`；>0 → 附 `previous: {score, tier, valueMid, computedAt}` 摘要）
- Modify: `components/report/CommercialSnapshotTab.tsx` + `components/report/TeaserReport.tsx`（baseline 文案 vs `since last review` 变化标记；Next Move 卡标注 `Baseline calibration`）

- [ ] 首评：baseline 文案、无变化标记；次评：价值/评分 delta 出现
- [ ] Commit

### Task 8: 集成验证 + 批次文档

- [ ] vitest 全绿 + TSC 干净
- [ ] 浏览器验证：mrbeast teaser（band 区间+支柱锁定）、@demo full（6 支柱+风险折扣+四分项）、旧缓存报告旧模板不回归
- [ ] `docs/TokValue-Batches.md` B5a 验收标准勾选 + 实施记录
- [ ] Commit
