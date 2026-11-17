# Marketplace 数据真实化 + Sell 页转化重构 设计 Spec

- 日期：2026-11-17
- 状态：方案已获用户确认（范围 = A + 成交价/降价历史）
- 范围：`/marketplace` 演示库存重建、卡片信息密度、排序与筛选；`/sell` 页面三段式重构。

## 1. 背景：当前数据为什么不真实（实测）

线上 `marketplace_listings` 仅 8 条（6 active / 2 sold），全部由 `scripts/seed-marketplace-demo.mjs` 手写 `snapshot_*` 字段生成。

| handle | 粉丝 | ER | 层级基准 | ER/基准 | 叫价 | 估值中值 | 叫价/中值 | 年龄 |
|---|---|---|---|---|---|---|---|---|
| glowbysofia | 240K | 7.2% | 2.5% | 2.88x | $14,500 | $24,000 | 60.4% | 26d |
| fitwithdana | 185K | 6.8% | 2.5% | 2.72x | $9,800 | $18,000 | 54.4% | 27d |
| moneymindset.mike | 310K | 5.1% | 2.5% | 2.04x | $22,000 | $30,000 | 73.3% | 28d |
| gamingloops | 58K | 5.4% | 3.5% | 1.54x | $3,400 | $4,500 | 75.6% | 29d |
| comedyreelsdaily | 152K | 8.1% | 2.5% | 3.24x | $6,200 | $14,000 | 44.3% | 30d |
| petitekitchen | 32K | 4.9% | 3.5% | 1.40x | $1,850 | $2,600 | 71.2% | 31d |
| travelwiththeo | 18K | 4.2% | 3.5% | 1.20x | $640 | $1,600 | 40.0% | 33d |
| diyhomehacks | 6.5K | 3.8% | 5.0% | 0.76x | $120 | $450 | 26.7% | 35d |

五个可量化缺陷：

1. **时间聚合**：8 条 age 26–35 天，跨度仅 9 天；默认 `latest` 排序下第一页即全部库存。
2. **ER 与自有基准背离**：`TIER_ER_BENCHMARK`（nano 5.0 / micro 3.5 / mid 2.5）下 7 条为 1.2–3.2 倍，唯一低位 0.76x 出现在粉丝最少的账号——与真实规律（小号 ER 更高）相反。
3. **tier 手写**：`tierFromScore()` 按 10 维得分（S85/A70/B55/C40/D25/E10）产出，但种子直接写死字母。用户回估值页重跑同一账号时 tier 与卡片不一致。
4. **叫价无规则**：叫价/中值 26.7%–75.6%；其中 `diyhomehacks`（$120 < 下限 $250）、`travelwiththeo`（$640 < 下限 $900）低于自身估值下限。`snapshot_evaluated_at` 全部等于 `created_at`。
5. **卡片无可比维度**：每卡仅 4 个字段（粉丝/ER/估值/叫价），无赛道、无播放量、无挂牌天数、无浏览数，6 张卡结构完全一致。

Sell 页现状：`max-w-2xl` 单列，第一屏只有 1 个输入框 + 1 个按钮；无价值证明、无报价锚点、无流程说明、无 FAQ；且 `$3.99` 报告门槛直到提交表单才暴露。

## 2. 目标与非目标

**目标**

- 卡片上的每个数字与用户自行估值的结果**完全一致**（同一引擎产出）。
- 库存的时间、规模、指标分布呈现真实市场形态。
- 卖家进入 `/sell` 第一屏即可判断“值不值得卖、大概能卖多少”。

**非目标**

- 不做真实交易闭环、不做资金托管（沿用 2026-10-17 spec 的纯信息撮合定位）。
- 不做浏览量/收藏的实时写入链路（本次仅静态派生字段）。
- 不改动 `/marketplace/[id]` 详情页与 `/marketplace/my` 的核心逻辑。

## 3. 数据层设计

### 3.1 新增字段（幂等 ALTER）

```sql
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS is_sample BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS sold_price_usd INTEGER;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS price_previous_usd INTEGER;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS price_changed_at TIMESTAMPTZ;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS watcher_count INTEGER NOT NULL DEFAULT 0;
```

语义：

| 字段 | 含义 | 生成规则 |
|---|---|---|
| `is_sample` | 样例挂牌（虚构账号） | 种子数据为 TRUE；真实挂牌为 FALSE |
| `sold_price_usd` | 成交价（仅 sold 行） | `ask × U(0.88, 0.96)`，且落在 `[low × 0.75, high]` 内 |
| `price_previous_usd` | 降价前的叫价 | ~35% 的 active 行有一次降价：`previous = ask × U(1.15, 1.45)` |
| `price_changed_at` | 降价时间 | `created_at + U(3, 20)d`，须早于现在 |
| `view_count` | 详情浏览数 | 按 price 与 age 派生：`≈ U(8,40) × daysOnMarket^0.8`，上限 2,400 |
| `watcher_count` | 收藏数 | `≈ view × U(0.04,0.09)`，向下取整 |

### 3.2 生成脚本 `scripts/seed-marketplace-v2.mts`

运行：`npx vite-node scripts/seed-marketplace-v2.mts`（Node 22 + 项目内已装 vite-node）。

结构：

1. `mulberry32(seed)` 决定论随机；seed 固定为常量，保证任意机器重跑结果一致。
2. 账号画像池：20 个赛道 × 每个赛道 2–3 个 handle 模板，构成 42 条（34 active / 8 sold）。
3. 每条画像 → 构造 `RawProfile`（`username/nickname/followerCount/followingCount/totalLikes/videoCount/region/bio/posts`）→ 调用 `scoreProfile(profile)`。
4. 从返回的 `Evaluation` 取：`tier`、`businessValue.totalValue.{low,mid,high}`、`metrics.engagementRate`、`profile.followerCount`、`income.monthlyTotal`。
5. **禁止手写上述任何数值**；唯一手写的只有画像参数（粉丝量级、赛道、语域）。
6. `ask`、`sold_price`、`views`、时间戳按 3.3 规则派生。
7. 幂等：固定 id 清单 + `ON CONFLICT (id) DO UPDATE`；先删旧 demo id（复用现有 `LEGACY_MAP` 思路）。

### 3.3 派生规则（必须满足）

| 维度 | 规则 | 目的 |
|---|---|---|
| 规模 | 42 条：34 active / 8 sold | 脱离“8 条即全站” |
| 粉丝 | 对数分布 6.5K–1.4M，五档（nano/micro/mid/macro/mega）均 ≥4 条 | 覆盖真实量级谱 |
| ER | 按层级基准做分位抽样：nano 0.9–2.2x、micro 0.8–1.8x、mid 0.7–1.5x、macro/mega 0.6–1.2x；**强制 ≥6 条落在 <1.0x** | 打破“全员优秀” |
| 时间 | 前 240 天幂律抽样（0–30d 35%、30–90d 40%、90–240d 25%）；**同一日 ≤2 条** | 时间自然分散 |
| 叫价 | `ask = round(mid × U(0.55,0.85))`，且**强制 `ask ≥ low × 0.9`** | 消除低于估值下限 |
| 估值时点 | `evaluated_at = created_at − U(1,14)d`；~12% 行 >60 天（标 stale） | 估值新鲜度可变 |
| 描述 | 4 种语域，40–480 字符，含具体数字（播放/合作/Shop GMV）；~15% 含卖家口吻（“no lowballers”“escrow only”） | 打破模板同构 |

### 3.4 样例挂牌的合规处理（必须）

虚构账号的联系方式是假邮箱，若仍允许 `$3.99` 解锁，买家付款后无法联系——信任与合规风险。因此：

- 种子行 `is_sample = TRUE`。
- 卡片与详情页显示低调标记 `Sample listing`。
- **`is_sample` 行禁止发起 unlock**：`/api/marketplace/unlock` 前置校验，命中则返回 `SAMPLE_LISTING` 并提示“示例挂牌，仅供了解市场行情”。
- 真实挂牌（`is_sample = FALSE`）解锁逻辑不变。

## 4. 卡片层设计

`ListingCard` 改为三层结构：

```
@handle  [赛道标签]                      [tier 徽章]
粉丝 · ER（含基准对照）· 近 30 天播放 · 估值区间
────────────────────────────────────────
$ASK   [−27% vs valuation]              [days on market]
估值新鲜度 · 浏览 N · 收藏 M
```

要点：

- **ER 基准对照**：`ratio = ER / TIER_ER_BENCHMARK[tier]`；≥1.3 绿（`#047857`）、0.9–1.3 灰、<0.9 暗橙（`#b45309`）。帮助买家一眼判断“高互动/互动偏弱”。
- **折扣标签**：`pct = round((ask - mid) / mid * 100)`；负值显示 `−27% vs valuation`，正值显示 `+12% premium`。
- **days on market**：`floor((now - created_at) / 1d)`；>60 天显示 `72d on market · slow`。
- **估值新鲜度**：`evaluated_at` 距今 >60 天显示 `Stale · 74d`，否则 `Valued 6d ago`。
- 新增 `Sample listing` 小标（仅 `is_sample`）。

## 5. 排序与筛选

- 排序新增：`deal_desc`（`(mid - ask)/mid` 降序）、`fresh`（`evaluated_at` 降序）。保留 `latest / valuation_desc / valuation_asc / followers_desc`。
- 筛选新增（URL query，服务端 SQL）：`niche`（赛道，来自 profile 分类）、`price` 四档（`<1000 / 1000-10000 / 10000-50000 / >50000`）。
- `listActiveListings` 增加可选 filter 参数，四种排序各写显式 SQL（沿用 neon 模板不可内联 ORDER BY 的既有约束）。

## 6. Sell 页设计

保留既有两段路由（`/sell` 无参数 → username gate；`?username=` → 表单），但在 gate 之前插入价值层，并把报价锚点接入表单。

1. **Hero（第一屏）**
   - 标题 + 一句副标题（“你的账号已经有估值，只差一个买家”）。
   - 三个来自库里的真实数字：`active 挂牌数`、`中位成交折扣`（sold 行 `sold_price/valuation_mid` 中位数）、`中位成交天数`。
   - 用户名输入框（复用现有 `UsernameGate` 逻辑）。

2. **报价锚点（输入 handle 且 eligible 后）**
   - 展示该账号估值区间卡（现有 snapshot 卡保留并强化）。
   - 新增 **建议报价滑杆**：55%–100% of `mid`，实时显示 `ask` 绝对值、`vs valuation` 折扣百分比、以及按折扣推算的“预估成交周期”（用 sold 行折扣-天数简单回归，展示为区间）。
   - 滑杆值可一键填入下方 `askingPriceUsd` 输入。

3. **信任与流程（表单上下各一段）**
   - 四步流程：估值 → 定价 → 留下联系方式 → 买家直接联系。明确“平台不经手货款”。
   - 费用前置说明：挂牌需已有 `$3.99` 完整报告；挂牌本身免费；解锁方付费。
   - FAQ 6 条（`<details>`）：挂牌收费吗 / 能否保留品牌与内容 / 多久能成交 / 买家是谁 / 能否随时撤回 / 怎么收款。

4. **底部**
   - “看看现在在卖什么” → 3 张真实（`is_sample = FALSE` 优先）挂牌卡 + 链接 `/marketplace`。

`max-w-2xl` → `max-w-4xl`，Hero 与表单两栏（移动端单列）。

## 7. 验收标准（可执行断言）

数据层（脚本自检输出，纳入 `npm run test` 之外的独立校验）：

1. `COUNT(*) = 42`；`is_sample = TRUE` 全覆盖。
2. `created_at` 覆盖 ≥ 200 天；同一自然日 ≤ 2 条。
3. ER/基准比值：`<1.0x` ≥ 6 条，`>1.5x` ≤ 10 条。
4. 五档粉丝层级各 ≥ 4 条。
5. 所有 `status='active'` 满足 `ask >= low * 0.9`。
6. 抽查 3 条：`scoreProfile(画像)` 结果与库中 `tier`、`totalValue.low/mid/high` **完全相等**（0 误差）。
7. 首屏 24 张卡估值跨度 ≥ 3 个数量级。
8. `sold` 行全部具备 `sold_price_usd`，且 `low*0.75 <= sold_price <= high`。

展示层：

9. 卡片 ER 三色分级在真实数据下三档均出现。
10. `deal_desc` 排序结果与手工计算折扣顺序一致（抽查 5 条）。
11. `is_sample` 行 unlock 接口返回 `SAMPLE_LISTING` 且不产生 Creem Checkout。

工程：

12. `npx tsc --noEmit` = 0；`npm run build` 成功且无 error/warning；`npx vitest run` 全绿。
13. `/marketplace`、`/sell`、`/sell?username=…` 真实浏览器截图无破版。

## 8. 风险

| 风险 | 处理 |
|---|---|
| 样例数据被当成真实库存 → 买家付费解锁假联系方式 | `is_sample` + 禁用 unlock + 卡片标记（3.4） |
| 生成器与引擎漂移（引擎改公式后库存不再自洽） | 脚本每次运行都重算，不缓存数值；CI 断言第 6 条 |
| 42 条仍显少，随时间又变旧 | 脚本支持 `--seed` 与相对当前时间生成；文档注明“每月重跑” |
| 筛选改动引入 SQL 拼接风险 | 仅允许枚举白名单映射，禁止字符串插值 |
| ER 人为低于基准导致 tier 集体下滑、看起来“全是差号” | 分布约束：<1.0x 仅 6–8 条，其余落在 0.9–1.5 区间主体 |

## 9. 实施顺序

1. DB 迁移（3.1）+ `marketplace-db.ts` 字段读写投影。
2. `seed-marketplace-v2.mts` + 自检断言（第 7 节 1–8）。
3. `ListingCard` 三层改版 + 排序/筛选。
4. `SellClient` 三段式重构（Hero / 滑杆 / 流程 FAQ）。
5. unlock 接口 `is_sample` 拦截。
6. 全量验证（第 7 节 9–13）。
