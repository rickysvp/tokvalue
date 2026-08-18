# 创作者商业成长 PMF 重构

**日期**: 2026-08-18  
**状态**: 已确认，待实现  
**主用户**: 10K–500K 粉丝、准备或正在接品牌合作、无专属经纪人/MCN 的成长型 TikTok 创作者  
**范围**: 产品定位、评估报告信息架构、Brand Deal Toolkit、免费/付费价值边界与 PMF 验证

---

## 背景与决策

TokValue 现以“TikTok Account Value Calculator”为主叙事，报告按 Overview / Growth / Revenue / Commerce 的分析维度组织。该结构能呈现算法能力，但没有围绕创作者在真实商业时刻的任务设计。

本项目不再优先做品牌方或代理机构的 creator discovery 系统。它们需要大规模发现、真实受众画像、CRM、邀约、活动管理、支付和 ROI 归因，现有产品与数据边界不足以形成竞争优势。

TokValue 的首要定位调整为：

> 创作者的商业成长与品牌合作谈判助手。

核心承诺：

> 帮助创作者更合理地报价、更有把握地谈判，并通过可执行的增长动作持续提高商业价值。

## 目标

1. 将“估值”从主产品承诺降为报价与商业准备度的计算输入。
2. 让免费用户在 15 秒内理解当前商业定位、基础报价区间、最大报价阻碍和一个立即行动。
3. 让首个付费产品直接服务品牌合作决策：推荐报价、条款加价、谈判资产和 30 天提升计划。
4. 通过单次 $9 工具包验证“报价/谈判”是否比“账号估值”更能驱动付费。
5. 为月度复评、合作记录和真实市场基准留下清晰的后续边界，但不在第一阶段实现。

## 非目标

- 不做面向品牌方或代理机构的批量 creator discovery、CRM、campaign management、付款或 ROI 平台。
- 不承诺任何报价保证、成交保证或第三方认证。
- 不在本期引入订阅、合作撮合、合同、收款、邮箱外联或品牌市场。
- 不采集真实成交价；该数据飞轮属于后续独立 SPEC。
- 不修改支付基础设施、用户 Cookie 迁移或报告代码分割的既有 SPEC。

## 产品模型

```text
免费商业快照
  → Brand Deal Toolkit（$9）
  → 创作者用报价与 Rate Card 谈判、执行 30 天动作
  → 后续月度复评（下一阶段）
```

### 核心用户任务

| 触发情景 | 用户问题 | 产品输出 |
|---|---|---|
| 品牌询价 | “我该报多少？” | 报价建议、区间、底价与解释 |
| 收到合作 brief | “这些要求该加多少价？” | 条款加价器 |
| 主动接洽品牌 | “如何证明我值得这个价格？” | 一页 Rate Card |
| 想提高报价 | “先做什么最有效？” | 30 天商业成长计划 |

## 新报告信息架构

报告导航从技术分析维度改为创作者决策顺序：

1. **Commercial Snapshot**
2. **Price Your Next Deal**
3. **Protect Your Rate**
4. **Raise Your Value in 30 Days**
5. **Share Your Rate Card**

历史的 Growth / Revenue / Commerce 数据不会删除；第一阶段将它们的有用结论映射到上述决策页。深层技术视图可作为“Detailed Analysis”二级内容保留，不能主导首屏叙事。

### 1. Commercial Snapshot（免费）

首屏必须在无滚动或一次短滚动内展示：

- `Commercial Readiness`，0–100 分；替代将 Tier 作为主结果的表达；
- 一句话商业定位，例如 `Emerging beauty creator with above-average engagement`；
- `Suggested TikTok video rate` 的宽区间；
- `Strongest commercial lever`；
- `Primary rate blocker`；
- 一个可执行的 `Next move`；
- 评估时间、数据范围和 `Estimate, not a guaranteed deal price` 说明。

原始估值区间可作为“Account value estimate”辅助内容，不应使用最大字号、首要色彩或首页主 CTA。

### 2. Price Your Next Deal（付费）

这是 Brand Deal Toolkit 的中心页，输出不是单一金额，而是可谈判的报价建议：

```text
Recommended opening rate: $600
Typical acceptable range: $450–$750
Private minimum: $400
Assumes: one TikTok video, organic use only, no exclusivity, standard delivery.
```

必须解释影响因素：账号表现、有效播放、互动质量、内容垂类、地区、增长、风险和数据置信度。

必须显式列出不包含的条件：UGC、广告使用权、独家、跨平台、额外修订、快速交付、直播及长周期合作。禁止将该数值描述成保证成交价或账户买卖价格。

### 3. Protect Your Rate（付费 Deal Terms Calculator）

新增一个可交互但不涉及合同执行的条款加价器。

输入：

| 字段 | 选项 |
|---|---|
| Deliverable | TikTok post / series / LIVE / UGC |
| Paid usage | none / 30 days / 90 days / 12 months |
| Exclusivity | none / 30 days / 90 days / 6 months |
| Platform scope | TikTok / TikTok + Reels / multi-platform |
| Delivery speed | standard / 7 days / 72 hours |
| Quantity | 1 / 3 / 6 deliverables |
| Revision scope | standard / additional revisions |

输出必须分项显示：基础报价、每个条款增量、推荐总报价及假设条件。规则只做保守的估算，不作法律或商业保证。

初始规则通过 versioned configuration 管理，不散落在 UI；算法需单元测试边界、组合与上限。

### 4. Raise Your Value in 30 Days（付费）

将现有 Growth Plan、Content Strategy 与 Commerce/Health 结论压缩成四周任务清单。

每项任务含：

- 本周目标；
- 1–3 个具体动作；
- 预计影响的商业因素（如稳定性、内容证明、品牌准备度）；
- 完成证据；
- 预计投入时间。

示例：

```text
Week 2 — Build performance proof
Publish three videos in your strongest repeatable format.
Why: stable high-intent engagement supports a stronger partnership rate.
Done when: 3 posts published and weekly median views recorded.
```

任务必须由已有账号数据导出；缺乏数据时应降低确定性并说明原因，而不是生成虚假的个性化建议。

### 5. Share Your Rate Card（付费）

新增面向品牌的单页分享资产，独立于完整 PDF 报告。

默认包含：

- creator 名称、头像、账号、垂类；
- 商业定位；
- 精选公开表现证明；
- 可选的 starting rate；
- offered deliverables；
- 联系/booking CTA。

创作者可在生成前选择隐藏推荐报价。Rate Card 必须显示 `TokValue estimate`，且不得表现为平台认证、受众真实性认证或成交保证。

完整分析 PDF 继续保留给创作者自己；Rate Card 是面向外部合作方的精简资产。

## 免费与付费边界

| 内容 | 免费 | Brand Deal Toolkit（$9） |
|---|---:|---:|
| Commercial Readiness 与基础解释 | 是 | 是 |
| 宽报价区间 | 是 | 是 |
| 推荐开价、底价、适用假设 | 否 | 是 |
| Deal Terms Calculator | 否 | 是 |
| 全部 Rate Blockers 与影响 | 一个 | 全部 |
| 30 天计划 | 第一个 next move | 完整四周任务 |
| Rate Card | 预览 | 生成、编辑、导出/分享 |
| 深度技术分析 | 否 | 是，作为辅助内容 |

付费 CTA 固定表达为：

> Unlock your deal price, terms calculator, 30-day plan, and shareable Rate Card — $9 once.

禁止再以“解锁 12+ 模块”作为主要付费理由。

## 页面与文案调整

| 现有表达 | 新表达 |
|---|---|
| TikTok Account Valuation | Creator Commercial Snapshot |
| Business Value | Commercial Readiness / Account Value Estimate（辅助） |
| Brand Deal Per Video | Suggested Starting Rate |
| Risk Flags | Rate Blockers |
| Account Health | Brand Readiness |
| Content Virality | Content Proof |
| Commerce Fit | Monetization Readiness |
| Peer Ranking | Market Position |
| Revenue Roadmap | Income Opportunities |

文案必须使用“建议、估算、适用条件、数据置信度”，避免“你值”“保证赚取”“准确成交价”等绝对承诺。

## 新增数据与领域模型

第一阶段只基于现有 Evaluation 和本地交互输入，不新增外部数据源。

新增派生结构建议：

```ts
type CommercialSnapshot = {
  readinessScore: number
  positioning: string
  suggestedRateRange: { low: number; mid: number; high: number }
  strongestLever: string
  primaryRateBlocker: string
  nextMove: string
  confidence: 'high' | 'medium' | 'low'
}

type DealTermsInput = {
  deliverable: 'post' | 'series' | 'live' | 'ugc'
  paidUsage: 'none' | '30d' | '90d' | '12m'
  exclusivity: 'none' | '30d' | '90d' | '6m'
  platformScope: 'tiktok' | 'tiktok_reels' | 'multi'
  deliverySpeed: 'standard' | '7d' | '72h'
  quantity: 1 | 3 | 6
  revisions: 'standard' | 'additional'
}
```

`CommercialSnapshot` 为服务端评分的派生结果；不得让客户端根据可篡改数值重新计算报价。`DealTermsInput` 可由客户端选择，但最终报价计算需要使用服务端已验证的基础评估与版本化配置。

## PMF 验证与埋点

### 待验证假设

| 假设 | 指标 | 通过条件 |
|---|---|---|
| 创作者更在意报价而非估值 | 账号提交率、付费墙点击率 | 新定位比旧文案高 ≥30% |
| 单次 $9 谈判工具包可成交 | 完成支付 / 评估完成 | 目标用户中 ≥10% |
| 产出可用于真实行为 | Rate Card 生成或导出率 | 购买用户中 ≥40% |
| 30 天成长承诺有复访价值 | 30 天回访率 | 已购用户中 ≥20% |

### 关键事件

- `commercial_snapshot_ready`
- `suggested_rate_viewed`
- `deal_toolkit_paywall_viewed`
- `deal_toolkit_unlock_clicked`
- `terms_calculator_used`
- `rate_card_created`
- `rate_card_exported`
- `growth_plan_task_completed`
- `commercial_recheck_started`（后续阶段启用）

事件 metadata 仅保留匿名化账号标识、tier/readiness bucket、入口、工具版本和必要时长；不记录谈判内容、联系信息或敏感数据。

## 分阶段交付

### Phase 1：定位与报告重构

- 首页、SEO、CTA 改为 creator commercial growth 叙事；
- Commercial Snapshot；
- Price Your Next Deal；
- Rate Blockers；
- 30-Day Growth Plan 重组；
- 新免费/付费边界与埋点。

### Phase 2：Brand Deal Toolkit

- Deal Terms Calculator；
- Rate Card 生成、编辑、分享/导出；
- 服务器端报价计算与版本化配置；
- 完整端到端测试。

### Phase 3：持续价值（单独 SPEC）

- 月度复评；
- 商业准备度与报价趋势；
- 任务完成追踪；
- 订阅定价实验。

### Phase 4：数据飞轮（单独 SPEC）

- 用户明确同意后的匿名报价/成交反馈；
- 市场基准与模型校准；
- 数据治理、删除、导出与隐私策略。

## 验收标准

1. 用户从首屏能理解 TokValue 帮助其“报价、谈判、提高商业价值”，而非仅给账号估值。
2. 免费报告包含足够可信诊断，但不暴露完整谈判与行动工具。
3. 付费报告的核心价值可以在一句话内说清：报价、条款、30 天计划和 Rate Card。
4. 所有报价都列出假设、范围与不保证成交的说明。
5. Deal Terms Calculator 的基础报价由服务端已验证评估生成，规则有版本、可测试、可解释。
6. Phase 1 指标能够区分旧“估值”定位与新“商业成长/谈判”定位的转化差异。
