# 推荐佣金 P0 核心闭环 — 实施留档

## 目标
推荐人通过专属链接 `?ref=<CODE>` 带新用户成交，得成交额 **40% 佣金**（现金记账 USD，USDC 提现二期做）。退款保护期 60 天。

## 已拍板决策（5 项）
1. 佣金形式：现金记账 + USDC 提现（仅 USDC，非 PayPal）
2. 退款保护期：60 天（覆盖 Creem 官方退款窗口）
3. 自购禁止：referrer === buyer 跳过
4. 推荐码：系统随机生成（6 位，去易混淆字符 0/O、1/I/L）
5. USDC 门槛：首次 $50 / 后续 $100（二期）

## 本次改动（未推送，本地已验收）

### 新增 `lib/referral.ts`（核心，Neon 持久化）
- 表：`referral_codes`（code PK / email / created_at）、`referral_commissions`（id / code / referrer_email / buyer_email / payment_id UNIQUE / order_id / package_id / amount / commission / status / settled_at / created_at）
- `getOrCreateReferralCode(email)`：已有码返回、无码 INSERT ON CONFLICT(code) DO NOTHING RETURNING 抢唯一码
- `resolveReferralCode(code)`：码 → email
- `createCommission({...})`：自购拦截 + payment_id 幂等（ON CONFLICT DO NOTHING），佣金 = amount × 0.4
- `voidCommission(paymentId)` / `voidCommissionByOrder(orderId)`：pending → voided
- `settleDueCommissions()`：惰性结算，`created_at <= NOW() - 60 days` 且 pending → settled
- `getCommissionOverview(email)`：惰性结算 + 汇总 settled/pending/voided + 明细

### 修改
- `lib/utm.ts`：UtmParams 加 `ref?`，`parseFromUrl` 读 `?ref=`（大写 + 截断 32）
- `app/api/stripe/webhook/route.ts`：
  - checkout.completed 的 grantCredits 成功（granted=true）后 → resolveReferralCode(ref) → createCommission（写 pending，含 order_id）
  - refund.created → voidCommission（checkout.id 幂等键）
  - 新增 dispute.created 分支 → voidCommissionByOrder（transaction.order）
- `app/api/referral/route.ts`（新增）：鉴权后返回佣金概览
- `app/referral/page.tsx` + `layout.tsx`（新增）：推荐链接展示 + 复制 + 余额卡片（settled/pending/totalEarned）+ 明细列表
- `components/UserMenu.tsx`：下拉菜单加「Referral Program」入口（Share2 图标，粉）
- `lib/i18n/dictionaries/en.ts`：新增 `nav.referral` + 完整 `referral` 词典域（26 键）

## ref 透传链路（复用现有 utm 链路，前端零改动）
```
?ref=CODE → captureUtm() 存 sessionStorage（tokvalue_utm，含 ref，7 天 TTL）
→ checkout body 带 utm（含 ref）→ storePendingPurchase + Creem metadata
→ webhook 回读 metadata.utm → JSON.parse → utm.ref → resolveReferralCode → createCommission
```
关键：`getUtm()` 返回的对象已含 `ref`，checkout 三处前端调用点（HomePageClient/PaidWall/VerifyEmailModal）已 `getUtm()` 透传，无需改前端。

## Creem webhook 事件结构核实（curl 官方文档）
- checkout.completed：`object.id`=checkout id、`object.order.id`=order id
- refund.created：`object.checkout.id`、`object.refund_amount`（最小货币单位）
- dispute.created：无 checkout id，`object.transaction.order`=order id（用 order_id 撤销）

## 验证
- tsc 零错误
- 59/59 vitest 全过
- 生产 build 成功，`/referral` 静态路由生成（4.99 kB，First Load 123 kB）

## 未做（二期/后续）
- USDC 提现（referral_payouts 表 + BSC 地址校验 + $50/$100 门槛）
- 防刷（佣金上限、异常下单风控）
- 已 settled 佣金在保护期后被 chargeback 的追索（当前只 void pending）
