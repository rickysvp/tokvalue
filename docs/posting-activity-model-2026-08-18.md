# 通用发布活跃度模型（断更号降级 + 估值折损）

日期：2026-08-18（commit `ea68f7d`，已推送 main）

## 需求

用户要求：断更号判定标准应为「近 30 天更新 < 4 条」，且断更号应影响价值评估并降级。**强调用标准通用模型算法，而非针对某几个账号做补丁**。

## 方案：统一 POSTING_ACTIVITY 模型

新增 `lib/scoring/config.ts` 的 `POSTING_ACTIVITY` 常量，作为单一事实源，贯穿三处逻辑：

```ts
export const POSTING_ACTIVITY = {
  dormantMaxRecentPosts: 4,   // 近 30 天发帖数 < 4 → 断更
  minArchiveForDormancy: 4,   // 历史发帖 ≥ 4 → 才判「断更」（区分老号停更 vs 新号冷启动）
  activeMinRecentPosts: 4,    // 近 30 天 ≥ 4 → 完全无断更风险
}
```

### 三处联动

1. **detectRisks（风险标注）** — `lib/scoring.ts`
   - `recentPostCount < 4` 且 `archive.length >= 4` → `Posting Hiatus`（**high** 风险）
   - `recentPostCount < 4` 但历史帖不足 → `Insufficient Recent Activity`（**medium**，不误伤新号冷启动）

2. **tierFromScore（降级）** — `lib/scoring/verdict.ts`（既有逻辑，无需改）
   - high 风险自动降一级（S→A、A→B…），断更号因此自动降级

3. **scoreStability（维度扣分）** — `lib/scoring/dimensions.ts`
   - 断更（archive ≥ 4 且 recent < 4）扣 25 分；仅 recent < 4 扣 10 分

### 估值折损（既有链路自动生效）

断更号标 high 风险后，`calcRiskDiscount`（valuation.ts）自动返回 `RISK_DISCOUNT.high = 0.4`，对全部 5 个估值组件（品牌年收入/内容资产/粉丝资产/变现能力/IP 资产）统一折损 60%。

## 之前的问题

旧逻辑是 `archive.length >= 10 && recentPostCount <= 2`（medium 风险），是「针对 natsuki 这种『历史发帖密集 + 近 30 天完全停更』」的窄口径补丁，阈值硬编码且不降级。新模型把口径放宽到通用标准（<4 条即断更，历史 ≥4 条即老号），并把级别从 medium 提到 high 以触发降级。

## 验证

- `tsc --noEmit` 零错误
- Vitest 59/59 通过（verdict 10 + dimensions 23 + valuation 10 + scoring 16）
- 全库 34 条重算写回，效果：

| 账号 | 粉丝 | 变化 | 风险 |
|---|---|---|---|
| @i.am_natsuki_ | 225万 | S→A，$507K→$282K | Posting Hiatus |
| @power306787878 | 40万 | A→B | Posting Hiatus + Erratic Traffic |
| @susu10060 | 1.5万 | B→C | Posting Hiatus |
| @airlandolists | 210万 | 不变（活跃号） | 无 |

## 关键设计决策

- **新号冷启动不误伤**：用 `minArchiveForDormancy = 4` 区分「老号停更」和「新号还没积累历史」，后者只标 medium 不降级。
- **阈值统一为常量**：三处逻辑引用同一 `POSTING_ACTIVITY`，后续调参只改一处。
- **降级靠既有 high 风险机制**：没有在 tierFromScore 里加断更专属分支，而是让断更成为 high 风险的一种，复用「high 风险降一级」的通用规则。
