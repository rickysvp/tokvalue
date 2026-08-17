# 估值算法修复执行记录（2026-08-17）

> 前置：`docs/valuation-algorithm-audit-2026-08-17.md`（深度审计报告，6 大虚高根因 + 修复方案）

## 已实施的修复（全部 6 项，按审计方案）

### 修复 1：品牌报价重做（config.ts + valuation.ts）
- `TIER_PREMIUM`：`1.0/1.2/1.8/3.0/8.0` → `1.0/1.1/1.3/1.6/2.5`（砍名人溢价 8x）
- `BRAND_DEAL_LIMITS_BY_TIER.maxPerMonth`：nano 10→2、micro 8→4、mid 6→5（对齐真实成交率）
- `MIN_BRAND_DEAL_PRICE`（$100 统一）→ `MIN_BRAND_DEAL_PRICE_BY_TIER`（nano 30/micro 50/mid 80/macro+mega 100），新增 `getMinBrandDealPrice(tier)`

### 修复 2：IP 资产大幅下调 + 品牌信号门槛
- `TIER_IP_MULTIPLE`：mega 3→0.8、macro 1.5→0.5
- `calcIpBrandValue` 新增门槛：`brandingBonus <= 1.0`（无 founder/brand/crossPlatform/product/verified 信号）→ IP=0
- 效果：5M 金融号 IP 资产 $14.26M → $1.44M；无品牌信号的健身/娱乐号 IP 归零

### 修复 3：变现能力重做
- 删除错误的 `channelFactor = Σ(CHANNEL_WEIGHTS)`（权重求和当渠道数，重复放大 2-3 倍）
- `VALUATION_PERIOD_BY_TIER` 折半：mega 24→12、macro 18→9、mid 12→6、micro 6→4、nano 4→3
- 新增折现率 0.5 + 存活率（mega/macro 0.5，其余 0.4）
- `LIVE_GIFT_MULTIPLIERS` 全线降 10 倍

### 修复 4：粉丝资产重做
- `FOLLOWER_BASE_RATE`：`0.005/0.01/0.05/0.5/12.0` → `0.002/0.004/0.02/0.15/3.0`
- `commercialProximityMult` 无信号保底 0.6→0.2
- `PLAY_FAN_FACTOR_CLAMP.min` 0.3→0.1
- 新增僵尸号硬阈值：粉播比<0.02 且 ER<1% 且 ≥10万粉 → 粉丝资产 ×0.05

### 修复 5：去重 + 全局 cap
- 全局 cap：`GLOBAL_CAP_MULTIPLE` 30→8（对齐行业 6-8 月倍数）
- 修复 totalLow 不同步 cap 的 bug（新增 totalLow 对称 cap）

### 修复 6：风险折损加强
- `RISK_DISCOUNT.high` 0.7→0.4

## 验证结果
- `tsc --noEmit` 零错误
- Vitest 59/59 全通过（更新 2 个 micro 报价断言到新基线：tier premium 1.2→1.1 导致 -8.3%）

## 修复前后对比（probe 实测）

| 账号 | 修复前 | 修复后 | 变化 |
|------|--------|--------|------|
| 5K nano 生活号 | $13,739 | $1,352 | -90% |
| 200K 美妆号 | $458,966 | $198,865 | -57% |
| 900K 健身号 | $1,577,276 | $330,554 | -79% |
| 1.2M 健身号 | $4,174,686 | $769,730 | -82% |
| 5M 金融号(有品牌信号) | $25,719,473 | $5,344,903 | -79% |
| 2M 僵尸号 | $413,532 | $170,034 | -59% |

## 修改文件
- `lib/scoring/config.ts`（9 处参数改动 + getMinBrandDealPrice）
- `lib/scoring/valuation.ts`（品牌报价保底、变现能力重做、IP 门槛、粉丝资产、全局 cap、风险折损）
- `lib/scoring/valuation.test.ts`（2 个 micro 报价断言更新）
- 新增 `docs/valuation-algorithm-audit-2026-08-17.md`（审计报告）
