# 转化漏斗埋点 + 后台看板（P0）— 2026-08-18

## 目标
补齐「升级点击 → 结账 → 支付成功」中间漏斗盲区，后台可视化转化漏斗。

## 改动

### 1. 4 个服务端事件埋点
| 事件 | 位置 | 去重策略 |
|---|---|---|
| checkout_start | app/api/checkout/route.ts + app/api/auth/verify-code/route.ts | — |
| checkout_success | app/api/stripe/webhook/route.ts grantCredits 后 | granted 布尔（仅首次发放） |
| credit_claim | app/api/credits/claim/route.ts claimPendingPurchase 后 | — |
| share_create | app/api/share/route.ts createShare 后 | — |

### 2. grantCredits 返回值改造
- 原 `Promise<CreditBalance>` → `Promise<{ balance: CreditBalance; granted: boolean }>`
- `granted` 由 credit_grants 幂等抢锁的 `INSERT ... ON CONFLICT DO NOTHING RETURNING` 判定
- webhook 重试 / claim 重放 → granted=false，不重复埋 checkout_success
- 调用点同步更新：verify-code(DEV 发放)、claimPendingPurchase、webhook

### 3. EventType 扩展
lib/analytics.ts 新增 4 个类型：checkout_start / checkout_success / credit_claim / share_create

### 4. 后台漏斗看板
- lib/analytics.ts 新增 getFunnel(days)：5 阶段聚合
  - free_evaluate / upgrade_click / checkout_start / checkout_success(与 credit_claim 取 max) / 复购(consume>1)
- app/api/tiktokmaster/stats/route.ts 接入 funnel 字段
- app/tiktokmaster/dashboard/page.tsx conversion tab 加漏斗条形图

## 定位声明
4 事件是「漏斗事件」，不算收入。收入口径仍以 Creem 账单为准（「收款事件停写」决策不动）。

## 验证
- tsc 零错误
- 生产 build 成功
- vitest 59/59 通过

## 未完成
P1（utm 归因）、P2（分享飞轮主动引导）
