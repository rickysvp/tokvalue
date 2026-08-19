# TokValue 产品 Spec v2.0（定位重构版）

> 版本：v2.0 | 日期：2026-08-19
> 本版替代 v1 spec，融合全部已确认决策点（D1–D10）与补充风险项（防作弊 / 合规 / 抵扣规则）。

---

## 0. 决策记录（D1–D10，已拍板）

| # | 决策点 | 结论 |
|---|---|---|
| D1 | 账号所有权 | **不验证、不绑定**。任何人可分析任何公开账号。免费额度只绑定 TokValue 用户（验证邮箱），与 TikTok 账号无关 |
| D2 | 注册时机 | **注册前置**。邮箱验证码（免密）注册完成前不发起任何 Review；Landing 的 username 输入框仅做承接展示，不触发 API |
| D3 | 立即付费 | 免费 Review = **Teaser 报告**（部分开放）+ $9 立即解锁完整报告。解锁零边际成本，转化发生在价值感峰值时刻 |
| D4 | 报告融合 | 内部保留现有 10 维加权评分引擎与美元估值体系，对外重构为 **6 支柱 + 专业价值层级**（Premium / Growth / Developing / Early Value），色值继续读 `lib/tier.ts` 的 `TIER_COLORS` |
| D5 | 频率限制 | 所有套餐统一：**同一（用户, 账号）对 24 小时内最多 1 次 Review**，不做 Pro 6h 特例 |
| D6 | 幂等与并发 | 客户端幂等键 + 数据库唯一约束 + in-flight 部分唯一索引 + 惰性超时对账（详见 §14） |
| D7 | 数据模型 | 额度改为 **Entitlement 账本**（事件溯源），删除冗余计数列；分享 token 默认 30 天有效；MVP 每用户 1 个账号 |
| D8 | 成本 | MVP 分析层 **全规则引擎（AI 成本 $0）** + 24h 全局快照缓存。单次 Review 变动成本 ≤ $0.10，毛利率 >98%（测算见 §11.5） |
| D9 | 支付 | **Creem（MoR）**：3 个商品 + Webhook + Discount Code 实现升级抵扣 + Customer Portal 承接取消/发票（详见 §10.6） |
| D10 | Baseline | 首次 Review 无对比数据，进入 **基线模式**展示（详见 §8.4） |

被本版明确废止的旧约束：
- ~~"所有套餐权益相同不分层"~~ → Creator/Pro 明确分层（用户已确认）。
- ~~定价命名 Single/Growth/Studio~~ → 新 SKU 体系（见 §3）。

继续有效的旧约束：颜色一律读 `TIER_COLORS`；定价文案用评估次数（Review 额度）不用点数；不出现退款承诺（抵扣规则中的"不兑现、不找零"属抵扣条款，不属退款政策）；不虚构未实现功能（竞品比较只出现在 P1 路线图，不写入 Pro 权益）；TikTok API 多供应商轮换（`TIKTOK_PROVIDERS`）+ 指数退避重试。

---

## 1. 产品定位

### 一句话定义

> TokValue 是面向 TikTok 创作者的商业价值增长平台。用户主动发起 Account Review，TokValue 获取公开数据、评估账号商业价值、诊断增长瓶颈、给出可验证的成长任务。

### 核心承诺

> 每次复盘，创作者都更清楚：账号值多少钱、为什么值这些钱、下一步如何更值钱。

### 产品边界

**做**：公开数据获取 / 商业价值评估 / 内容表现分析 / 成长诊断 / 成长任务 / 历史报告 / Creator Profile / Rate Card（P1）/ 订阅与额度管理。

**不做**：视频剪辑 / 视频生成 / 自动发布 / 点赞评论关注等模拟行为 / 自动持续抓取 / 品牌撮合市场 / TikTok Shop 深度运营 / 多平台管理。

### 合规声明（D-补充风险3，必须实现）

1. **数据来源声明**：所有页面页脚、报告页、估值页统一展示：

```text
Data sourced from publicly available TikTok content via third-party providers.
TokValue is not affiliated with TikTok.
```

2. **用户协议条款**：用户使用即同意「分析结果仅用于个人账号运营参考，不得用于大规模数据采集或商业倒卖」。
3. **供应商抽象层**：`TikTokProviderAdapter` 接口化（现有 `lib/tiktok.ts` 多供应商轮换机制保留并 formalize），任何供应商可热切换，不停摆。

---

## 2. 目标用户

**核心**：5,000–100,000 粉丝、持续发布、有播放量、想接品牌合作或提高报价、无经纪人团队、不知道账号商业价值的 TikTok 创作者。

**注意**：由于 D1（不验证所有权），实际使用者还包含「分析别人账号」的场景（品牌方看创作者、竞品研究）。该场景不做产品化支持，但不得报错——任何人分析任何账号都能得到完整报告，付费规则与本人分析完全一致。

**核心问题**：

```text
我现在的账号值多少钱？
为什么是这个价值？
哪些内容提高了我的商业价值？
我下周应该做什么？
如何让品牌更愿意找我？
```

---

## 3. 商业模式与 SKU

### 3.1 产品单位：Account Review

一次 Review = 获取最新公开数据 → 对比历史快照 → 内容表现分析 → 更新估值与评分 → 生成复盘报告 → 生成成长任务。

界面语言只用 **Account Review**，内部计量沿用 credits 机制改造为 Entitlement 账本（§13）。

### 3.2 SKU 结构

| SKU | 价格 | 得到什么 | 备注 |
|---|---:|---|---|
| First Review | $0 | 1 次生成 + **Teaser 访问**（见 §3.3） | 每验证邮箱限 1 次 |
| Full Report Unlock | $9 | 将最近一份 Teaser 报告升级为完整访问；若无 Teaser 则立即发起一次完整 Review | 购买即时消耗，**MVP 不囤积** |
| Creator | $19/月 | 每周期 4 次完整 Review + 全部商业资产 | 主推 |
| Pro | $39/月 | 每周期 12 次完整 Review + 深度分析（长历史对比、估值分项深析、高级 Profile） | 定价页弱化展示（补充建议），主推 Creator + 单次 |

**$9 单一商品、内部自动分支**（避免两个 $9 SKU 造成困惑）：

```text
用户支付 $9
  ├─ 最近一份报告 access_level = teaser → 解锁该报告（不重新拉数据，零边际成本）
  └─ 否则 → 立即发起一次新的完整 Review
```

**囤积与有效期**：MVP 的 $9 购买即时消耗，无库存概念 → 无囤货风险。"额外购买 Review 额度（可囤积，90 天有效期）" 放入 P1。

### 3.3 免费边界（D3 核心：部分开放而非全部）

**Teaser 可见（证明产品值钱）**：

- 商业价值区间完整展示（如 $18,400 – $26,700）+ 置信度
- 价值层级（Premium / Growth / Developing / Early Value）
- 本次最大增长瓶颈 + 一句话原因
- Top 3 表现最好视频
- 成长任务 #1 的标题（仅标题）

**Teaser 锁定（半遮罩预览，付费解锁）**：

- 估值四大分项拆解（Brand Deal / Content / Audience / Growth − 风险折扣明细）
- 6 支柱完整评分值 + 每项归因说明（支柱名称可见、数值与原因模糊）
- Bottom 3 视频及原因
- 成长任务 #2–#3 及全部证据链 / 预期影响 / 验证指标
- 增长计划追踪（任务勾选完成）
- PDF 下载 / 分享链接 / Creator Profile

**转化 CTA（Teaser 报告底部，单一付费墙）**：

```text
主：Unlock your full report — $9（一次性）
次：Get monthly reviews — Creator $19/mo
```

### 3.4 升级抵扣（D-补充风险4，规则定死）

- $9 单次支付后 **30 天内** 首次订阅 Creator：首月立减 $9（经 Creem Discount Code 实现，见 §10.6）。
- **每用户终身最多抵扣 1 次**；仅抵首月订阅费；不叠加、不兑现、不找零、不转赠。
- 过 30 天不抵扣，资格自动失效，无提醒补偿。
- 订阅自支付成功立即生效，周期从支付日起算（如 Aug 19 付款 → 本周期 Aug 19 – Sep 18，额度 Sep 19 重置）。

---

## 4. 核心用户流程

### 4.1 首次（注册前置，D2）

```text
Landing（username 输入框仅承接，不调 API）
  ↓ 点击 Analyze → 无 session → 注册（邮箱验证码，复用现有 verify-code + JWT）
  ↓ Dashboard 输入 TikTok username
  ↓ 确认 Free First Review（展示将消耗唯一免费额度）
  ↓ RapidAPI 获取公开数据 → 生成报告
  ↓ 查看 Teaser：价值区间 / 层级 / 瓶颈 / Top3 / 任务#1标题
  ↓ 付费墙：$9 解锁完整报告 或 Creator 订阅
  ↓（付费后自动平滑滚动至解锁区，沿用现有交互约定）
```

### 4.2 后续

```text
Dashboard → 查看剩余额度 → [Update my account]
  ↓ 冷却检查（同账号 24h，D5）
  ↓ 确认消耗 1 次 Review
  ↓ 新数据 vs 上次快照 → 价值/评分变化
  ↓ 完成成长任务 → 下次 Review 验证变化
```

---

## 5. 额度与频率规则

### 5.1 额度周期

按账单周期重置（非自然月）：

```text
订阅开始：August 19 → 当前周期 August 19 – September 18 → 额度重置 September 19
```

### 5.2 频率限制（D5 统一）

- **同一（用户, TikTok 账号）对：24h 内最多 1 次 Review**（所有套餐一致，含免费与 $9）。
- 冷却提示（补充建议文案，解释原因而非单纯倒计时）：

```text
Next review available in 8 hours.
Frequent updates won't improve analysis accuracy —
we recommend reviewing once a week for clear growth tracking.
```

- 全局数据新鲜度由 **24h 快照缓存** 治理（§11.2）：任何账号 24h 内被任何人 Review 过，后续 Review 直接复用快照（报告如实标注 `Data refreshed Xh ago`）。不同用户互不阻塞。

### 5.3 扣费规则

**只有 Review 成功完成才消耗额度。** 以下不扣费：RapidAPI 失败 / 用户名不存在 / 字段严重缺失 / 分析失败 / 报告生成失败 / 超时 / API 不可用。注意：**缓存命中的 Review 照常消耗额度**（用户获得了完整报告价值，只是我们的成本为零）。

### 5.4 并发控制

- 同一（用户, 账号）同时最多 1 个进行中 Review（数据库层强制，§14.2）。
- 幂等键防双击 / 网络重发（§14.1）。
- 失败自动释放额度；成功后才最终记账。

---

## 6. Dashboard 信息架构

```text
TokValue
├── Overview
├── Growth Plan（付费功能）
├── Reports
├── Tools
├── Billing
└── Settings
```

MVP 不设独立 Content 页；内容数据经 Overview 与 Reports 呈现。

### 顶部全局区域

```text
@creatorname · 2 reviews remaining · Last reviewed: Aug 19, 2026
[Update my account]  （冷却中 → Next review available in 8 hours + 建议文案）
```

### Overview 首屏（补充建议：做减法，只保留 4 模块）

1. **商业价值卡**（区间 + 变化幅度 + 置信度）
2. **本周核心问题 + 最多 3 个任务**
3. **额度卡片**（剩余次数 / 重置日 / Update 按钮）
4. **核心评分简览**（6 支柱名称 + 状态词，完整数值进报告）

Top/Bottom 视频、完整诊断**折叠进「View full report」**，保证 5 秒抓到核心。

---

## 7. 分析报告体系（D4：现有系统与新定位融合）

### 7.1 双层评分架构

**内层（计算层，复用现有资产，不重写）**：

- `lib/scoring/dimensions.ts` 的 10 维加权引擎（reach 0.20 … stability 0.03）
- `lib/scoring/valuation.ts` 美元估值 + `lib/scoring/verdict.ts` 层级判定
- 高粉低互动风控保留：粉丝 ≥ 10万 且 playFanRatio < 0.05 → 自动降一层 + 品牌年收入倍数上限 30x → 3x
- 评分维度基线按 playFanRatio 折减、stability 低互动扣 15–25 分等既有逻辑全部保留

**外层（展示层，新增映射）**：

| 展示支柱 | 内部来源维度 |
|---|---|
| Growth Momentum | 粉丝增速 + 近期动量 |
| Content Consistency | 发布节奏 + stability |
| Audience Quality | 互动率（playFanRatio）+ 受众真实度 |
| Niche Clarity | 主题集中度（hashtag 聚类，MVP 不用 LLM） |
| Brand Readiness | commerce + monetization + influence |
| Risk Score | 风控检测项汇总 |

每支柱展示 `名称 + 分值 + 状态词（Strong / On track / Needs attention）`，点击展开归因（哪些视频/指标导致）。

### 7.2 价值层级（替代 S–F 字母标签，沿用既有偏好）

```text
Premium Value / Growth Value / Developing Value / Early Value
```

色值一律读 `TIER_COLORS`（硬约束）。历史报告中的旧字母层级**保持原样不回写**（不篡改历史）。

### 7.3 报告三层结构（融合现有付费墙分层）

```text
L1 公开层（Teaser 免费）
  ├ 价值区间 + 置信度 + 价值层级
  ├ 最大瓶颈 + 一句话原因
  ├ Top 3 视频
  └ 任务 #1 标题

L2 解锁层（$9 / 订阅）
  ├ 估值四分项 + 风险折扣明细（可解释估值）
  ├ 6 支柱完整评分 + 归因
  ├ Bottom 3 视频 + 原因
  ├ 全部任务（证据链 / 预期影响 / 验证指标）
  └ 数据质量与置信度说明

L3 商业资产层（$9 / 订阅）
  ├ PDF 下载（客户端生成，零服务器成本）
  ├ 分享链接（30 天默认有效）
  ├ Creator Profile
  └ Rate Card 区间（P1）
```

现有 `PaidWall / PaidWallModal`（mode: 'evaluate' | 'unlock'）演化为 L2/L3 统一解锁门，三层合并为一个付费墙的约定保留。

### 7.4 估值模型 v2（补充建议落地）

```text
Estimated Business Value
= Brand Deal Potential
+ Content Distribution Potential
+ Commerce Potential
− Risk Discount（显式百分比）
```

- **风险折扣可解释**：`discount = min(40%, RiskScore × 0.75%)`，报告中明示：

```text
Risk adjustment: −18% (Risk Score: 24)
```

- **置信度决定区间宽度**（避免低数据量却给窄区间的伪精确）：

| 置信度 | 区间宽度 |
|---|---|
| Medium-High | ±15% |
| Medium | ±20% |
| Medium-Low | ±25% |
| Low | ±30% |

- 置信度由：有效视频数、数据覆盖时长、字段完整性、主题识别稳定性、异常爆款存在性、API 质量共同决定（沿用现有判定，落入四档）。

### 7.5 必备免责声明（所有估值页显示）

```text
This is an estimated commercial value range based on publicly available
third-party data and TokValue's internal model. It is not a guaranteed
sale price, income forecast, or official TikTok metric.
```

---

## 8. Baseline 模式（D10）

首次 Review 无对比数据：

- 隐藏全部 `since last review` 变化标记。
- 价值卡显示：

```text
This is your baseline review.
Future reviews will track changes in value, scores, and content performance.
```

- 任务标注 `Baseline calibration`。
- 第 2 次 Review 起解锁对比；第 3 次起显示 30 天趋势。

---

## 9. Growth Plan（付费功能）

### 任务结构

```text
Task title
Why this matters
Data evidence（关联具体视频/评分）
Expected impact（影响哪些支柱）
Next review will measure: [Niche Clarity ↑]   ← 补充建议：效果验证预期
Confidence
Status + [Mark as complete]
```

### 生成数量

| 有效视频数 | 任务数 | 置信度 |
|---:|---:|---|
| 0–4 | ≤1 | Low |
| 5–9 | ≤2 | Medium-Low |
| 10–29 | 2–3 | Medium |
| 30+ | 3–5 | Medium-High |

同时校验：数据覆盖天数 / 主题数 / 时间跨度 / 是否单条异常爆款。

### 生成原则

- MVP 用**规则模板引擎**（D8：AI 成本 $0），模板参数全部来自真实数据。
- 必须关联具体视频或评分；一周内可执行；下次 Review 可验证；不承诺播放量或收入。
- 禁止泛化建议（Keep posting consistently 之类）。
- 数据不足提示：`Suggestions are based on your public content. Limited data may reduce recommendation quality.`

---

## 10. Billing 与 Creem 支付方案（D9）

### 10.1 Creem 商品配置

```text
Product 1: Account Review（one-time, $9）
Product 2: Creator（subscription, $19/month）
Product 3: Pro（subscription, $39/month）
```

Creem 作为 MoR 处理全球税务/账单，TokValue 不接触税务合规。

### 10.2 Checkout 流程

```text
用户点击付费
  → 后端创建 Creem Checkout（prefill email、metadata 带 user_id + sku + review_id）
  → 跳转 Creem 托管收银台
  → 支付成功：success_url 回站 + Webhook checkout.completed
  → Webhook 验签通过后：写 Purchase + 发放 Entitlement / 解锁报告
  → 前端轮询 GET /billing 状态刷新（不依赖 redirect 可靠性）
```

**权益发放以 Webhook 为唯一事实源**；success_url 只做 UI 引导，未收到 Webhook 前界面显示 "Processing your payment…"。

### 10.3 Webhook 事件处理

```text
checkout.completed          → 发放额度 / 解锁报告 / 记 Purchase
subscription.active         → 激活订阅 + 初始化周期额度
subscription.renewed        → 周期滚动 + 额度重置
subscription.updated        → 升降级处理（Creator↔Pro）
subscription.canceled       → 标记取消（周期末失效）
subscription.payment_failed → 标记 dunning 状态 + 邮件提醒
refund.created              → 冲销对应 Entitlement
```

全部验签、幂等（event_id 去重）、落 `Purchase` 表（provider_payment_id 唯一）。

### 10.4 升降级

- **Creator → Pro**：调 Creem 订阅更新 API（按比例折算）；若供应商暂不支持 proration，降级为「本期末生效切换」，二者都在 UI 明示。
- **降级（Pro → Creator）**：本期末生效，本期额度不变。
- **$9 抵扣订阅**：用户在 $9 支付后 30 天内点升级 → 后端校验资格（终身 1 次）→ 调 Creem Discounts API 生成一次性 $9 折扣码（绑定该用户 checkout）→ 用户进入打折 Checkout。规则见 §3.4。

### 10.5 取消订阅

- 站内先弹原因收集（价格太高 / 数据不准 / 建议无用 / 频率低 / 暂不需要 / 其他），**不设挽留强拦截**。
- 确认后跳转 **Creem Customer Portal** 完成取消（MVP 不自建取消/换卡/发票页）。
- 取消后本期额度用完为止，周期末降级为无订阅状态（历史报告保留可看）。

### 10.6 Billing 页面

```text
Current plan / 额度使用（X used / Y included, resets DATE）
$9 抵扣资格（如适用：Upgrade to Creator — first month $10）
购买单次 Review（$9, 即时消耗）
付款记录（站内列表 + Portal 账单详情外链）
```

---

## 11. 数据服务与成本（D8）

### 11.1 数据管道（现有架构保留 + formalize）

```text
TikTokProviderAdapter（多供应商轮换，TIKTOK_PROVIDERS=host1:key1,host2:key2）
  → Response Validator → Data Normalizer
  → Snapshot Storage（24h 全局缓存）
  → Metrics Engine（lib/scoring/*）
  → Valuation Engine → Report Generator（规则模板）
```

- 重试策略沿用：5xx/网络/JSON 失败指数退避 2 次（600ms→1500ms）；`USER_NOT_FOUND / INVALID_USERNAME` 立即抛出不重试。
- 供应商适配器模式保留（如 tiktok-api23 的 GET /api/user/info?uniqueId=）。
- 每次调用记录：review_id / endpoint / 耗时 / http_status / fields_received / fields_missing / error_code / estimated_cost。

### 11.2 24h 全局快照缓存

- Key：`platform_user_id`（sec_uid，**不用 username**——TikTok 用户名可改）。
- 任何账号 24h 内被拉取过 → 后续 Review 复用快照，不再调 API。
- 报告如实标注数据新鲜度；该机制预计降低 30–50% API 调用（热门账号被多人分析时近乎零成本）。

### 11.3 数据质量

检查项：profile exists / username valid / followers numeric / video list exists / video count sufficient / video metrics valid / timestamps valid。

**字段缺失策略**：`saves` 等公开接口常缺字段视为「缺失」而非 0；降低置信度、加宽估值区间、减少任务数、页面明示：

```text
Some data could not be retrieved. This review is based on partial public data.
```

### 11.4 API 熔断

- 用户级：每用户每日 Review 上限 = 套餐额度（天然上限）。
- 免费层：每 IP 24h 免费生成 ≤ 2 次（复用 `free_rate_limits` 表 + `IP_HASH_SECRET` HMAC + 原子 upsert，沿用现有实现）。
- 系统级：日免费 API 预算 $10 / 月免费 API 预算 $150 → 触达后**免费 Review 排队暂停**（付费不受影响）；系统月总成本硬顶 → 全站 Review 降级只读。
- 供应商级：RapidAPI 配额阈值 + 连续失败阈值熔断切换下一供应商；TokValue 服务层独立计量，不依赖 RapidAPI 自身告警。

### 11.5 成本测算结果（D8 结论）

**单次 Review 变动成本**：

| 项 | MVP 成本 |
|---|---|
| RapidAPI（2–3 次调用） | $0.01–0.05（缓存命中 $0） |
| AI 分析 | **$0**（规则引擎 + 模板任务，复用 lib/scoring） |
| PDF | $0（客户端打印生成） |
| 存储/报告 | ≈$0（Neon 压缩快照，90 天清理原始响应） |
| **合计** | **≤ $0.10/次（均值 ~$0.03）** |

**月度测算（假设 1,000 注册 / 5% 付费转化）**：

```text
免费 Review：1000 × $0.03 × (缓存折减~40%) ≈ $18–30
付费 Review：~60 次 × $0.05 ≈ $3
Vercel Pro $20 + Neon $0–19
─────────────────────────────
月总成本 ≈ $40–70
```

**结论**：付费 Review COGS < $0.10 → **毛利率 > 98%**；免费获客成本 ≈ **$0.02–0.05/人**；最坏刷子场景被 IP/预算双闸封顶（月免费成本硬顶 $150）。成本不构成风险，模式成立。

---

## 12. 免费额度防作弊（D-补充风险2）

```text
主规则：每个已验证邮箱 = 1 次免费 Review（FreeReviewGrant 表，user_id 唯一）
辅规则：同一归一化 username 全网免费生成 ≤ 1 次（防同账号反复薅 API）
兜底：  同一 IP（HMAC 哈希）24h 免费生成 ≤ 2 次
入口：  邮箱未验证不能发起任何 Review（复用现有验证码流程）
```

- **username 归一化**：小写 + 去首尾空格 + 去特殊字符后查重（`normalized_username` 列）。
- 辅规则不阻断「分析任何账号」：缓存命中时服务既有的 24h 快照，不消耗免费生成次数。
- 异常批量注册特征（同 IP 段高频 + 邮箱模式）→ 直接拦截注册，人工申诉解锁。

---

## 13. 数据模型 v2（D7）

```text
User
- id, email(unique), email_verified_at, name, timezone, currency, created_at

FreeReviewGrant                     ← 免费额度唯一事实源
- id, user_id(unique), normalized_username, ip_hash, granted_at, review_id

CreatorAccount                      ← 「用户 × 被观察账号」，非所有权
- id, user_id, platform, platform_user_id, normalized_username
- profile_url, status, last_reviewed_at
- UNIQUE(user_id, platform_user_id)
- MVP 约束：每 user 最多 1 条 active

AccountSnapshot
- id, creator_account_id, collected_at
- profile_metrics, content_metrics, score_metrics, valuation_metrics  (JSON 明细)
- followers, avg_views, engagement_rate          ← 补充建议：核心查询字段独立成列
- valuation_low, valuation_high, confidence_level, data_quality, model_version

Video
- id, creator_account_id, platform_video_id, caption, video_url, thumbnail_url
- published_at, views, likes, comments, shares, saves(nullable), content_tags, commercial_tags

AccountReview
- id, user_id, creator_account_id, purchase_type, source, status
- idempotency_key                    ← D6：UNIQUE(creator_account_id, idempotency_key)
- state_entered_at                   ← 超时对账依据
- requested_at, completed_at, snapshot_id, report_id, failure_reason
- access_level: 'teaser' | 'full'    ← D3

Partial unique index: creator_account_id WHERE status IN
('requested','quota_reserved','fetching_data','analyzing','report_generating')

Purchase
- id, user_id, type, provider('creem'), provider_payment_id(unique), provider_event_id
- amount, currency, status, review_id, created_at

Subscription
- id, user_id, plan, status, creem_subscription_id
- billing_period_start, billing_period_end, included_reviews
- （无 used_reviews 冗余列 → 由账本推导，吸取 checkCreditConsistency 教训）

ReviewEntitlement                    ← 额度账本（事件溯源，替代 credits 余 nmis账户）
- id, user_id, source('free'|'one_time'|'subscription')
- granted_at, expires_at(nullable), status('active'|'consumed'|'expired'|'revoked')
- review_id(nullable), billing_period_id(nullable)
- 消耗沿用 consumeCredit 的单条件 UPDATE + 影响行数校验防竞态

Report
- id, user_id, creator_account_id, review_id, type, status
- valuation_low, valuation_high, confidence_level
- share_token(32B 随机不可逆), share_status('off'|'active'), share_expires_at(默认+30天)
- 用户可手动延长或关闭；不提供永久公开链接
- created_at, data_cutoff_at

GrowthTask
- id, report_id, title, reason, evidence, expected_impact, measure_target
- confidence_level, status, completed_at

UsageEvent                           ← 全部计量事件流水（含 quota_consumed/released）
- id, user_id, review_id, purchase_type, event_type, units, created_at
```

```text
purchase_type: free_trial | one_time | subscription
source: free_entitlement | one_time_purchase | subscription_quota | snapshot_cache
```

对账规则：`Subscription 剩余额度 = included_reviews − COUNT(UsageEvent WHERE period AND type=quota_consumed)`；后台每日对账任务，不一致告警（沿用既有 admin 日志体系）。

---

## 14. API v2 与状态机（D6）

### 14.1 幂等设计

- 客户端每次发起生成 uuid `idempotency_key`，随 `POST /accounts/:id/reviews` 提交。
- 服务端 `INSERT ... ON CONFLICT (creator_account_id, idempotency_key) DO NOTHING`；冲突 → 直接返回已存在的 Review（200，不重复扣费）。
- 双击 / 网络重发 / 弱网重试全部天然幂等。

### 14.2 并发锁

- 上述 partial unique index 保证同一账号同时只有一个 in-flight Review。
- INSERT 违反唯一索引 → 返回 `409 { in_flight_review_id }`，前端引导查看进行中的 Review。

### 14.3 状态机（修订版）

```text
requested → quota_reserved → fetching_data → data_saved
          → analyzing → report_generating → completed（终态）

任意活跃态 → failed（终态，自动 quota_released）
```

- `quota_consumed / quota_released` 为 UsageEvent 事件，**不再是状态**。
- 各状态 TTL：quota_reserved 5m / fetching_data 90s / analyzing 180s / report_generating 120s。
- **惰性对账**：`GET /reviews/:id` 时若 `now − state_entered_at > TTL` → 判 failed + 释放额度（Serverless 友好，不依赖 cron；可选 cron 兜底扫描）。

### 14.4 API 清单

```text
POST /api/auth/request-code        ← 邮箱验证码（复用现有）
POST /api/auth/verify-code         ← 验证 + 签发 JWT session（复用现有）

POST /api/accounts                 （MVP 限 1 个活跃账号）
GET  /api/accounts/:id
POST /api/accounts/:id/reviews     { idempotency_key }
GET  /api/reviews/:id              ← 新增：状态轮询（前端进度展示）
GET  /api/accounts/:id/snapshots
GET  /api/accounts/:id/reports

GET  /api/growth-plan
POST /api/growth-tasks/:id/complete

GET  /api/usage
GET  /api/billing
POST /api/billing/checkout/one-time
POST /api/billing/checkout/subscription   { plan: creator|pro, discount?: auto }
POST /api/billing/portal           ← Creem Customer Portal 跳转
POST /api/webhooks/creem           ← 验签 + event_id 幂等

POST /api/reports/:id/share        { days: 30|90 }
DELETE /api/reports/:id/share
```

### 14.5 发起 Review 完整检查序

```text
1  JWT 鉴权（沿现有 evaluate 路由顺序：鉴权先于缓存检查）
2  幂等键检查
3  邮箱已验证
4  CreatorAccount 归属校验
5  免费额度 / 订阅额度 / $9 使用权判定
6  （用户,账号）24h 冷却检查
7  in-flight 并发锁
8  免费路径：邮箱唯一 + username 归一化辅规则 + IP 兜底
9  锁定额度（quota_reserved）
10 命中 24h 快照缓存？→ 跳过 API；否则 RapidAPI 拉取
11 数据校验 → 存 Snapshot → 分析 → 生成报告
12 成功：quota_consumed + 返回报告
13 失败：failed + quota_released
```

---

## 15. 产品埋点

```text
激活：signup_completed / email_verified / tiktok_username_submitted / account_found
     free_review_started|completed|failed / teaser_viewed
     paywall_viewed(mode=unlock|evaluate) / dashboard_viewed / growth_plan_viewed

购买：pricing_viewed / one_time_checkout_started / unlock_completed
     subscription_checkout_started|started|upgraded|downgraded|cancelled|renewed
     payment_failed / discount_code_applied

Review：review_started|quota_reserved|completed|failed|quota_released
      rapidapi_request_started|partial_response|failed / cache_hit
      report_viewed|full_unlocked

行为：growth_task_viewed|completed / report_downloaded|shared
     creator_profile_created|shared / second_review_started / portal_visited

属性：user_id, creator_account_id, plan, purchase_type, review_id,
     billing_period, remaining_reviews, data_sample_size,
     confidence_level, valuation_low, valuation_high, access_level
```

---

## 16. 核心假设与验证门槛（新增阈值，避免假设无法证伪）

| 假设 | 内容 | 达标线 | 告警线（触达即重议） |
|---|---|---|---|
| H1 价值付费 | 愿为一次完整 Review 付 $9 或订阅 | 免费→付费 ≥ 4% | < 2% |
| H2 产品价值 | 理解并认可估值/评分/任务 | 报告页停留 ≥ 90s；"建议有帮助"反馈 ≥ 50% | 停留 < 30s |
| H3 行动价值 | 付费用户完成 ≥ 1 任务 | 任务完成率 ≥ 30% | < 10% |
| H4 重复价值 | 下周期再次发起 Review | 第二次 Review 发起率 ≥ 15% | < 5% |
| H5 订阅价值 | 订阅 LTV > 单次用户 | 订阅次周期续费率 ≥ 60%；免费→订阅 ≥ 2% | 续费 < 40% |
| H6 商业输出 | 下载/分享/Profile 使用 | 付费用户资产使用率 ≥ 25% | < 8% |

**留存判断**（沿用 v1 修正）：不以 30 天登录率为准，看四个行为——再次 Review / 完成任务 / 续订 / 报告产生商业动作。

**获客**：MVP 依赖自然流量 + 创作者社区分发 + 现有 blog/SEO 资产；付费投放暂缓，H1 验证后再启动。

---

## 17. P0 / P1 / P2

### P0（上线必需）

- 注册（邮箱验证码，复用现有）+ Landing username 承接
- 免费首次 Review（Teaser 边界 §3.3）+ 免费防作弊三闸（§12）
- $9 即时消耗（解锁 / 新 Review 双分支）
- Creator / Pro 订阅（Creem Checkout + Webhook + Portal 取消）
- Review 状态机 + 幂等 + 并发锁 + 失败不扣费
- 24h 快照缓存 + 数据质量检查 + API 调用记录
- Overview（首屏 4 模块）+ Baseline 模式
- 估值区间（置信度宽度）+ 风险折扣显式化 + 6 支柱评分 + 价值层级
- Top3/Bottom3 视频 + 最多 3 个规则引擎任务 + Growth Plan 页
- 报告列表 / 查看 / 客户端 PDF / 30 天分享链接
- Billing 页 + $9 抵扣（Discount Code）
- 邮件：Review 完成 + Day-10 召回（"Your value may have changed"）
- 合规：页脚声明 + ToS 条款 + 供应商抽象层
- 埋点（§15 全量）

### P1

- 完整 Content 页 / 高级 Media Kit / Rate Card 完整版 / 月度报告 / 90 天目标追踪
- 竞品比较（Pro 权益正式上线）
- 额外 Review 囤积购买（90 天有效期）
- Day-24 额度重置提醒 / 任务提醒邮件 / 通知设置
- 多账号 / 品牌匹配 / 商单 CRM

### P2

- Agency 工作区 / 多平台 / 品牌市场 / 开放 API / TikTok Shop 深析 / 商业收入追踪

---

## 18. 现有系统迁移计划

| 现有资产 | 处理 |
|---|---|
| `lib/auth.ts` 邮箱验证码 + JWT | 保留，即 §14 auth 接口；`/auth/signup /login` 以免密流程实现 |
| `lib/scoring/*`（10 维 + 估值 + verdict） | 全保留为计算层；新增 pillar 映射层对接 6 支柱展示 |
| `lib/tier.ts` `TIER_COLORS` | 保留；层级标签改 Premium/Growth/Developing/Early Value；历史报告旧标签不回写 |
| `lib/tiktok.ts` 多供应商轮换 + 退避重试 | 保留，formalize 为 `TikTokProviderAdapter` 接口（合规抽象层） |
| `lib/rate-limit.ts` + `free_rate_limits` 表 + `IP_HASH_SECRET` | 复用为免费 IP 兜底闸（2 次/24h） |
| `lib/credits*.ts` credits 体系 | 改造为 ReviewEntitlement 账本；`consumeCredit` 单条件 UPDATE 防竞态模式保留 |
| 现有用户 credits 余额 | 迁移为 one_time Entitlement，1 credit = 1 次完整 Review，迁移日起 90 天有效 |
| Single/Growth/Studio 存量订阅 | 冻结保留（Grandfather）至取消；新购买只走新 SKU；续费时引导切换 Creator/Pro |
| `PaidWall / PaidWallModal`（mode prop） | 演化为 L2/L3 统一解锁门，解锁后平滑滚动至解锁区交互保留 |
| `app/history`、Recently Evaluated、share 页 | 保留；新增报告类型字段区分新旧模板，旧报告沿用旧布局 |
| `app/api/evaluate` 路由执行序（鉴权→缓存→扣额） | 顺序保留，对接新额度账本与状态机 |
| blog / SEO 资产 | 保留，作为 MVP 自然流量来源 |

---

## 19. 用户体验原则

**透明**：每次 Review 是否收费 / 剩余次数 / 重置时间 / 数据来源与新鲜度 / 估值是估算 / 数据是否完整——全部可见。

**可解释**：每个评分和任务回答——为什么？基于哪些数据？该做什么？下次如何验证？

**不过度承诺**：禁用保证涨粉/爆款/合作/收入/账号售价；只用 Estimated / Potential / Based on public data / Medium confidence / Suggested next action。

**合规出镜**：估值页免责声明 + 全站页脚数据来源声明，二者不可遗漏。

---

## 20. 最终产品闭环

```text
注册（邮箱验证码）
  ↓ 免费首次 Review（Teaser：价值区间 + 瓶颈 + Top3 + 任务#1）
  ↓ 价值感峰值 → $9 解锁完整报告（零边际成本转化）或 Creator 订阅
  ↓ 查看估值分项 / 6 支柱归因 / 全部任务（含验证指标）
  ↓ 执行任务 → Day-10 召回邮件
  ↓ 再次 Review → 对比价值与评分变化 → 验证任务效果
  ↓ 持续订阅 → 周期性复盘 → Creator → Pro 升级
```

---

## 最终定义

> **TokValue 是订阅制 TikTok 创作者商业价值增长平台。注册后可免费完成一次 Teaser 复盘（价值区间 + 核心瓶颈）；$9 立即解锁完整报告或发起新复盘；Creator $19/月（4 次）、Pro $39/月（12 次）获得周期性完整复盘额度。任何人可分析任何公开账号；数据来自第三方公开接口；每次 Review 产出可解释的商业估值、6 支柱评分与可验证的成长任务。**

```text
商业模式：Free Teaser → $9 Unlock/Review → Creator $19 → Pro $39
转化主线：免费价值证明 → 峰值即时解锁 → 周期复盘订阅
需验证：  用户是否从免费 Teaser 走向 $9 解锁，再走向持续订阅（H1 门槛 4%）
```
