# 转化漏斗 + 分享飞轮诊断（方向 2/3）— 2026-08-18

## 结论概览
- 方向 2（转化漏斗）：问题真实存在，但证据 3 处需修正
- 方向 3（分享飞轮）：完全属实

## 方向 2 逐条核实

### 埋点现状（读 checkout/webhook/claim/track/analytics 六文件）
| 事件 | 现状 |
|---|---|
| upgrade_click | ✅ 已有（EvaluatePage.tsx:200，track 白名单含） |
| paywall_view / paywall_click | ✅ 已有 |
| checkout_start | ❌ 缺（checkout/route.ts 只 storePendingPurchase） |
| checkout_success | ❌ 缺（webhook grantCredits 后仅 console.log，「收款事件已停写」是有意决策） |
| credit_claim | ❌ 缺（claim 路由「收款事件已停写」） |
| share_create | ❌ 缺（share/route.ts POST 无 recordEvent） |

### 归因现状
- referrer 归因：✅ 已有（normalizeReferrer + getTrafficSources 按 referrer 聚合）
- utm 归因：❌ 无（全站无 utm_source/utm_medium/campaign）

### 转化率现状
- 「免费评估→付费」粗粒度能算：getConversionByDay 用 free_evaluate（analytics）+ credit_balances.purchases（paid）
- 缺「升级点击→结账→支付成功」中间细粒度漏斗

### 实施避坑
1. checkout_success 定位为漏斗事件，别碰收入口径（营收以 Creem 账单为准）
2. webhook/claim 双路径发放，checkout_success 只在 webhook grantCredits 首次成功处埋，或按 checkoutId 去重

## 方向 3 核实
- ShareCardModal（免费分享图）+ ShareModal（付费 link）均在，结果页有入口
- 缺口：评估完成后的主动引导时机缺失（分享是被动等用户点）
- share_create 无埋点

## 待办
用户拍板是否按「漏斗事件」定位实施方向 2 + 方向 3。
