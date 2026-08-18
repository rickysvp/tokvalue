# UTM 归因实施记录（P1）

日期：2026-08-18

## 目标
实现「渠道 → 访问 → 免费评估 → 付费」全链路归因，补齐此前只靠 referrer 归因、无法区分付费推广渠道的盲区。

## 实施内容

### 1. 新增 lib/utm.ts（客户端采集）
- `captureUtm()`：首次访问时从 URL query 解析 utm_source/medium/campaign/content/term，写 sessionStorage（key `tokvalue_utm`，7 天 TTL，覆盖不叠加）
- `getUtm()`：读取当前会话 utm（过期自动清除），返回 Partial 对象
- 用 sessionStorage 而非 localStorage：utm 语义是"本次会话从哪来"，跨标签页复用会污染归因

### 2. 客户端埋点携带 utm
- `PageViewTracker.tsx`：page_view 事件 metadata 带 utm（同时调用 captureUtm 采集）
- `EvaluatePage.tsx`：trackEvent 合并 utm；两处 /api/evaluate 请求 body 带 utm
- `HomePageClient.tsx` / `PaidWall.tsx` / `VerifyEmailModal.tsx`：checkout 请求 body 带 utm
- `VerifyEmailModal.tsx`：verify-code 请求 body 带 utm

### 3. 服务端透传
- `app/api/evaluate/route.ts`：读 body.utm，evaluate_start / evaluate_done 事件 metadata 合并 utm（新增 withUtm 辅助函数）
- `app/api/checkout/route.ts`：读 body.utm，storePendingPurchase 带 utm，Creem metadata 加 utm（JSON 字符串），checkout_start 事件带 utm
- `app/api/auth/verify-code/route.ts`：读 body.utm，storePendingPurchase + Creem metadata + checkout_start 均带 utm
- `app/api/stripe/webhook/route.ts`：从 Creem metadata 回读 utm（JSON.parse），checkout_success 事件带 utm
- `app/api/credits/claim/route.ts`：从 pending.utm 读 utm，credit_claim 事件带 utm

### 4. 存储层
- `lib/credits-server.ts`：PendingPurchase 接口加 utm?；pending_purchases 表加 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS utm JSONB`；storePendingPurchase 写 utm；getPendingPurchase 读回 utm（兼容 string/object 两种形态）

### 5. 后台看板
- `lib/analytics.ts`：新增 `getUtmAttribution(days)`，按 utm source+medium 聚合 page_view 访客数与 checkout_success 付费数，campaign 单独维度
- `app/api/tiktokmaster/stats/route.ts`：接入 getUtmAttribution
- `app/tiktokmaster/dashboard/page.tsx`：转化漏斗卡片后新增「UTM 归因」卡片（展示渠道访客 + 付费数）

## 验证
- tsc 零错误
- Vitest 59/59 通过
- next build 生产构建成功（Middleware 34.3 kB）

## 备注
- checkout_success 与 credit_claim 是双路径到账，归因只取 checkout_success（首次发放 granted=true 才埋点），避免重复计数
- pending_purchases 的 utm 字段迁移在 initPendingTable 首次调用时自动执行，无需手工 ALTER
