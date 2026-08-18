# 推荐佣金方案设计定稿

## 任务
用户要求做推荐佣金（referral commission）：A 推荐 B 购买积分，A 得成交额 40% 佣金，前提是 B 不退款。

## 用户拍板的 5 项决策
1. 佣金形式：**C — 现金记账，仅支持 USDC 提现**（提现系统二期做）
2. 退款保护期：**60 天**（我去核实了 Creem 官方文档）
3. 自购：**禁止**（referrer === buyer 跳过佣金）
4. 推荐码：**系统随机生成**（email 绑定）
5. USDC 提现门槛：**首次 $50，之后每次 ≥$100**

## Creem 退款窗口核实结论（关键）
官方文档 docs.creem.io/merchant-of-record/finance/refunds-and-chargebacks：
- Creem 保留在**购买后 60 天内**退款的权利（即使商家设 no-refund）
- 客户可**随时**发起 chargeback（卡组织争议窗口通常 120 天内）

→ 保护期 60 天是「覆盖 Creem 退款窗口」的稳妥下限；要更保守可 90 天。

## 架构要点
- 复用现有 utm 采集链路新增 `ref` 参数：`?ref=<推荐码>` → sessionStorage → checkout body → pending → Creem metadata → webhook 回读
- 新表 `referral_codes`（code 主键 + email）+ `referral_commissions`（payment_id 唯一幂等键，status pending/settled/voided）
- 佣金写入位置：webhook `checkout.completed` 的 grantCredits 成功后（唯一能同时看到支付+退款事件的入口），幂等键 checkout_id
- 退款撤销：webhook `refund.created` → 置 voided
- 保护期 60 天到期（cron 惰性结算）settled 后才可提现

## 交付物
- docs/referral-commission-design-2026-08-18.md（方案完整文档，已定稿）

## 状态
设计阶段完成，决策全部拍板。尚未写代码（等用户确认后开工 P0）。
