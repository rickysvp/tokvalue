# 估值算法修复：断更号互动率失真 + 发帖频率骤降扣分

日期：2026-08-18（commit `1efb779`，已推送 main）

## 背景

上轮修复了「均值被爆款污染」问题（@w7ch.0 从 $108万 → $15万），但用户继续发现 @i.am_natsuki_ 类**断更号**估值仍虚高（tier S / $507K），且点赞数「异常」。逐条核对帖子后确认点赞数正常，真正的 bug 是**统计口径错误**。

## 根因链（三个叠加 bug）

### 1. 互动率小样本失真（核心）

@i.am_natsuki_ 是 225 万粉账号，但近 30 天只发了 2 条帖（断更中）。

- **模型算的互动率**：11.44%（只用 2 条 mature 帖，冷启动低播 9万但互动 1万 → 互动率虚高）
- **真实互动率**：5.10%（全部 29 条帖：互动 68.4万 / 播放 1340万）

`computeMetrics` 的 `engagementRate` 只取 `mature+growing`（近 30 天）帖，断更号这几条冷启动帖互动率剧烈波动，把账号真实互动水平顶到虚高。导致 **engagement=100、authenticity=100、influence=100** 三个维度全部满分，把断更号顶到 S 级。

### 2. 维度口径不统一

`scoreEngagement` **不读** `metrics.engagementRate`，而是自己从 `maturePosts+growingPosts` 重新算互动率——与 `scoreAuthenticity`/`scoreInfluence` 用的 `metrics.engagementRate` 口径不一致。所以只在 `computeMetrics` 里修没用，`scoreEngagement` 依旧失真。

### 3. 发帖频率骤降未传导到评分

`detectRisks` 虽已标 `Recent Posting Decline`（medium），但 `scoreStability` 只吃 `daysSinceLastPost`（natsuki 最近发帖 4 天前，未超 30 天阈值不扣分），导致断更信号只进 riskFlags 不进分数。

## 修复（3 文件）

1. **lib/scoring.ts — computeMetrics**：mature+growing 帖 < 3 条时，`engagementRate` 回退用全量帖子互动率（`allProfileInteractions / allProfilePlays`），消除小样本失真。

2. **lib/scoring/dimensions.ts — scoreEngagement**：新增 `engagementRateOverride?` 参数，`relevant.length < 3` 时用外部传入的全量互动率；调用点传入 `metrics.engagementRate`，三处口径统一。

3. **lib/scoring/dimensions.ts — scoreStability**：新增 `archiveCount`/`recentPostCount` 参数，`archiveCount >= 10 && recentPostCount <= 2`（历史密集发帖但近 30 天停更）扣 20 分；`computeDimensions` 的 classified 传入 archive。

4. **lib/scoring/metrics.ts — calcEffectivePlays**（前段已加，本段确认）：断更号 mature 帖不足时，用 archive 历史中位数 ×0.55 兜底，避免「真实 30 万触达被 2 条冷启动帖拉到 4.5 万」误判僵尸粉。

## 验证

- `tsc --noEmit` 零错误
- Vitest 59/59 通过（verdict 10 + dimensions 23 + valuation 10 + scoring 16）
- 全库 34 条重算写库完成（估值不变——因为 natsuki 是 mega 号，5.1% 互动率仍远超 mega 基准 1.2%，维度仍满分；但 `engagementRate` 字段本身从失真 11.44% 修正为 5.10%）

## 遗留观察

mega/macro 号的维度基准极低（TIER_ER_BENCHMARK mega 1.2%），导致头部账号 engagement/authenticity/influence 等维度极易满分。这是「层级化宽松」的刻意设计（大号不惩罚），但副作用是断更号也能拿到 S 级 tier。后续如需进一步压降断更号 tier，应从 `scoreStability` 加大扣分权重或让 `Recent Posting Decline` 触发 tier 降级。
