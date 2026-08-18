# 统一健康分与风险信号阈值口径（方案C）

日期：2026-08-18（commit `cc3656a`，已推送 main）

## 问题

用户报告：有些账号「评估结论摘要」里提示账号健康不佳（health 35 分），但下方「风险信号」却一片空白，逻辑自相矛盾。

## 根因

`scoreHealth`（健康分）和 `detectRisks`（风险检测）用了**两套完全不同的阈值体系**：

| 信号 | scoreHealth（层级化） | detectRisks（全局固定，旧） |
|---|---|---|
| 互动率 | nano 基准 5%×0.5=2.5% 扣分 | 全部层级 `<0.5%` 才标 high |
| CV 波动 | nano 基准 0.6×1.5=0.9 扣分 | 全部层级 `>2.0` 才标 medium |
| 粉关比 | `<0.1` 扣 15 | 只用 `<0.05` 标 high（0.1 档未接） |

所以小号（nano/micro）互动率 1.8% 时：scoreHealth 扣分 → 健康分掉到 35；但 detectRisks 用全局 0.5% 阈值 → 不标任何风险。

**第二个隐藏根因**：CV 口径不一致。`metrics.cvPlays` 用**全量帖 CV**（被 archive 历史爆款污染到 3.19/4.13），而 detectRisks 用**成熟帖 CV**（0.84/0.46 正常）。同一账号 scoreHealth 看到「流量极不稳定」，detectRisks 看到「正常」。

## 修复（方案C：单一事实源 + 层级化）

1. **`TIER_ER_BENCHMARK` / `TIER_CV_BENCHMARK` 抽到 config.ts**，成为唯一基准源。
2. **detectRisks 互动率层级化**：
   - `er < 该层基准×0.3` → high「Suspected Bot Followers」
   - `er < 该层基准×0.5` → medium「Low Engagement」
3. **detectRisks CV 层级化**：
   - `CV > 该层基准×2.0` → medium「Erratic Traffic」
   - `CV > 该层基准×1.5` → low「Play Volatility」
4. **`metrics.cvPlays` 改用成熟帖 CV**（`classified.mature.length >= 3 ? calcMaturePlayCV : cvAll`），与 detectRisks 完全同源。

## 效果

- 全库 34 条重算后：**所有 `health < 40` 的账号都有对应风险信号，零矛盾**。
- 消除矛盾后，几个账号的估值因新增风险折损而下降（如 @w7ch.0 $150K→$127K，其成熟帖 CV 被正确识别为波动风险）。

## 设计原则

- **单一事实源**：基准值只定义一次，scoreHealth / detectRisks / scoreEngagement / scoreAuthenticity 全部引用同一常量。
- **健康分低 ⟺ 必有风险信号**：这是方案 C 的核心目标，保证前端「结论摘要」与「风险列表」永远自洽。
- **层级化一致**：小号要求更严（互动率基准更高），大号宽松，但风险判定与健康扣分共用同一层级基准。
